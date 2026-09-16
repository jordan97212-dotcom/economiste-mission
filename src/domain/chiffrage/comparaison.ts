import * as Money from '../money/money'
import { dec } from '../money/decimal'

/**
 * Comparaison de deux versions de chiffrage — point 10.4.
 *
 * Un DPGF évolue entre l'avant-projet, le projet et le dossier de consultation.
 * Le suivi de chantier demande l'écart vis-à-vis de l'estimatif initial : sans
 * instantané figé, cet écart n'a pas de référent. Ce module compare deux
 * instantanés et dit où l'argent est passé.
 *
 * La vraie question n'est pas « de combien le total a-t-il bougé », qu'une
 * soustraction suffit à répondre, mais « pourquoi ». Un écart de quarante mille
 * euros entre l'APD et le PRO peut venir d'une ligne dont la quantité a doublé,
 * ou de douze lignes apparues : ce n'est pas le même sujet, et la comparaison
 * doit distinguer les deux.
 *
 * L'appariement des lignes est le point délicat. Il se fait par identifiant, qui
 * survit aux modifications ; à défaut par code d'ouvrage au sein du lot, puis
 * par désignation. Une ligne supprimée puis recréée reçoit un nouvel identifiant
 * : sans ces replis, elle apparaîtrait comme disparue et réapparue, ce qui
 * doublerait faussement l'écart apparent.
 *
 * Fonctions pures : aucune I/O.
 */

/* ------------------------------------------------------------------ */
/* L'instantané                                                        */
/* ------------------------------------------------------------------ */

/** Les montants voyagent en chaînes d'entiers : centimes, ou dix-millièmes. */
export interface LigneFigee {
  readonly posteId: string
  readonly code: string | null
  readonly designation: string
  readonly unite: string | null
  readonly quantite: string | null
  readonly prixUnitaireHtFinal: string | null
  readonly montantHt: string
}

export interface LotFige {
  readonly lotId: string
  readonly numero: string
  readonly intitule: string
  readonly montantEstimeHt: string
  readonly lignes: readonly LigneFigee[]
}

export interface ChiffrageFige {
  readonly version: 1
  readonly montantTceHt: string
  readonly lots: readonly LotFige[]
}

export function estChiffrageFige(valeur: unknown): valeur is ChiffrageFige {
  if (typeof valeur !== 'object' || valeur === null) return false
  const candidat = valeur as Partial<ChiffrageFige>
  return candidat.version === 1 && Array.isArray(candidat.lots)
}

/* ------------------------------------------------------------------ */
/* Le résultat                                                         */
/* ------------------------------------------------------------------ */

export type EtatLigne = 'apparue' | 'disparue' | 'modifiee' | 'inchangee'
export type ChampModifie = 'designation' | 'unite' | 'quantite' | 'prixUnitaire'

export interface LigneComparee {
  readonly etat: EtatLigne
  readonly code: string | null
  readonly designation: string
  readonly quantiteAvant: string | null
  readonly quantiteApres: string | null
  readonly prixUnitaireAvant: string | null
  readonly prixUnitaireApres: string | null
  readonly montantAvantHt: string
  readonly montantApresHt: string
  /** Centimes signés : positif si le montant a augmenté. */
  readonly ecartMontantHt: string
  readonly champsModifies: readonly ChampModifie[]
}

export type EtatLot = 'apparu' | 'disparu' | 'modifie' | 'inchange'

export interface LotCompare {
  readonly numero: string
  readonly intitule: string
  readonly etat: EtatLot
  readonly montantAvantHt: string
  readonly montantApresHt: string
  readonly ecartMontantHt: string
  /** Null quand le montant de départ est nul : un écart relatif n'y veut rien dire. */
  readonly ecartPourcent: string | null
  readonly lignes: readonly LigneComparee[]
}

export interface SyntheseComparaison {
  readonly nbApparues: number
  readonly nbDisparues: number
  readonly nbModifiees: number
  readonly nbInchangees: number
  /** Part de l'écart total portée par les lignes apparues ou disparues. */
  readonly ecartParApparitionHt: string
  readonly ecartParModificationHt: string
}

export interface Comparaison {
  readonly montantAvantHt: string
  readonly montantApresHt: string
  readonly ecartMontantHt: string
  readonly ecartPourcent: string | null
  readonly lots: readonly LotCompare[]
  readonly synthese: SyntheseComparaison
}

