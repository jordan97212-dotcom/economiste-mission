import type { PrismaClient } from '@prisma/client'
import * as Money from '../../domain/money/money'
import * as PU from '../../domain/money/prix-unitaire'
import {
  etablirDecompteGeneral,
  totaliserDecomptes,
  type DecompteGeneral,
} from '../../domain/cloture/decompte-general'
import {
  ecartPrixPourcent,
  preparerReinjection,
  type CandidatReinjection,
  type PosteChiffre,
} from '../../domain/cloture/reinjection'
import { creerPrix } from '../prix/service'
import { journaliser } from '../audit/service'

/**
 * Clôture d'opération — SPEC_APP_ECONOMISTE.md §5.7.
 *
 * Trois choses : établir le décompte général, verser dans la base de prix les
 * prix réellement pratiqués, et archiver la mission.
 *
 * La réinjection est le point qui referme la boucle du projet. Deux règles en
 * découlent, et aucune n'est négociable : le prix versé vient de l'offre
 * retenue et jamais de l'estimatif, et rien n'entre en base sans que
 * l'économiste ait coché la ligne.
 */

export interface DecompteLotDTO {
  readonly lotId: string
  readonly numero: string
  readonly intitule: string
  readonly entrepriseNom: string | null
  readonly marcheInitialHt: string
  readonly avenantsAcceptesHt: string
  readonly marcheActuelHt: string
  readonly travauxExecutesHt: string
  readonly soldeNonExecuteHt: string
  readonly retenueGarantieARestituerHt: string
  readonly netRegleHt: string
  readonly executePourcent: string | null
  readonly nbSituations: number
  readonly attribue: boolean
}

export interface DecompteMissionDTO {
  readonly marcheActuelHt: string
  readonly travauxExecutesHt: string
  readonly soldeNonExecuteHt: string
  readonly retenueGarantieARestituerHt: string
  readonly netRegleHt: string
  readonly executePourcent: string | null
  readonly lots: readonly DecompteLotDTO[]
}

async function decompteDuLot(
  client: PrismaClient,
  missionId: string,
  lotId: string,
  marcheInitial: bigint | null,
): Promise<DecompteGeneral> {
  const [avenants, situations] = await Promise.all([
    client.avenant.findMany({
      where: { missionId, lotId, statut: 'ACCEPTE' },
      select: { montantHt: true },
    }),
    client.situationTravaux.findMany({
      where: { missionId, lotId },
      select: {
        montantPeriodeHt: true,
        retenueGarantieHt: true,
        avanceRemboursee: true,
        compteProrataHt: true,
      },
    }),
  ])

  return etablirDecompteGeneral({
    marcheInitialHt: Money.depuisCentimes(marcheInitial ?? 0n),
    avenantsAcceptesHt: Money.somme(avenants.map((a) => Money.depuisCentimes(a.montantHt))),
    situations: situations.map((s) => ({
      montantPeriodeHt: Money.depuisCentimes(s.montantPeriodeHt),
      retenueGarantieHt: Money.depuisCentimes(s.retenueGarantieHt),
      avanceRembourseeHt: Money.depuisCentimes(s.avanceRemboursee),
      compteProrataHt: Money.depuisCentimes(s.compteProrataHt),
    })),
  })
}

export async function chargerDecompteGeneral(
  client: PrismaClient,
  missionId: string,
): Promise<DecompteMissionDTO> {
  const lots = await client.lot.findMany({
    where: { missionId },
    orderBy: [{ ordre: 'asc' }, { numero: 'asc' }],
    select: {
      id: true,
      numero: true,
      intitule: true,
      montantRetenuHt: true,
      offreRetenue: {
        select: { consultation: { select: { entreprise: { select: { raisonSociale: true } } } } },
      },
    },
  })

  const lignes: DecompteLotDTO[] = []
  const pourTotal: { lotId: string; decompte: DecompteGeneral }[] = []

  for (const lot of lots) {
    const decompte = await decompteDuLot(client, missionId, lot.id, lot.montantRetenuHt)
    pourTotal.push({ lotId: lot.id, decompte })

    lignes.push({
      lotId: lot.id,
      numero: lot.numero,
      intitule: lot.intitule,
      entrepriseNom: lot.offreRetenue?.consultation.entreprise.raisonSociale ?? null,
      marcheInitialHt: (decompte.marcheInitialHt as bigint).toString(),
      avenantsAcceptesHt: (decompte.avenantsAcceptesHt as bigint).toString(),
      marcheActuelHt: (decompte.marcheActuelHt as bigint).toString(),
      travauxExecutesHt: (decompte.travauxExecutesHt as bigint).toString(),
      soldeNonExecuteHt: (decompte.soldeNonExecuteHt as bigint).toString(),
      retenueGarantieARestituerHt: (decompte.retenueGarantieARestituerHt as bigint).toString(),
      netRegleHt: (decompte.netRegleHt as bigint).toString(),
      executePourcent: decompte.executePourcent ? decompte.executePourcent.toFixed(2) : null,
      nbSituations: decompte.nbSituations,
      attribue: lot.montantRetenuHt !== null,
    })
  }

  const operation = totaliserDecomptes(pourTotal)

  return {
    marcheActuelHt: (operation.marcheActuelHt as bigint).toString(),
    travauxExecutesHt: (operation.travauxExecutesHt as bigint).toString(),
    soldeNonExecuteHt: (operation.soldeNonExecuteHt as bigint).toString(),
    retenueGarantieARestituerHt: (operation.retenueGarantieARestituerHt as bigint).toString(),
    netRegleHt: (operation.netRegleHt as bigint).toString(),
    executePourcent: operation.executePourcent ? operation.executePourcent.toFixed(2) : null,
    lots: lignes,
  }
}

