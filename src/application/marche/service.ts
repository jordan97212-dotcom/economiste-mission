import type { PrismaClient } from '@prisma/client'
import * as Money from '../../domain/money/money'
import { journaliser } from '../audit/service'

/**
 * Attribution d'un lot — SPEC_APP_ECONOMISTE.md §5.6.
 *
 * C'est le maillon entre la consultation et le chantier : tant qu'aucune offre
 * n'est retenue, le lot n'a pas de marché, et une situation de travaux n'aurait
 * rien sur quoi s'appuyer.
 *
 * Le montant du marché est le montant net de remise de l'offre retenue. Il est
 * recopié sur le lot plutôt que relu par jointure : le marché d'un lot ne doit
 * pas changer sous les pieds de l'économiste parce qu'une offre a été corrigée
 * après coup.
 */

export class OffreIntrouvable extends Error {
  constructor(id: string) {
    super(`Offre introuvable ou hors de la mission : ${id}`)
    this.name = 'OffreIntrouvable'
  }
}

export interface Attribution {
  readonly lotId: string
  readonly offreId: string | null
  readonly entrepriseNom: string | null
  readonly montantRetenuHt: string | null
  readonly conforme: boolean | null
}

export async function chargerAttribution(
  client: PrismaClient,
  missionId: string,
  lotId: string,
): Promise<Attribution> {
  const lot = await client.lot.findFirst({
    where: { id: lotId, missionId },
    select: {
      id: true,
      montantRetenuHt: true,
      offreRetenueId: true,
      offreRetenue: {
        select: {
          conforme: true,
          consultation: { select: { entreprise: { select: { raisonSociale: true } } } },
        },
      },
    },
  })
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)

  return {
    lotId: lot.id,
    offreId: lot.offreRetenueId,
    entrepriseNom: lot.offreRetenue?.consultation.entreprise.raisonSociale ?? null,
    montantRetenuHt: lot.montantRetenuHt !== null ? lot.montantRetenuHt.toString() : null,
    conforme: lot.offreRetenue?.conforme ?? null,
  }
}

/**
 * Retient une offre pour un lot. Une offre non conforme peut être retenue —
 * après régularisation ou négociation, cela arrive — mais le fait est
 * journalisé tel quel : l'application constate, elle ne juge pas à la place
 * de l'économiste.
 */
export async function retenirOffre(
  client: PrismaClient,
  missionId: string,
  lotId: string,
  offreId: string,
): Promise<void> {
  const lot = await client.lot.findFirst({
    where: { id: lotId, missionId },
    select: { id: true, numero: true, montantRetenuHt: true },
  })
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)

  const offre = await client.offre.findFirst({
    where: { id: offreId, consultation: { lotId } },
    include: { consultation: { include: { entreprise: { select: { raisonSociale: true } } } } },
  })
  if (!offre) throw new OffreIntrouvable(offreId)

  const montantNet = Money.soustraire(
    Money.depuisCentimes(offre.montantHt),
    Money.depuisCentimes(offre.remiseGlobaleHt),
  )

  await client.lot.update({
    where: { id: lotId },
    data: { offreRetenueId: offreId, montantRetenuHt: montantNet as bigint },
  })

  await journaliser(client, {
    entite: 'Attribution',
    entiteId: lotId,
    action: lot.montantRetenuHt === null ? 'CREATION' : 'MODIFICATION',
    avant: lot.montantRetenuHt !== null ? { montantRetenuHt: lot.montantRetenuHt.toString() } : null,
    apres: {
      raisonSociale: offre.consultation.entreprise.raisonSociale,
      montantRetenuHt: (montantNet as bigint).toString(),
      conforme: offre.conforme,
    },
  })
}

/**
 * Annule l'attribution. Refusée si des situations existent déjà : elles ont
 * été établies sur ce marché, les laisser derrière une attribution effacée
 * les rendrait incompréhensibles.
 */
export async function annulerAttribution(
  client: PrismaClient,
  missionId: string,
  lotId: string,
): Promise<void> {
  const lot = await client.lot.findFirst({
    where: { id: lotId, missionId },
    select: { id: true, montantRetenuHt: true, _count: { select: { situations: true } } },
  })
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)

  if (lot._count.situations > 0) {
    throw new Error(
      `Ce lot porte ${lot._count.situations} situation(s) de travaux établies sur ce marché. Supprimez-les d'abord si l'attribution doit changer.`,
    )
  }

  await client.lot.update({
    where: { id: lotId },
    data: { offreRetenueId: null, montantRetenuHt: null },
  })

  await journaliser(client, {
    entite: 'Attribution',
    entiteId: lotId,
    action: 'SUPPRESSION',
    avant: lot.montantRetenuHt !== null ? { montantRetenuHt: lot.montantRetenuHt.toString() } : null,
  })
}