/* ------------------------------------------------------------------ */
/* Appariement                                                         */
/* ------------------------------------------------------------------ */

function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Apparie les lignes de deux états d'un même lot.
 *
 * Trois clés successives, de la plus sûre à la plus permissive : l'identifiant,
 * puis le code d'ouvrage, puis la désignation. Une clé n'est retenue que si elle
 * ne désigne qu'une seule ligne de chaque côté — un code en double apparierait
 * n'importe quoi avec n'importe quoi.
 */
function apparierLignes(
  avant: readonly LigneFigee[],
  apres: readonly LigneFigee[],
): { paires: [LigneFigee, LigneFigee][]; seulesAvant: LigneFigee[]; seulesApres: LigneFigee[] } {
  const paires: [LigneFigee, LigneFigee][] = []
  const restantAvant = new Set(avant)
  const restantApres = new Set(apres)

  const apparierPar = (cle: (ligne: LigneFigee) => string | null): void => {
    const indexer = (lignes: Iterable<LigneFigee>): Map<string, LigneFigee[]> => {
      const index = new Map<string, LigneFigee[]>()
      for (const ligne of lignes) {
        const valeur = cle(ligne)
        if (valeur === null || valeur === '') continue
        const liste = index.get(valeur) ?? []
        liste.push(ligne)
        index.set(valeur, liste)
      }
      return index
    }

    const indexAvant = indexer(restantAvant)
    const indexApres = indexer(restantApres)

    for (const [valeur, listeAvant] of indexAvant) {
      const listeApres = indexApres.get(valeur)
      // Ambigu des deux côtés : on préfère ne rien apparier plutôt que d'associer
      // deux lignes au hasard et d'inventer une modification.
      if (!listeApres || listeAvant.length !== 1 || listeApres.length !== 1) continue
      const ligneAvant = listeAvant[0] as LigneFigee
      const ligneApres = listeApres[0] as LigneFigee
      paires.push([ligneAvant, ligneApres])
      restantAvant.delete(ligneAvant)
      restantApres.delete(ligneApres)
    }
  }

  apparierPar((ligne) => ligne.posteId)
  apparierPar((ligne) => (ligne.code ? normaliser(ligne.code) : null))
  apparierPar((ligne) => normaliser(ligne.designation))

  return { paires, seulesAvant: [...restantAvant], seulesApres: [...restantApres] }
}

/* ------------------------------------------------------------------ */
/* Comparaison                                                         */
/* ------------------------------------------------------------------ */

const money = (centimes: string | null | undefined): Money.Money =>
  Money.depuisCentimes(centimes && centimes !== '' ? centimes : '0')

function ecartPourcent(avant: Money.Money, apres: Money.Money): string | null {
  // Partir de zéro et arriver à cent mille n'est pas « plus l'infini pour cent » :
  // c'est une apparition, que le montant dit déjà.
  if (Money.estZero(avant)) return null
  const depart = Money.versEuros(avant)
  return Money.versEuros(Money.soustraire(apres, avant))
    .div(depart.abs())
    .mul(100)
    .toDecimalPlaces(2)
    .toFixed(2)
}

function memeNombre(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return dec(a).equals(dec(b))
}

function comparerLigne(avant: LigneFigee | null, apres: LigneFigee | null): LigneComparee {
  const montantAvant = money(avant?.montantHt)
  const montantApres = money(apres?.montantHt)
  const base = {
    code: apres?.code ?? avant?.code ?? null,
    designation: apres?.designation ?? avant?.designation ?? '',
    quantiteAvant: avant?.quantite ?? null,
    quantiteApres: apres?.quantite ?? null,
    prixUnitaireAvant: avant?.prixUnitaireHtFinal ?? null,
    prixUnitaireApres: apres?.prixUnitaireHtFinal ?? null,
    montantAvantHt: montantAvant.toString(),
    montantApresHt: montantApres.toString(),
    ecartMontantHt: Money.soustraire(montantApres, montantAvant).toString(),
  }

  if (!avant) return { ...base, etat: 'apparue', champsModifies: [] }
  if (!apres) return { ...base, etat: 'disparue', champsModifies: [] }

  const champsModifies: ChampModifie[] = []
  if (normaliser(avant.designation) !== normaliser(apres.designation)) champsModifies.push('designation')
  if ((avant.unite ?? '') !== (apres.unite ?? '')) champsModifies.push('unite')
  if (!memeNombre(avant.quantite, apres.quantite)) champsModifies.push('quantite')
  if (!memeNombre(avant.prixUnitaireHtFinal, apres.prixUnitaireHtFinal)) champsModifies.push('prixUnitaire')

  const bouge = champsModifies.length > 0 || Money.comparer(montantAvant, montantApres) !== 0
  return { ...base, etat: bouge ? 'modifiee' : 'inchangee', champsModifies }
}