/* --------------------------------------------------------------------------
   Réinjection des prix réels
   -------------------------------------------------------------------------- */

export interface CandidatDTO {
  readonly posteId: string
  readonly lotId: string
  readonly lotLibelle: string
  readonly code: string | null
  readonly designation: string
  readonly unite: string
  readonly prixReelHt: string
  readonly prixEstimeHt: string | null
  readonly ecartPourcent: string | null
  readonly dejaEnBase: boolean
}

export interface EcarteDTO {
  readonly posteId: string
  readonly lotLibelle: string
  readonly designation: string
  readonly motif: string
}

export interface PropositionReinjection {
  readonly candidats: readonly CandidatDTO[]
  readonly ecartes: readonly EcarteDTO[]
  readonly nbLotsSansAttribution: number
}

/**
 * Ce que la clôture peut verser en base : les prix de chaque offre retenue,
 * lot par lot. Un lot non attribué ne propose rien — il n'y a pas de prix
 * réel à verser.
 */
export async function candidatsReinjection(
  client: PrismaClient,
  missionId: string,
): Promise<PropositionReinjection> {
  const lots = await client.lot.findMany({
    where: { missionId },
    orderBy: [{ ordre: 'asc' }, { numero: 'asc' }],
    select: {
      id: true,
      numero: true,
      intitule: true,
      offreRetenueId: true,
      postes: {
        where: { type: 'OUVRAGE' },
        orderBy: { ordre: 'asc' },
        select: {
          id: true,
          code: true,
          designation: true,
          unite: true,
          prixUnitaireHtFinal: true,
        },
      },
    },
  })

  const existants = await client.prixReference.findMany({ select: { code: true, designation: true } })

  const candidats: CandidatDTO[] = []
  const ecartes: EcarteDTO[] = []
  let nbLotsSansAttribution = 0

  for (const lot of lots) {
    const libelle = `${lot.numero} · ${lot.intitule}`

    if (!lot.offreRetenueId) {
      nbLotsSansAttribution += 1
      continue
    }

    const lignes = await client.ligneOffre.findMany({
      where: { offreId: lot.offreRetenueId },
      select: { posteId: true, prixUnitaireHt: true },
    })

    const postes: PosteChiffre[] = lot.postes.map((p) => ({
      posteId: p.id,
      code: p.code,
      designation: p.designation,
      unite: p.unite,
      prixEstimeHt: p.prixUnitaireHtFinal !== null ? PU.depuisStockage(p.prixUnitaireHtFinal) : null,
    }))

    const selection = preparerReinjection(
      postes,
      lignes.map((l) => ({ posteId: l.posteId, prixUnitaireHt: PU.depuisStockage(l.prixUnitaireHt) })),
      existants,
    )

    for (const candidat of selection.candidats) {
      candidats.push({
        posteId: candidat.posteId,
        lotId: lot.id,
        lotLibelle: libelle,
        code: candidat.code,
        designation: candidat.designation,
        unite: candidat.unite,
        prixReelHt: (candidat.prixReelHt as bigint).toString(),
        prixEstimeHt: candidat.prixEstimeHt !== null ? (candidat.prixEstimeHt as bigint).toString() : null,
        ecartPourcent: ecartPrixPourcent(candidat),
        dejaEnBase: candidat.dejaEnBase,
      })
    }

    for (const ecarte of selection.ecartes) {
      ecartes.push({
        posteId: ecarte.posteId,
        lotLibelle: libelle,
        designation: ecarte.designation,
        motif: ecarte.motif,
      })
    }
  }

  return { candidats, ecartes, nbLotsSansAttribution }
}

