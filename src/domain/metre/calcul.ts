import { Decimal, dec, arrondiCommercial, type EntreeDecimale } from '../money/decimal'

/**
 * Métré — calcul d'une quantité à partir de ses mesures.
 *
 * Jusqu'ici la quantité d'un ouvrage se tapait à la main : 142,50 m² arrivaient
 * d'une feuille de papier, d'un tableur, ou de nulle part. Le métré la
 * *calcule*, et garde la trace de ce qui a été mesuré. C'est une pièce
 * justificative : quand le maître d'ouvrage demande d'où sortent ces 142,50 m²,
 * la réponse doit exister.
 *
 * Une ligne de métré est un produit : nombre × longueur × largeur × hauteur,
 * chacun facultatif. On ne retient que ce qui est renseigné, comme sur une
 * feuille de métré manuscrite. Une ligne peut être une **déduction** (une baie
 * dans un mur), et elle se retranche.
 *
 * Une ligne peut aussi **rappeler un repère** — un sous-total nommé, calculé
 * ailleurs et réutilisé ici (« surface étage courant »). Le rappel se multiplie
 * comme un facteur de plus : rappeler une surface et donner une hauteur donne
 * un volume.
 */

/** Le poste stocke sa quantité en Decimal(14,3) : on s'aligne dessus. */
export const DECIMALES_QUANTITE = 3

export type TypeLigneMetre = 'MESURE' | 'RAPPEL'

export interface LigneMetre {
  readonly id: string
  readonly type: TypeLigneMetre
  /** Localisation ou objet mesuré : « RDC — mur nord ». */
  readonly libelle: string
  /** Vrai quand la ligne se retranche du total. */
  readonly deduction: boolean
  readonly nombre: EntreeDecimale | null
  readonly longueur: EntreeDecimale | null
  readonly largeur: EntreeDecimale | null
  readonly hauteur: EntreeDecimale | null
  /** Repère rappelé, pour une ligne de type RAPPEL. */
  readonly rappelRepereId: string | null
}

/** Valeur d'un repère, telle que la résolution la livre au calcul. */
export interface ValeurRepere {
  readonly nom: string
  /** Null quand le repère n'a pas pu être évalué (cycle, rappel cassé). */
  readonly valeur: Decimal | null
  readonly degre: number | null
}

export type CodeAnomalieMetre =
  | 'ligne_vide'
  | 'rappel_sans_repere'
  | 'repere_inconnu'
  | 'repere_indisponible'
  | 'valeur_negative'
  | 'unite_incoherente'
  | 'degres_melanges'
  | 'total_negatif'
  | 'cycle_de_reperes'

export interface AnomalieMetre {
  readonly code: CodeAnomalieMetre
  readonly ligneId: string | null
  readonly message: string
}

export interface ResultatLigneMetre {
  readonly ligneId: string
  /** Null quand la ligne n'est pas calculable ; jamais un nombre inventé. */
  readonly valeur: Decimal | null
  /** Nombre de dimensions en jeu : 0 = unité, 1 = ml, 2 = m², 3 = m³. */
  readonly degre: number | null
  readonly ignoree: boolean
}

export interface ResultatMetre {
  readonly lignes: readonly ResultatLigneMetre[]
  /** Null dès qu'une ligne compte mais n'est pas calculable : mieux vaut pas de total qu'un faux. */
  readonly total: Decimal | null
  readonly degre: number | null
  readonly anomalies: readonly AnomalieMetre[]
}

/**
 * Degré dimensionnel attendu d'une unité. Null = pas de contrôle possible :
 * un poids ou une durée ne se déduit pas d'un produit de longueurs.
 */
export function degreAttendu(unite: string | null | undefined): number | null {
  switch (unite) {
    case 'U':
    case 'ENS':
    case 'FORFAIT':
      return 0
    case 'ML':
      return 1
    case 'M2':
      return 2
    case 'M3':
      return 3
    default:
      return null
  }
}

/** L'unité telle qu'on l'écrit dans un message : « m² », pas « M2 ». */
const NOMS_UNITE: Record<string, string> = {
  M2: 'm²',
  M3: 'm³',
  ML: 'ml',
  U: 'unité',
  ENS: 'ensemble',
  FORFAIT: 'forfait',
  KG: 'kg',
  T: 't',
  H: 'heure',
  J: 'jour',
}

const NOMS_DEGRE: Record<number, string> = {
  0: 'un nombre',
  1: 'une longueur',
  2: 'une surface',
  3: 'un volume',
}

function nomDegre(degre: number): string {
  return NOMS_DEGRE[degre] ?? `un produit de ${degre} dimensions`
}

function valeurOuNull(entree: EntreeDecimale | null | undefined): Decimal | null {
  if (entree === null || entree === undefined) return null
  if (typeof entree === 'string' && entree.trim() === '') return null
  return dec(entree)
}

/** Une ligne vide est une ligne en cours de saisie : elle ne compte pas. */
export function ligneVide(ligne: LigneMetre): boolean {
  if (ligne.type === 'RAPPEL') return ligne.rappelRepereId === null
  return (
    valeurOuNull(ligne.nombre) === null &&
    valeurOuNull(ligne.longueur) === null &&
    valeurOuNull(ligne.largeur) === null &&
    valeurOuNull(ligne.hauteur) === null
  )
}