/** Clé d'appariement d'un lot : son numéro, qui est ce qui l'identifie au DPGF. */
function cleLot(lot: LotFige): string {
  return normaliser(lot.numero) || normaliser(lot.intitule)
}

/**
 * Compare deux instantanés de chiffrage.
 *
 * L'ordre compte : `avant` est la version de référence, `apres` celle qu'on
 * examine. Un écart positif signifie que le chiffrage a augmenté.
 */
export function comparerVersions(avant: ChiffrageFige, apres: ChiffrageFige): Comparaison {
  const lotsAvant = new Map(avant.lots.map((lot) => [cleLot(lot), lot]))
  const lotsApres = new Map(apres.lots.map((lot) => [cleLot(lot), lot]))
  const cles = [...new Set([...lotsAvant.keys(), ...lotsApres.keys()])]

  const lots: LotCompare[] = []
  let nbApparues = 0
  let nbDisparues = 0
  let nbModifiees = 0
  let nbInchangees = 0
  let ecartApparition = Money.ZERO
  let ecartModification = Money.ZERO

  for (const cle of cles) {
    const lotAvant = lotsAvant.get(cle)
    const lotApres = lotsApres.get(cle)

    const { paires, seulesAvant, seulesApres } = apparierLignes(
      lotAvant?.lignes ?? [],
      lotApres?.lignes ?? [],
    )

    const lignes: LigneComparee[] = [
      ...paires.map(([a, b]) => comparerLigne(a, b)),
      ...seulesApres.map((ligne) => comparerLigne(null, ligne)),
      ...seulesAvant.map((ligne) => comparerLigne(ligne, null)),
    ]

    for (const ligne of lignes) {
      const ecart = money(ligne.ecartMontantHt)
      if (ligne.etat === 'apparue') {
        nbApparues += 1
        ecartApparition = Money.ajouter(ecartApparition, ecart)
      } else if (ligne.etat === 'disparue') {
        nbDisparues += 1
        ecartApparition = Money.ajouter(ecartApparition, ecart)
      } else if (ligne.etat === 'modifiee') {
        nbModifiees += 1
        ecartModification = Money.ajouter(ecartModification, ecart)
      } else {
        nbInchangees += 1
      }
    }

    const montantAvant = money(lotAvant?.montantEstimeHt)
    const montantApres = money(lotApres?.montantEstimeHt)

    const etat: EtatLot = !lotAvant
      ? 'apparu'
      : !lotApres
        ? 'disparu'
        : lignes.some((l) => l.etat !== 'inchangee') || Money.comparer(montantAvant, montantApres) !== 0
          ? 'modifie'
          : 'inchange'

    lots.push({
      numero: lotApres?.numero ?? lotAvant?.numero ?? '',
      intitule: lotApres?.intitule ?? lotAvant?.intitule ?? '',
      etat,
      montantAvantHt: montantAvant.toString(),
      montantApresHt: montantApres.toString(),
      ecartMontantHt: Money.soustraire(montantApres, montantAvant).toString(),
      ecartPourcent: ecartPourcent(montantAvant, montantApres),
      lignes,
    })
  }

  lots.sort((a, b) => a.numero.localeCompare(b.numero, 'fr', { numeric: true }))

  const totalAvant = money(avant.montantTceHt)
  const totalApres = money(apres.montantTceHt)

  return {
    montantAvantHt: totalAvant.toString(),
    montantApresHt: totalApres.toString(),
    ecartMontantHt: Money.soustraire(totalApres, totalAvant).toString(),
    ecartPourcent: ecartPourcent(totalAvant, totalApres),
    lots,
    synthese: {
      nbApparues,
      nbDisparues,
      nbModifiees,
      nbInchangees,
      ecartParApparitionHt: ecartApparition.toString(),
      ecartParModificationHt: ecartModification.toString(),
    },
  }
}
