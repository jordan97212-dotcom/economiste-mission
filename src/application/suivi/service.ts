import type { PrismaClient } from '@prisma/client'
import * as Money from '../../domain/money/money'
import { tableauFinancier } from '../../domain/situations/calcul'
import { tauxRetenueConstate } from '../../domain/situations/decompte'
import { cumulDuLot, marcheDuLot } from '../situations/service'

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

export interface SuiviMission {
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

export async function chargerSuivi(client: PrismaClient, missionId: string): Promise<SuiviMission> {
  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { id: true, seuilDerivePourcent: true },
  })
  if (!mission) throw new Error(`Mission introuvable : ${missionId}`)

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
      estimatifHt: lot.montantEstimeHt.toString(),
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
