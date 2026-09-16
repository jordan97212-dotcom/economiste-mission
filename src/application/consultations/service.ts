import type { PrismaClient, StatutConsultation as StatutPrisma } from '@prisma/client'
import { difference, journaliser } from '../audit/service'

/**
 * Consultation des entreprises — SPEC_APP_ECONOMISTE.md §5.5.
 *
 * Une consultation relie une entreprise à un lot d'une mission précise : la
 * même entreprise peut être consultée sur plusieurs lots, ou sur plusieurs
 * missions, chaque fois avec son propre suivi de statut et de dates.
 */

export interface EntreeConsultation {
  readonly lotId: string
  readonly entrepriseId: string
  readonly dateEnvoiDce?: Date | null
  readonly dateLimiteRemise?: Date | null
}

export class ConsultationIntrouvable extends Error {
  constructor(id: string) {
    super(`Consultation introuvable : ${id}`)
    this.name = 'ConsultationIntrouvable'
  }
}

async function verifierLotDeMission(client: PrismaClient, missionId: string, lotId: string): Promise<void> {
  const lot = await client.lot.findFirst({ where: { id: lotId, missionId }, select: { id: true } })
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)
}

export interface ConsultationDTO {
  readonly id: string
  readonly entrepriseId: string
  readonly entrepriseNom: string
  readonly statut: StatutPrisma
  readonly dateEnvoiDce: Date | null
  readonly dateLimiteRemise: Date | null
  readonly dateRelance: Date | null
  readonly dateReceptionOffre: Date | null
  readonly nbOffres: number
}

export async function listerConsultationsDuLot(
  client: PrismaClient,
  missionId: string,
  lotId: string,
): Promise<ConsultationDTO[]> {
  await verifierLotDeMission(client, missionId, lotId)

  const consultations = await client.consultation.findMany({
    where: { lotId },
    include: { entreprise: { select: { raisonSociale: true } }, _count: { select: { offres: true } } },
    orderBy: { entreprise: { raisonSociale: 'asc' } },
  })

  return consultations.map((c) => ({
    id: c.id,
    entrepriseId: c.entrepriseId,
    entrepriseNom: c.entreprise.raisonSociale,
    statut: c.statut,
    dateEnvoiDce: c.dateEnvoiDce,
    dateLimiteRemise: c.dateLimiteRemise,
    dateRelance: c.dateRelance,
    dateReceptionOffre: c.dateReceptionOffre,
    nbOffres: c._count.offres,
  }))
}

export async function creerConsultation(
  client: PrismaClient,
  missionId: string,
  entree: EntreeConsultation,
): Promise<string> {
  await verifierLotDeMission(client, missionId, entree.lotId)

  const entreprise = await client.entreprise.findFirst({
    where: { id: entree.entrepriseId },
    select: { raisonSociale: true },
  })
  if (!entreprise) throw new Error(`Entreprise introuvable : ${entree.entrepriseId}`)

  const existante = await client.consultation.findUnique({
    where: { lotId_entrepriseId: { lotId: entree.lotId, entrepriseId: entree.entrepriseId } },
    select: { id: true },
  })
  if (existante) {
    throw new Error(`« ${entreprise.raisonSociale} » est déjà consultée sur ce lot.`)
  }

  const consultation = await client.consultation.create({
    data: {
      missionId,
      lotId: entree.lotId,
      entrepriseId: entree.entrepriseId,
      dateEnvoiDce: entree.dateEnvoiDce ?? null,
      dateLimiteRemise: entree.dateLimiteRemise ?? null,
      statut: 'ENVOYEE',
    },
    select: { id: true },
  })

  await journaliser(client, {
    entite: 'Consultation',
    entiteId: consultation.id,
    action: 'CREATION',
    apres: { raisonSociale: entreprise.raisonSociale },
  })

  return consultation.id
}

export async function modifierConsultation(
  client: PrismaClient,
  id: string,
  entree: {
    readonly statut?: StatutPrisma
    readonly dateEnvoiDce?: Date | null
    readonly dateLimiteRemise?: Date | null
    readonly dateRelance?: Date | null
  },
): Promise<void> {
  const avant = await client.consultation.findFirst({ where: { id } })
  if (!avant) throw new ConsultationIntrouvable(id)

  const apres = await client.consultation.update({
    where: { id },
    data: {
      ...(entree.statut !== undefined ? { statut: entree.statut } : {}),
      ...(entree.dateEnvoiDce !== undefined ? { dateEnvoiDce: entree.dateEnvoiDce } : {}),
      ...(entree.dateLimiteRemise !== undefined ? { dateLimiteRemise: entree.dateLimiteRemise } : {}),
      ...(entree.dateRelance !== undefined ? { dateRelance: entree.dateRelance } : {}),
    },
  })

  const ecart = difference(
    avant as unknown as Record<string, unknown>,
    apres as unknown as Record<string, unknown>,
  )
  if (ecart) {
    await journaliser(client, {
      entite: 'Consultation',
      entiteId: id,
      action: 'MODIFICATION',
      avant: ecart.avant,
      apres: ecart.apres,
    })
  }
}

export async function supprimerConsultation(client: PrismaClient, id: string): Promise<void> {
  const consultation = await client.consultation.findFirst({
    where: { id },
    include: { entreprise: { select: { raisonSociale: true } } },
  })
  if (!consultation) throw new ConsultationIntrouvable(id)

  await client.consultation.delete({ where: { id } })
  await journaliser(client, {
    entite: 'Consultation',
    entiteId: id,
    action: 'SUPPRESSION',
    avant: { raisonSociale: consultation.entreprise.raisonSociale },
  })
}
