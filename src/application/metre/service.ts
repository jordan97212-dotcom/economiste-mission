import { Prisma, type PrismaClient } from '@prisma/client'
import {
  calculerMetre,
  quantiteReportable,
  type AnomalieMetre,
  type LigneMetre,
  type ResultatMetre,
} from '../../domain/metre/calcul'
import {
  evaluerReperes,
  valeursDesReperes,
  type RepereAEvaluer,
  type RepereEvalue,
} from '../../domain/metre/reperes'
import { recalculerMission } from '../chiffrage/service'
import type {
  AnomalieMetreDTO,
  LigneMetreDTO,
  LotMetreDTO,
  MetreMissionDTO,
  MetrePosteDTO,
  OuvrageMetreDTO,
  RepereDetailDTO,
  RepereDTO,
  SaisieLigneMetre,
} from '../dto'

export type {
  AnomalieMetreDTO,
  LigneMetreDTO,
  LotMetreDTO,
  MetreMissionDTO,
  MetrePosteDTO,
  OuvrageMetreDTO,
  RepereDetailDTO,
  RepereDTO,
  SaisieLigneMetre,
}

/**
 * Métré — SPEC_APP_ECONOMISTE.md §5.2.
 *
 * Le métré calcule la quantité d'un ouvrage au lieu de la faire taper. Dès
 * qu'un ouvrage porte une feuille de métré, sa quantité en devient le reflet :
 * elle n'est plus modifiable à la main, sans quoi les deux divergeraient sans
 * que personne ne le voie.
 *
 * Les repères — sous-totaux nommés — sont partagés par toute la mission. Un
 * changement de repère se répercute donc sur plusieurs ouvrages, et ce service
 * réévalue toujours l'ensemble : recalculer seulement ce qu'on croit touché,
 * c'est se préparer à des quantités périmées quelque part.
 */

export class PosteIntrouvable extends Error {
  constructor(id: string) {
    super(`Ouvrage introuvable ou hors de la mission : ${id}`)
    this.name = 'PosteIntrouvable'
  }
}

export class RepereIntrouvable extends Error {
  constructor(id: string) {
    super(`Repère introuvable ou hors de la mission : ${id}`)
    this.name = 'RepereIntrouvable'
  }
}

export class MetreInvalide extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetreInvalide'
  }
}

export class RepereEncoreRappele extends Error {
  readonly emplois: readonly string[]
  constructor(nom: string, emplois: readonly string[]) {
    super(
      `Le repère « ${nom} » est encore rappelé par ${emplois.length} feuille(s) de métré : ${emplois.join(
        ', ',
      )}.`,
    )
    this.name = 'RepereEncoreRappele'
    this.emplois = emplois
  }
}

/* --- Conversions ---------------------------------------------------------- */

function texte(valeur: { toString(): string } | null | undefined): string | null {
  return valeur === null || valeur === undefined ? null : valeur.toString()
}

interface LigneBrute {
  id: string
  type: string
  ordre: number
  libelle: string
  deduction: boolean
  nombre: Prisma.Decimal | null
  longueur: Prisma.Decimal | null
  largeur: Prisma.Decimal | null
  hauteur: Prisma.Decimal | null
  rappelRepereId: string | null
}

const SELECTION_LIGNE = {
  id: true,
  type: true,
  ordre: true,
  libelle: true,
  deduction: true,
  nombre: true,
  longueur: true,
  largeur: true,
  hauteur: true,
  rappelRepereId: true,
} as const

function versDomaine(ligne: LigneBrute): LigneMetre {
  return {
    id: ligne.id,
    type: ligne.type === 'RAPPEL' ? 'RAPPEL' : 'MESURE',
    libelle: ligne.libelle,
    deduction: ligne.deduction,
    nombre: texte(ligne.nombre),
    longueur: texte(ligne.longueur),
    largeur: texte(ligne.largeur),
    hauteur: texte(ligne.hauteur),
    rappelRepereId: ligne.rappelRepereId,
  }
}

function anomaliesDTO(anomalies: readonly AnomalieMetre[]): AnomalieMetreDTO[] {
  return anomalies.map((a) => ({ code: a.code, ligneId: a.ligneId, message: a.message }))
}

