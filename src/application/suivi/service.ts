import type { PrismaClient } from '@prisma/client'
import * as Money from '../../domain/money/money'
import { tableauFinancier } from '../../domain/situations/calcul'
import { tauxRetenueConstate } from '../../domain/situations/decompte'
import { cumulDuLot, marcheDuLot } from '../situations/service'
import { estChiffrageFige } from '../../domain/chiffrage/comparaison'

/**
 * Tableau de bord financier de chantier — SPEC_APP_ECONOMISTE.md §5.6.
 *
 * Marché initial, avenants cumulés, marché actuel, travaux réalisés, reste à
 * réaliser, écart vis-à-vis de l'estimatif, et l'alerte de dérive au seuil
 * choisi par l'économiste. Tout le calcul vient du domaine ; ce service ne
 * fait que rassembler les chiffres et les convertir pour l'écran.
 *
 * Note sur l'estimatif de référence : la comparaison se fait avec l'estimatif
 * courant du chiffrage. Le figeage par phase (point 10.4) existe au schéma
 * mais n'est pas encore exploité — tant qu'il ne l'est pas, parler
 * d'« estimatif initial » serait inexact, et l'écran dit donc « estimatif du
 * chiffrage ».
 */

export interface LigneSuiviLot {
  readonly lotId: string
  readonly numero: string
  readonly intitule: string
  readonly estimatifHt: string
  readonly marcheInitialHt: string | null
  readonly avenantsAcceptesHt: string
  readonly marcheActuelHt: string | null
  readonly travauxRealisesHt: string
  readonly resteARealiserHt: string | null
  readonly avancementPourcent: string | null
  readonly retenueGarantieCumuleeHt: string
  readonly tauxRetenuePourcent: string | null
  readonly nbSituations: number
  readonly attribue: boolean
  readonly entrepriseNom: string | null
}

/** Sur quoi l'écart se mesure. L'écran le dit, au lieu de laisser deviner. */
export interface ReferenceEstimatif {
  readonly origine: 'version_figee' | 'chiffrage_courant'
  readonly libelle: string
  readonly figeLe: string | null
}

export interface SuiviMission {
  readonly referenceEstimatif: ReferenceEstimatif
  readonly estimatifHt: string
  readonly marcheInitialHt: string
  readonly avenantsCumulesHt: string
  readonly marcheActuelHt: string
  readonly travauxRealisesHt: string
  readonly resteARealiserHt: string
  readonly ecartVsEstimatifHt: string
  readonly ecartVsEstimatifPourcent: string | null
  readonly avancementPourcent: string | null
  readonly deriveDetectee: boolean
  readonly seuilDerivePourcent: string
  readonly retenueGarantieCumuleeHt: string
  readonly nbLotsAttribues: number
  readonly nbLots: number
  readonly lots: readonly LigneSuiviLot[]
}

interface ReferenceChargee {
  readonly description: ReferenceEstimatif
  /** Montant figé par numéro de lot. Vide quand aucune version n'existe. */
  readonly parLot: Map<string, string>
}

/**
 * Trouve la version figée qui sert de référence.
 *
 * Le DCE d'abord : c'est le chiffrage sur lequel les entreprises ont remis
 * leurs offres, donc le seul auquel comparer le réalisé ait un sens
 * contractuel. À défaut, la dernière version figée. À défaut encore, rien —
 * et l'appelant retombe sur le chiffrage courant en le disant.
 */
async function chargerReferenceEstimatif(
  client: PrismaClient,
  missionId: string,
): Promise<ReferenceChargee> {
  const versions = await client.chiffrageVersion.findMany({
    where: { missionId },
    orderBy: { figeLe: 'desc' },
    select: { phase: true, libelle: true, figeLe: true, contenu: true },
  })

  const retenue = versions.find((v) => v.phase === 'DCE') ?? versions[0]

  if (!retenue || !estChiffrageFige(retenue.contenu)) {
    return {
      description: {
        origine: 'chiffrage_courant',
        libelle: 'Chiffrage actuel',
        figeLe: null,
      },
      parLot: new Map(),
    }
  }

  return {
    description: {
      origine: 'version_figee',
      libelle: retenue.libelle,
      figeLe: retenue.figeLe.toISOString(),
    },
    parLot: new Map(retenue.contenu.lots.map((lot) => [lot.numero, lot.montantEstimeHt])),
  }
}

