import type { PrismaClient, StatutAvenant } from '@prisma/client'
import * as Money from '../../domain/money/money'
import { lireNombre } from '../saisie'
import { difference, journaliser } from '../audit/service'

/**
 * Avenants — SPEC_APP_ECONOMISTE.md §3 et §5.6.
 *
 * Un avenant peut être négatif : une moins-value est un avenant comme un
 * autre, et l'interdire obligerait à la saisir de travers.
 *
 * Seuls les avenants acceptés entrent dans le marché actuel. Un avenant
 * proposé ou refusé reste visible — c'est une trace utile en cas de
 * contestation — mais ne déplace aucun montant.
 */

export interface EntreeAvenant {
  /** Null : avenant de niveau opération, sans lot de rattachement. */
  readonly lotId?: string | null
  readonly objet: string
  readonly montantHt: string
  readonly date: Date
  readonly motif?: string | null
  readonly statut?: StatutAvenant
}

export class AvenantIntrouvable extends Error {
  constructor(id: string) {
    super(`Avenant introuvable : ${id}`)
    this.name = 'AvenantIntrouvable'
  }
}

export interface AvenantDTO {
  readonly id: string
  readonly numero: number
  readonly lotId: string | null
  readonly lotLibelle: string | null
  readonly objet: string
  readonly montantHt: string
  readonly date: Date
  readonly motif: string | null
  readonly statut: StatutAvenant
}

function lireMontantSigne(brut: string): bigint {
  const nombre = lireNombre(brut)
  if (nombre === null) throw new Error(`Montant d'avenant illisible : « ${brut} »`)
  return Money.depuisEuros(nombre) as bigint
}

export async function listerAvenants(client: PrismaClient, missionId: string): Promise<AvenantDTO[]> {
  const avenants = await client.avenant.findMany({
    where: { missionId },
    include: { lot: { select: { numero: true, intitule: true } } },
    orderBy: { numero: 'asc' },
  })

  return avenants.map((a) => ({
    id: a.id,
    numero: a.numero,
    lotId: a.lotId,
    lotLibelle: a.lot ? `${a.lot.numero} · ${a.lot.intitule}` : null,
    objet: a.objet,
    montantHt: a.montantHt.toString(),
    date: a.date,
    motif: a.motif,
    statut: a.statut,
  }))
}

export async function creerAvenant(
  client: PrismaClient,
  missionId: string,
  entree: EntreeAvenant,
): Promise<string> {
  const mission = await client.mission.findUnique({ where: { id: missionId }, select: { id: true } })
  if (!mission) throw new Error(`Mission introuvable : ${missionId}`)

  if (entree.objet.trim() === '') throw new Error('L’objet de l’avenant est nécessaire.')

  if (entree.lotId) {
    const lot = await client.lot.findFirst({
      where: { id: entree.lotId, missionId },
      select: { id: true },
    })
    if (!lot) throw new Error(`Lot hors de la mission : ${entree.lotId}`)
  }

  const dernier = await client.avenant.findFirst({
    where: { missionId },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  })

  const avenant = await client.avenant.create({
    data: {
      missionId,
      lotId: entree.lotId ?? null,
      numero: (dernier?.numero ?? 0) + 1,
      objet: entree.objet.trim(),
      montantHt: lireMontantSigne(entree.montantHt),
      date: entree.date,
      motif: entree.motif?.trim() || null,
      statut: entree.statut ?? 'PROPOSE',
    },
    select: { id: true, numero: true, montantHt: true, statut: true },
  })

  await journaliser(client, {
    entite: 'Avenant',
    entiteId: avenant.id,
    action: 'CREATION',
    apres: {
      numero: avenant.numero,
      objet: entree.objet.trim(),
      montantHt: avenant.montantHt.toString(),
      statut: avenant.statut,
    },
  })

  return avenant.id
}

export async function modifierAvenant(
  client: PrismaClient,
  missionId: string,
  id: string,
  entree: Partial<EntreeAvenant>,
): Promise<void> {
  const avant = await client.avenant.findFirst({ where: { id, missionId } })
  if (!avant) throw new AvenantIntrouvable(id)

  const apres = await client.avenant.update({
    where: { id },
    data: {
      ...(entree.objet !== undefined ? { objet: entree.objet.trim() } : {}),
      ...(entree.montantHt !== undefined ? { montantHt: lireMontantSigne(entree.montantHt) } : {}),
      ...(entree.date !== undefined ? { date: entree.date } : {}),
      ...(entree.motif !== undefined ? { motif: entree.motif?.trim() || null } : {}),
      ...(entree.statut !== undefined ? { statut: entree.statut } : {}),
      ...(entree.lotId !== undefined ? { lotId: entree.lotId } : {}),
    },
  })

  const ecart = difference(
    avant as unknown as Record<string, unknown>,
    apres as unknown as Record<string, unknown>,
  )
  if (ecart) {
    await journaliser(client, {
      entite: 'Avenant',
      entiteId: id,
      action: 'MODIFICATION',
      avant: ecart.avant,
      apres: ecart.apres,
    })
  }
}

export async function supprimerAvenant(
  client: PrismaClient,
  missionId: string,
  id: string,
): Promise<void> {
  const avenant = await client.avenant.findFirst({
    where: { id, missionId },
    select: { numero: true, objet: true, montantHt: true },
  })
  if (!avenant) throw new AvenantIntrouvable(id)

  await client.avenant.delete({ where: { id } })

  await journaliser(client, {
    entite: 'Avenant',
    entiteId: id,
    action: 'SUPPRESSION',
    avant: {
      numero: avenant.numero,
      objet: avenant.objet,
      montantHt: avenant.montantHt.toString(),
    },
  })
}