function lignesDTO(lignes: readonly LigneBrute[], resultat: ResultatMetre): LigneMetreDTO[] {
  const parId = new Map(resultat.lignes.map((l) => [l.ligneId, l]))
  return lignes.map((ligne) => {
    const calcul = parId.get(ligne.id)
    return {
      id: ligne.id,
      ordre: ligne.ordre,
      type: ligne.type === 'RAPPEL' ? 'RAPPEL' : 'MESURE',
      libelle: ligne.libelle,
      deduction: ligne.deduction,
      nombre: texte(ligne.nombre),
      longueur: texte(ligne.longueur),
      largeur: texte(ligne.largeur),
      hauteur: texte(ligne.hauteur),
      rappelRepereId: ligne.rappelRepereId,
      valeur: calcul?.valeur?.toString() ?? null,
      ignoree: calcul?.ignoree ?? true,
    }
  })
}

/** Refuse tout de suite ce qu'on ne saurait pas mesurer : un nombre négatif. */
function decimalSaisie(valeur: string | null | undefined, champ: string): Prisma.Decimal | null {
  if (valeur === null || valeur === undefined) return null
  const nettoye = valeur.trim().replace(/\s/g, '').replace(',', '.')
  if (nettoye === '') return null
  if (!/^-?\d*\.?\d*$/.test(nettoye) || nettoye === '-' || nettoye === '.') {
    throw new MetreInvalide(`Valeur illisible pour ${champ} : « ${valeur} ».`)
  }
  const decimale = new Prisma.Decimal(nettoye)
  if (decimale.isNegative()) {
    throw new MetreInvalide(
      `Une mesure négative n’a pas de sens (${champ}). Cochez « déduction » pour retrancher une ligne.`,
    )
  }
  return decimale
}

/* --- Évaluation d'une mission entière ------------------------------------- */

interface EtatMetre {
  readonly reperes: Map<string, RepereEvalue>
  readonly emplois: Map<string, number>
}

async function chargerReperes(client: PrismaClient, missionId: string) {
  return client.repereMetre.findMany({
    where: { missionId },
    orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
    select: {
      id: true,
      nom: true,
      unite: true,
      ordre: true,
      lignes: { orderBy: { ordre: 'asc' }, select: SELECTION_LIGNE },
    },
  })
}

/** Combien de feuilles de métré rappellent chaque repère — un repère rappelé ne se supprime pas. */
async function compterEmplois(client: PrismaClient, missionId: string): Promise<Map<string, number>> {
  const lignes = await client.ligneMetre.findMany({
    where: {
      rappelRepereId: { not: null },
      OR: [{ poste: { lot: { missionId } } }, { repere: { missionId } }],
    },
    select: { rappelRepereId: true },
  })
  const emplois = new Map<string, number>()
  for (const ligne of lignes) {
    const cle = ligne.rappelRepereId as string
    emplois.set(cle, (emplois.get(cle) ?? 0) + 1)
  }
  return emplois
}

async function etatMetre(client: PrismaClient, missionId: string): Promise<EtatMetre> {
  const bruts = await chargerReperes(client, missionId)
  const aEvaluer: RepereAEvaluer[] = bruts.map((repere) => ({
    id: repere.id,
    nom: repere.nom,
    unite: repere.unite,
    lignes: repere.lignes.map(versDomaine),
  }))
  return { reperes: evaluerReperes(aEvaluer), emplois: await compterEmplois(client, missionId) }
}

function repereDTO(
  repere: { id: string; nom: string; unite: string | null; ordre: number },
  etat: EtatMetre,
): RepereDTO {
  const evalue = etat.reperes.get(repere.id)
  return {
    id: repere.id,
    nom: repere.nom,
    unite: repere.unite,
    ordre: repere.ordre,
    valeur: evalue?.valeur?.toString() ?? null,
    degre: evalue?.degre ?? null,
    emplois: etat.emplois.get(repere.id) ?? 0,
    anomalies: anomaliesDTO(evalue?.anomalies ?? []),
  }
}

/**
 * Réévalue tous les métrés de la mission et reporte les quantités.
 *
 * On reprend tout, repères compris : une seule ligne de repère modifiée peut
 * changer la quantité de dix ouvrages, et un métré à jour à côté d'un métré
 * périmé serait pire que pas de métré du tout.
 */