export async function chargerSuivi(client: PrismaClient, missionId: string): Promise<SuiviMission> {
  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { id: true, seuilDerivePourcent: true },
  })
  if (!mission) throw new Error(`Mission introuvable : ${missionId}`)

  // L'estimatif de référence vient d'une version figée quand il en existe une.
  // Le DCE est retenu en priorité : c'est le chiffrage sur lequel les
  // entreprises ont remis, donc celui auquel comparer le réalisé a un sens.
  // À défaut, la dernière version figée ; à défaut encore, le chiffrage
  // courant — et l'écran le dit, plutôt que de laisser croire à une référence
  // stable qui n'existerait pas.
  const reference = await chargerReferenceEstimatif(client, missionId)

  const lots = await client.lot.findMany({
    where: { missionId },
    orderBy: [{ ordre: 'asc' }, { numero: 'asc' }],
    select: {
      id: true,
      numero: true,
      intitule: true,
      montantEstimeHt: true,
      montantRetenuHt: true,
      offreRetenue: {
        select: { consultation: { select: { entreprise: { select: { raisonSociale: true } } } } },
      },
      _count: { select: { situations: true } },
    },
  })

  const lignes: LigneSuiviLot[] = []
  for (const lot of lots) {
    const marcheActuel = await marcheDuLot(client, missionId, lot.id)
    const cumul = await cumulDuLot(client, missionId, lot.id)

    const marcheInitial = lot.montantRetenuHt !== null ? Money.depuisCentimes(lot.montantRetenuHt) : null
    const avenants =
      marcheActuel !== null && marcheInitial !== null
        ? Money.soustraire(marcheActuel, marcheInitial)
        : Money.ZERO

    const reste = marcheActuel !== null ? Money.soustraire(marcheActuel, cumul.travauxRealisesHt) : null
    const avancement =
      marcheActuel !== null && !Money.estZero(marcheActuel)
        ? Money.versEuros(cumul.travauxRealisesHt)
            .div(Money.versEuros(marcheActuel))
            .mul(100)
            .toDecimalPlaces(2)
        : null

    lignes.push({
      lotId: lot.id,
      numero: lot.numero,
      intitule: lot.intitule,
      estimatifHt: reference.parLot.get(lot.numero) ?? lot.montantEstimeHt.toString(),
      marcheInitialHt: marcheInitial !== null ? (marcheInitial as bigint).toString() : null,
      avenantsAcceptesHt: (avenants as bigint).toString(),
      marcheActuelHt: marcheActuel !== null ? (marcheActuel as bigint).toString() : null,
      travauxRealisesHt: (cumul.travauxRealisesHt as bigint).toString(),
      resteARealiserHt: reste !== null ? (reste as bigint).toString() : null,
      avancementPourcent: avancement ? avancement.toFixed(2) : null,
      retenueGarantieCumuleeHt: (cumul.retenueGarantieCumuleeHt as bigint).toString(),
      tauxRetenuePourcent:
        marcheActuel !== null
          ? (tauxRetenueConstate(cumul.retenueGarantieCumuleeHt, marcheActuel)?.toFixed(2) ?? null)
          : null,
      nbSituations: lot._count.situations,
      attribue: lot.montantRetenuHt !== null,
      entrepriseNom: lot.offreRetenue?.consultation.entreprise.raisonSociale ?? null,
    })
  }

  // Les avenants non rattachés à un lot comptent au niveau de l'opération.
  const avenantsHorsLot = await client.avenant.findMany({
    where: { missionId, lotId: null, statut: 'ACCEPTE' },
    select: { montantHt: true },
  })

  const marcheInitialHt = Money.somme(
    lignes.filter((l) => l.marcheInitialHt !== null).map((l) => Money.depuisCentimes(l.marcheInitialHt!)),
  )
  const avenantsDesLots = Money.somme(lignes.map((l) => Money.depuisCentimes(l.avenantsAcceptesHt)))
  const avenantsCumulesHt = Money.ajouter(
    avenantsDesLots,
    Money.somme(avenantsHorsLot.map((a) => Money.depuisCentimes(a.montantHt))),
  )
  const travauxRealisesHt = Money.somme(lignes.map((l) => Money.depuisCentimes(l.travauxRealisesHt)))
  const estimatifHt = Money.somme(lignes.map((l) => Money.depuisCentimes(l.estimatifHt)))

  const tableau = tableauFinancier({
    marcheInitialHt,
    avenantsAcceptesHt: [avenantsCumulesHt],
    cumulRealiseHt: travauxRealisesHt,
    estimatifInitialHt: estimatifHt,
    seuilDerivePourcent: mission.seuilDerivePourcent.toString(),
  })

  return {
    referenceEstimatif: reference.description,
    estimatifHt: (estimatifHt as bigint).toString(),
    marcheInitialHt: (tableau.marcheInitialHt as bigint).toString(),
    avenantsCumulesHt: (tableau.avenantsCumulesHt as bigint).toString(),
    marcheActuelHt: (tableau.marcheActuelHt as bigint).toString(),
    travauxRealisesHt: (tableau.travauxRealisesHt as bigint).toString(),
    resteARealiserHt: (tableau.resteARealiserHt as bigint).toString(),
    ecartVsEstimatifHt: (tableau.ecartVsEstimatifHt as bigint).toString(),
    ecartVsEstimatifPourcent: tableau.ecartVsEstimatifPourcent
      ? tableau.ecartVsEstimatifPourcent.toFixed(2)
      : null,
    avancementPourcent: tableau.avancementPourcent ? tableau.avancementPourcent.toFixed(2) : null,
    deriveDetectee: tableau.deriveDetectee,
    seuilDerivePourcent: mission.seuilDerivePourcent.toString(),
    retenueGarantieCumuleeHt: (
      Money.somme(lignes.map((l) => Money.depuisCentimes(l.retenueGarantieCumuleeHt))) as bigint
    ).toString(),
    nbLotsAttribues: lignes.filter((l) => l.attribue).length,
    nbLots: lignes.length,
    lots: lignes,
  }
}