export interface ResultatVersement {
  readonly nbVerses: number
  readonly references: readonly string[]
}

/**
 * Verse en base les prix cochés. Rien d'autre : un poste non coché n'entre
 * pas, même s'il figurait dans la proposition.
 */
export async function verserPrix(
  client: PrismaClient,
  missionId: string,
  posteIds: readonly string[],
): Promise<ResultatVersement> {
  if (posteIds.length === 0) return { nbVerses: 0, references: [] }

  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { id: true, typeOuvrage: true, nature: true },
  })
  if (!mission) throw new Error(`Mission introuvable : ${missionId}`)

  const proposition = await candidatsReinjection(client, missionId)
  const choisis = proposition.candidats.filter((c) => posteIds.includes(c.posteId))

  const lots = await client.lot.findMany({
    where: { missionId },
    select: { id: true, corpsEtatId: true },
  })
  const corpsEtatParLot = new Map(lots.map((l) => [l.id, l.corpsEtatId]))

  const references: string[] = []
  for (const candidat of choisis) {
    await creerPrix(client, {
      code: candidat.code,
      designation: candidat.designation,
      unite: candidat.unite,
      corpsEtatId: corpsEtatParLot.get(candidat.lotId) ?? null,
      prixUnitaireHt: PU.versEuros(PU.depuisStockage(BigInt(candidat.prixReelHt))).toString(),
      contexteTypeOuvrage: mission.typeOuvrage,
      contexteNature: mission.nature,
      origineMissionId: missionId,
    })
    references.push(candidat.designation)
  }

  // Une entrée de synthèse, pas une par prix : le détail se relit dans la
  // base de prix elle-même, filtrée sur la mission d'origine.
  await journaliser(client, {
    entite: 'Mission',
    entiteId: missionId,
    action: 'MODIFICATION',
    apres: { prixVerses: choisis.length },
  })

  return { nbVerses: choisis.length, references }
}

/* --------------------------------------------------------------------------
   Archivage
   -------------------------------------------------------------------------- */

export interface EtatCloture {
  readonly archivee: boolean
  readonly archiveeLe: Date | null
  readonly statut: string
  readonly nbPrixVerses: number
}

export async function chargerEtatCloture(
  client: PrismaClient,
  missionId: string,
): Promise<EtatCloture> {
  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { statut: true, archiveeLe: true, _count: { select: { prixIssus: true } } },
  })
  if (!mission) throw new Error(`Mission introuvable : ${missionId}`)

  return {
    archivee: mission.archiveeLe !== null,
    archiveeLe: mission.archiveeLe,
    statut: mission.statut,
    nbPrixVerses: mission._count.prixIssus,
  }
}

/**
 * Clôt la mission : statut terminé et date d'archivage. L'opération reste
 * lisible — tout y est consultable — mais elle sort des missions en cours.
 * Réversible : une clôture prononcée trop tôt ne doit pas être un piège.
 */
export async function cloturerMission(client: PrismaClient, missionId: string): Promise<void> {
  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { statut: true, archiveeLe: true },
  })
  if (!mission) throw new Error(`Mission introuvable : ${missionId}`)
  if (mission.archiveeLe !== null) throw new Error('Cette opération est déjà clôturée.')

  await client.mission.update({
    where: { id: missionId },
    data: { statut: 'TERMINEE', archiveeLe: new Date() },
  })

  await journaliser(client, {
    entite: 'Mission',
    entiteId: missionId,
    action: 'MODIFICATION',
    avant: { statut: mission.statut, archivee: false },
    apres: { statut: 'TERMINEE', archivee: true },
  })
}

export async function rouvrirMission(client: PrismaClient, missionId: string): Promise<void> {
  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { archiveeLe: true },
  })
  if (!mission) throw new Error(`Mission introuvable : ${missionId}`)
  if (mission.archiveeLe === null) throw new Error('Cette opération n’est pas clôturée.')

  await client.mission.update({
    where: { id: missionId },
    data: { statut: 'EN_COURS', archiveeLe: null },
  })

  await journaliser(client, {
    entite: 'Mission',
    entiteId: missionId,
    action: 'MODIFICATION',
    avant: { archivee: true },
    apres: { statut: 'EN_COURS', archivee: false },
  })
}