export async function recalculerMetres(client: PrismaClient, missionId: string): Promise<void> {
  const etat = await etatMetre(client, missionId)
  const valeurs = valeursDesReperes(etat.reperes)

  const postes = await client.poste.findMany({
    where: { lot: { missionId }, lignesMetre: { some: {} } },
    select: {
      id: true,
      unite: true,
      quantite: true,
      lignesMetre: { orderBy: { ordre: 'asc' }, select: SELECTION_LIGNE },
    },
  })

  const aEcrire: { id: string; quantite: Prisma.Decimal | null }[] = []
  for (const poste of postes) {
    const resultat = calculerMetre({
      lignes: poste.lignesMetre.map(versDomaine),
      reperes: valeurs,
      unite: poste.unite,
    })
    const reportable = quantiteReportable(resultat)
    const nouvelle = reportable === null ? null : new Prisma.Decimal(reportable)
    const ancienne = poste.quantite
    const identique =
      (nouvelle === null && ancienne === null) ||
      (nouvelle !== null && ancienne !== null && nouvelle.equals(ancienne))
    if (!identique) aEcrire.push({ id: poste.id, quantite: nouvelle })
  }

  await client.$transaction(async (tx) => {
    for (const [id, evalue] of etat.reperes) {
      await tx.repereMetre.update({
        where: { id },
        data: { valeur: evalue.valeur === null ? null : new Prisma.Decimal(evalue.valeur.toString()) },
      })
    }
    for (const poste of aEcrire) {
      await tx.poste.update({ where: { id: poste.id }, data: { quantite: poste.quantite } })
    }
  })

  if (aEcrire.length > 0) await recalculerMission(client, missionId)
}

/* --- Métré d'un ouvrage ---------------------------------------------------- */

async function posteDeLaMission(client: PrismaClient, missionId: string, posteId: string) {
  const poste = await client.poste.findFirst({
    where: { id: posteId, lot: { missionId } },
    select: {
      id: true,
      designation: true,
      unite: true,
      type: true,
      lignesMetre: { orderBy: { ordre: 'asc' }, select: SELECTION_LIGNE },
    },
  })
  if (!poste) throw new PosteIntrouvable(posteId)
  return poste
}

export async function chargerMetrePoste(
  client: PrismaClient,
  missionId: string,
  posteId: string,
): Promise<MetrePosteDTO> {
  const poste = await posteDeLaMission(client, missionId, posteId)
  const etat = await etatMetre(client, missionId)
  const bruts = await chargerReperes(client, missionId)

  const resultat = calculerMetre({
    lignes: poste.lignesMetre.map(versDomaine),
    reperes: valeursDesReperes(etat.reperes),
    unite: poste.unite,
  })

  return {
    posteId: poste.id,
    designation: poste.designation,
    unite: poste.unite,
    lignes: lignesDTO(poste.lignesMetre, resultat),
    total: resultat.total?.toString() ?? null,
    quantite: quantiteReportable(resultat),
    anomalies: anomaliesDTO(resultat.anomalies),
    reperes: bruts.map((repere) => repereDTO(repere, etat)),
  }
}

/** Vérifie que les repères rappelés appartiennent bien à cette mission. */
async function verifierRappels(
  client: PrismaClient,
  missionId: string,
  lignes: readonly SaisieLigneMetre[],
): Promise<void> {
  const demandes = [
    ...new Set(
      lignes
        .filter((l) => l.type === 'RAPPEL' && l.rappelRepereId !== null)
        .map((l) => l.rappelRepereId as string),
    ),
  ]
  if (demandes.length === 0) return
  const connus = await client.repereMetre.findMany({
    where: { id: { in: demandes }, missionId },
    select: { id: true },
  })
  if (connus.length !== demandes.length) {
    throw new MetreInvalide('Un repère rappelé n’appartient pas à cette mission.')
  }
}

function donneesLigne(ligne: SaisieLigneMetre, ordre: number) {
  const estRappel = ligne.type === 'RAPPEL'
  return {
    ordre,
    type: estRappel ? ('RAPPEL' as const) : ('MESURE' as const),
    libelle: ligne.libelle.trim(),
    deduction: ligne.deduction,
    nombre: decimalSaisie(ligne.nombre, 'le nombre'),
    longueur: decimalSaisie(ligne.longueur, 'la longueur'),
    largeur: decimalSaisie(ligne.largeur, 'la largeur'),
    hauteur: decimalSaisie(ligne.hauteur, 'la hauteur'),
    rappelRepereId: estRappel ? ligne.rappelRepereId : null,
  }
}

/**
 * Remplace la feuille de métré d'un ouvrage. On réécrit tout plutôt que de
 * suivre ligne à ligne : une feuille est un ensemble, pas une accumulation.
 */
export async function enregistrerMetrePoste(
  client: PrismaClient,
  missionId: string,
  posteId: string,
  lignes: readonly SaisieLigneMetre[],
): Promise<MetrePosteDTO> {
  const poste = await posteDeLaMission(client, missionId, posteId)
  if (poste.type !== 'OUVRAGE') {
    throw new MetreInvalide('Un sous-lot porte la somme de ses ouvrages, pas un métré.')
  }
  await verifierRappels(client, missionId, lignes)
  const donnees = lignes.map(donneesLigne)

  await client.$transaction(async (tx) => {
    await tx.ligneMetre.deleteMany({ where: { posteId } })
    for (const [index, ligne] of donnees.entries()) {
      await tx.ligneMetre.create({ data: { ...ligne, ordre: index, posteId } })
    }
  })

  await recalculerMetres(client, missionId)
  return chargerMetrePoste(client, missionId, posteId)
}