interface CalculLigne {
  readonly resultat: ResultatLigneMetre
  readonly anomalies: readonly AnomalieMetre[]
}

function calculerLigne(ligne: LigneMetre, reperes: ReadonlyMap<string, ValeurRepere>): CalculLigne {
  const anomalies: AnomalieMetre[] = []
  const vide = ligneVide(ligne)

  if (vide) {
    if (ligne.type === 'RAPPEL') {
      anomalies.push({
        code: 'rappel_sans_repere',
        ligneId: ligne.id,
        message: 'Rappel sans repère choisi : la ligne est ignorée.',
      })
    }
    return { resultat: { ligneId: ligne.id, valeur: null, degre: null, ignoree: true }, anomalies }
  }

  let produit = new Decimal(1)
  let degre = 0

  if (ligne.type === 'RAPPEL') {
    const repere = reperes.get(ligne.rappelRepereId as string)
    if (repere === undefined) {
      anomalies.push({
        code: 'repere_inconnu',
        ligneId: ligne.id,
        message: 'Repère introuvable : le total ne peut pas être calculé.',
      })
      return { resultat: { ligneId: ligne.id, valeur: null, degre: null, ignoree: false }, anomalies }
    }
    if (repere.valeur === null) {
      anomalies.push({
        code: 'repere_indisponible',
        ligneId: ligne.id,
        message: `Le repère « ${repere.nom} » n’est pas calculable : le total ne peut pas l’être non plus.`,
      })
      return { resultat: { ligneId: ligne.id, valeur: null, degre: null, ignoree: false }, anomalies }
    }
    produit = produit.mul(repere.valeur)
    degre += repere.degre ?? 0
  }

  const nombre = valeurOuNull(ligne.nombre)
  if (nombre !== null) produit = produit.mul(nombre)

  // Seules les dimensions portent le degré ; le nombre est un compte.
  for (const dimension of [ligne.longueur, ligne.largeur, ligne.hauteur]) {
    const valeur = valeurOuNull(dimension)
    if (valeur === null) continue
    produit = produit.mul(valeur)
    degre += 1
  }

  const valeur = arrondiCommercial(produit, DECIMALES_QUANTITE)

  if (valeur.isNegative()) {
    anomalies.push({
      code: 'valeur_negative',
      ligneId: ligne.id,
      message: 'Une mesure négative n’a pas de sens : utilisez la déduction.',
    })
  }

  return { resultat: { ligneId: ligne.id, valeur, degre, ignoree: false }, anomalies }
}

export interface EntreeMetre {
  readonly lignes: readonly LigneMetre[]
  readonly reperes?: ReadonlyMap<string, ValeurRepere>
  /** Unité de l'ouvrage, pour vérifier que les mesures lui correspondent. */
  readonly unite?: string | null
}

/**
 * Calcule le total d'une feuille de métré.
 *
 * Chaque ligne est arrondie au millième AVANT la somme, pour la même raison que
 * le prix unitaire est arrondi avant la multiplication : la feuille imprimée est
 * ce qu'on vérifie, et son total doit être celui de ses lignes affichées.
 */
export function calculerMetre(entree: EntreeMetre): ResultatMetre {
  const reperes = entree.reperes ?? new Map<string, ValeurRepere>()
  const anomalies: AnomalieMetre[] = []
  const resultats: ResultatLigneMetre[] = []

  let total: Decimal | null = new Decimal(0)
  const degresRencontres = new Set<number>()

  for (const ligne of entree.lignes) {
    const { resultat, anomalies: propres } = calculerLigne(ligne, reperes)
    resultats.push(resultat)
    anomalies.push(...propres)

    if (resultat.ignoree) continue
    if (resultat.valeur === null) {
      total = null
      continue
    }
    if (resultat.degre !== null) degresRencontres.add(resultat.degre)
    if (total !== null) {
      total = ligne.deduction ? total.minus(resultat.valeur) : total.plus(resultat.valeur)
    }
  }

  const degre = degresRencontres.size === 1 ? [...degresRencontres][0]! : null

  if (degresRencontres.size > 1) {
    anomalies.push({
      code: 'degres_melanges',
      ligneId: null,
      message: `Ce métré additionne ${[...degresRencontres]
        .sort()
        .map(nomDegre)
        .join(' et ')} : vérifiez les lignes.`,
    })
  }

  const attendu = degreAttendu(entree.unite)
  if (attendu !== null && degre !== null && degre !== attendu) {
    anomalies.push({
      code: 'unite_incoherente',
      ligneId: null,
      message: `Les mesures donnent ${nomDegre(degre)}, alors que l’ouvrage est en ${
        NOMS_UNITE[entree.unite as string] ?? entree.unite
      }.`,
    })
  }

  if (total !== null && total.isNegative()) {
    anomalies.push({
      code: 'total_negatif',
      ligneId: null,
      message: 'Les déductions dépassent les mesures : le total est négatif.',
    })
  }

  return { lignes: resultats, total, degre, anomalies }
}

/** Total reportable dans le poste, ou null s'il n'est pas exploitable. */
export function quantiteReportable(resultat: ResultatMetre): string | null {
  if (resultat.total === null || resultat.total.isNegative()) return null
  return resultat.total.toFixed(DECIMALES_QUANTITE)
}
