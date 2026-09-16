import type { Prisma, PrismaClient } from '@prisma/client'
import { difference, journaliser } from '../audit/service'

/**
 * Répertoire des entreprises — SPEC_APP_ECONOMISTE.md §3 et §5.5.
 *
 * Un simple carnet, cloisonné par propriétaire comme la base de prix : les
 * entreprises consultées sur une mission le sont potentiellement sur les
 * suivantes, d'où un répertoire transversal plutôt qu'attaché à une mission.
 */

export interface EntreeEntreprise {
  readonly raisonSociale: string
  readonly siret?: string | null
  readonly contactNom?: string | null
  readonly email?: string | null
  readonly telephone?: string | null
  readonly corpsEtatQualifies?: readonly string[]
  readonly zoneIntervention?: string | null
  readonly historiqueNotes?: string | null
}

export class EntrepriseIntrouvable extends Error {
  constructor(id: string) {
    super(`Entreprise introuvable : ${id}`)
    this.name = 'EntrepriseIntrouvable'
  }
}

export interface EntrepriseDTO {
  readonly id: string
  readonly raisonSociale: string
  readonly siret: string | null
  readonly contactNom: string | null
  readonly email: string | null
  readonly telephone: string | null
  readonly corpsEtatQualifies: readonly string[]
  readonly zoneIntervention: string | null
  readonly historiqueNotes: string | null
  readonly nbConsultations: number
}

export async function listerEntreprises(client: PrismaClient): Promise<EntrepriseDTO[]> {
  const entreprises = await client.entreprise.findMany({
    orderBy: { raisonSociale: 'asc' },
    include: { _count: { select: { consultations: true } } },
  })
  return entreprises.map((e) => ({
    id: e.id,
    raisonSociale: e.raisonSociale,
    siret: e.siret,
    contactNom: e.contactNom,
    email: e.email,
    telephone: e.telephone,
    corpsEtatQualifies: e.corpsEtatQualifies,
    zoneIntervention: e.zoneIntervention,
    historiqueNotes: e.historiqueNotes,
    nbConsultations: e._count.consultations,
  }))
}

function nettoyer(entree: EntreeEntreprise) {
  if (entree.raisonSociale.trim() === '') {
    throw new Error('La raison sociale est nécessaire.')
  }
  return {
    raisonSociale: entree.raisonSociale.trim(),
    siret: entree.siret?.trim() || null,
    contactNom: entree.contactNom?.trim() || null,
    email: entree.email?.trim() || null,
    telephone: entree.telephone?.trim() || null,
    corpsEtatQualifies: [...(entree.corpsEtatQualifies ?? [])],
    zoneIntervention: entree.zoneIntervention?.trim() || null,
    historiqueNotes: entree.historiqueNotes?.trim() || null,
  }
}

export async function creerEntreprise(client: PrismaClient, entree: EntreeEntreprise): Promise<string> {
  const donnees = nettoyer(entree)
  const entreprise = await client.entreprise.create({
    // `ownerId` est posé par l'extension Prisma, pas ici.
    data: donnees as unknown as Prisma.EntrepriseCreateInput,
    select: { id: true },
  })
  await journaliser(client, {
    entite: 'Entreprise',
    entiteId: entreprise.id,
    action: 'CREATION',
    apres: { raisonSociale: donnees.raisonSociale, siret: donnees.siret },
  })
  return entreprise.id
}

export async function modifierEntreprise(
  client: PrismaClient,
  id: string,
  entree: EntreeEntreprise,
): Promise<void> {
  const avant = await client.entreprise.findFirst({ where: { id } })
  if (!avant) throw new EntrepriseIntrouvable(id)

  const donnees = nettoyer(entree)
  const apres = await client.entreprise.update({ where: { id }, data: donnees })

  const ecart = difference(
    avant as unknown as Record<string, unknown>,
    apres as unknown as Record<string, unknown>,
  )
  if (ecart) {
    await journaliser(client, {
      entite: 'Entreprise',
      entiteId: id,
      action: 'MODIFICATION',
      avant: ecart.avant,
      apres: ecart.apres,
    })
  }
}

export async function supprimerEntreprise(client: PrismaClient, id: string): Promise<void> {
  const entreprise = await client.entreprise.findFirst({
    where: { id },
    select: { raisonSociale: true, _count: { select: { consultations: true } } },
  })
  if (!entreprise) throw new EntrepriseIntrouvable(id)
  if (entreprise._count.consultations > 0) {
    throw new Error(
      `« ${entreprise.raisonSociale} » est liée à ${entreprise._count.consultations} consultation(s) : elle ne peut pas être supprimée. Retirez d'abord les consultations, ou laissez-la au répertoire.`,
    )
  }

  await client.entreprise.delete({ where: { id } })
  await journaliser(client, {
    entite: 'Entreprise',
    entiteId: id,
    action: 'SUPPRESSION',
    avant: { raisonSociale: entreprise.raisonSociale },
  })
}