/**
 * Supprime la feuille de métré et rend la quantité à la saisie directe. La
 * dernière quantité calculée reste en place : l'ouvrage garde son montant, et
 * l'économiste reprend la main sans repartir de zéro.
 */
export async function supprimerMetrePoste(
  client: PrismaClient,
  missionId: string,
  posteId: string,
): Promise<void> {
  await posteDeLaMission(client, missionId, posteId)
  await client.ligneMetre.deleteMany({ where: { posteId } })
}

/* --- Repères --------------------------------------------------------------- */

export async function listerReperes(client: PrismaClient, missionId: string): Promise<RepereDetailDTO[]> {
  const bruts = await chargerReperes(client, missionId)
  const etat = await etatMetre(client, missionId)
  return bruts.map((repere) => {
    const evalue = etat.reperes.get(repere.id)
    return {
      ...repereDTO(repere, etat),
      lignes: lignesDTO(
        repere.lignes,
        evalue?.resultat ?? { lignes: [], total: null, degre: null, anomalies: [] },
      ),
      total: evalue?.resultat.total?.toString() ?? null,
    }
  })
}

export async function creerRepere(
  client: PrismaClient,
  missionId: string,
  entree: { nom: string; unite: string | null },
): Promise<string> {
  const mission = await client.mission.findUnique({ where: { id: missionId }, select: { id: true } })
  if (!mission) throw new MetreInvalide('Mission introuvable.')

  const nom = entree.nom.trim()
  if (nom === '') throw new MetreInvalide('Un repère a besoin d’un nom : c’est par là qu’on le rappelle.')

  const existant = await client.repereMetre.findFirst({ where: { missionId, nom }, select: { id: true } })
  if (existant) throw new MetreInvalide(`Un repère « ${nom} » existe déjà dans cette mission.`)

  const dernier = await client.repereMetre.findFirst({
    where: { missionId },
    orderBy: { ordre: 'desc' },
    select: { ordre: true },
  })

  const cree = await client.repereMetre.create({
    data: {
      missionId,
      nom,
      unite: entree.unite === null || entree.unite === '' ? null : (entree.unite as 'M2'),
      ordre: (dernier?.ordre ?? -1) + 1,
    },
    select: { id: true },
  })
  return cree.id
}

async function repereDeLaMission(client: PrismaClient, missionId: string, repereId: string) {
  const repere = await client.repereMetre.findFirst({
    where: { id: repereId, missionId },
    select: { id: true, nom: true, unite: true },
  })
  if (!repere) throw new RepereIntrouvable(repereId)
  return repere
}

/**
 * Enregistre un repère. Un cycle est refusé plutôt qu'accepté puis signalé :
 * un repère qui se rappelle lui-même prive de quantité tous les ouvrages qui
 * en dépendent, et l'erreur se verrait loin de l'endroit où elle a été commise.
 */
export async function enregistrerRepere(
  client: PrismaClient,
  missionId: string,
  repereId: string,
  entree: {
    nom?: string
    unite?: string | null
    lignes?: readonly SaisieLigneMetre[]
  },
): Promise<void> {
  const repere = await repereDeLaMission(client, missionId, repereId)

  const nom = entree.nom === undefined ? repere.nom : entree.nom.trim()
  if (nom === '') throw new MetreInvalide('Un repère a besoin d’un nom.')
  if (nom !== repere.nom) {
    const homonyme = await client.repereMetre.findFirst({
      where: { missionId, nom, id: { not: repereId } },
      select: { id: true },
    })
    if (homonyme) throw new MetreInvalide(`Un repère « ${nom} » existe déjà dans cette mission.`)
  }

  const unite = entree.unite === undefined ? repere.unite : entree.unite
  const lignes = entree.lignes

  if (lignes !== undefined) {
    await verifierRappels(client, missionId, lignes)
    await refuserCycle(client, missionId, repereId, nom, unite, lignes)
  }

  const donnees = lignes?.map(donneesLigne)

  await client.$transaction(async (tx) => {
    await tx.repereMetre.update({
      where: { id: repereId },
      data: { nom, unite: unite === null || unite === '' ? null : (unite as 'M2') },
    })
    if (donnees !== undefined) {
      await tx.ligneMetre.deleteMany({ where: { repereId } })
      for (const [index, ligne] of donnees.entries()) {
        await tx.ligneMetre.create({ data: { ...ligne, ordre: index, repereId } })
      }
    }
  })

  await recalculerMetres(client, missionId)
}

/** Évalue la mission comme si le repère portait déjà ses nouvelles lignes. */
async function refuserCycle(
  client: PrismaClient,
  missionId: string,
  repereId: string,
  nom: string,
  unite: string | null,
  lignes: readonly SaisieLigneMetre[],
): Promise<void> {
  const bruts = await chargerReperes(client, missionId)
  const aEvaluer: RepereAEvaluer[] = bruts.map((repere) =>
    repere.id === repereId
      ? {
          id: repereId,
          nom,
          unite,
          lignes: lignes.map((ligne, index) => ({
            id: `projet-${index}`,
            type: ligne.type,
            libelle: ligne.libelle,
            deduction: ligne.deduction,
            nombre: ligne.nombre,
            longueur: ligne.longueur,
            largeur: ligne.largeur,
            hauteur: ligne.hauteur,
            rappelRepereId: ligne.rappelRepereId,
          })),
        }
      : { id: repere.id, nom: repere.nom, unite: repere.unite, lignes: repere.lignes.map(versDomaine) },
  )

  for (const evalue of evaluerReperes(aEvaluer).values()) {
    if (evalue.anomalies.some((a) => a.code === 'cycle_de_reperes')) {
      throw new MetreInvalide(
        `Ce rappel ferait tourner les repères en rond (« ${evalue.nom} » finirait par se rappeler lui-même).`,
      )
    }
  }
}

export async function supprimerRepere(
  client: PrismaClient,
  missionId: string,
  repereId: string,
): Promise<void> {
  const repere = await repereDeLaMission(client, missionId, repereId)

  const rappels = await client.ligneMetre.findMany({
    where: { rappelRepereId: repereId },
    select: { poste: { select: { designation: true } }, repere: { select: { nom: true } } },
  })
  if (rappels.length > 0) {
    const emplois = [
      ...new Set(rappels.map((r) => r.poste?.designation ?? r.repere?.nom ?? 'métré inconnu')),
    ]
    throw new RepereEncoreRappele(repere.nom, emplois)
  }

  await client.repereMetre.delete({ where: { id: repereId } })
  await recalculerMetres(client, missionId)
}

/* --- Le métré complet d'une mission, pour l'export ------------------------- */

/**
 * Charge tout ce qui a été mesuré dans la mission. C'est ce qui part en pièce
 * justificative : les ouvrages sans métré n'y figurent pas, puisqu'il n'y a
 * rien à justifier.
 */
export async function chargerMetreMission(
  client: PrismaClient,
  missionId: string,
): Promise<MetreMissionDTO> {
  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { reference: true, nomOperation: true },
  })
  if (!mission) throw new MetreInvalide('Mission introuvable.')

  const etat = await etatMetre(client, missionId)
  const valeurs = valeursDesReperes(etat.reperes)

  const lots = await client.lot.findMany({
    where: { missionId },
    orderBy: [{ ordre: 'asc' }, { numero: 'asc' }],
    select: {
      id: true,
      numero: true,
      intitule: true,
      postes: {
        where: { lignesMetre: { some: {} } },
        orderBy: { ordre: 'asc' },
        select: {
          id: true,
          code: true,
          designation: true,
          unite: true,
          quantite: true,
          lignesMetre: { orderBy: { ordre: 'asc' }, select: SELECTION_LIGNE },
        },
      },
    },
  })

  const lotsDTO: LotMetreDTO[] = []
  for (const lot of lots) {
    if (lot.postes.length === 0) continue
    const ouvrages: OuvrageMetreDTO[] = lot.postes.map((poste) => {
      const resultat = calculerMetre({
        lignes: poste.lignesMetre.map(versDomaine),
        reperes: valeurs,
        unite: poste.unite,
      })
      return {
        posteId: poste.id,
        code: poste.code,
        designation: poste.designation,
        unite: poste.unite,
        quantite: texte(poste.quantite),
        total: resultat.total?.toString() ?? null,
        lignes: lignesDTO(poste.lignesMetre, resultat),
        anomalies: anomaliesDTO(resultat.anomalies),
      }
    })
    lotsDTO.push({ lotId: lot.id, numero: lot.numero, intitule: lot.intitule, ouvrages })
  }

  return {
    reference: mission.reference,
    nomOperation: mission.nomOperation,
    lots: lotsDTO,
    reperes: await listerReperes(client, missionId),
  }
}
