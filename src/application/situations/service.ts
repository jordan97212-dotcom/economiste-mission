import type { PrismaClient } from '@prisma/client'
import { dec } from '../../domain/money/decimal'
import * as Money from '../../domain/money/money'
import type { Money as MoneyValue } from '../../domain/money/money'
import {
  avancementDepuisMontant,
  calculerSituation,
  situationDepuisMontant,
} from '../../domain/situations/calcul'
import { cumulerSituations, decompterSituation } from '../../domain/situations/decompte'
import { lireNombre } from '../saisie'
import { difference, journaliser } from '../audit/service'

/**
 * Situations de travaux — SPEC_APP_ECONOMISTE.md §5.6.
 *
 * Une situation est un montant cumulé validé à une date. Le pourcentage
 * d'avancement n'est qu'une façon de le saisir, et un affichage : c'est le
 * montant cumulé qui fait foi. Conséquence voulue — quand un avenant élargit
 * le marché, une situation déjà validée ne bouge pas d'un centime ; seul son
 * pourcentage, qui n'est qu'une lecture, se recalcule.
 *
 * Le montant de période est toujours dérivé : cumul de la situation moins
 * cumul de la précédente. Il n'est jamais saisi, donc la somme des périodes
 * retombe toujours exactement sur le cumul final.
 */

export class SituationIntrouvable extends Error {
  constructor(id: string) {
    super(`Situation introuvable : ${id}`)
    this.name = 'SituationIntrouvable'
  }
}

export class LotSansMarche extends Error {
  constructor(numero: string) {
    super(
      `Le lot ${numero} n'a pas de marché : retenez d'abord une offre. Une situation de travaux se calcule sur un marché attribué, pas sur un estimatif.`,
    )
    this.name = 'LotSansMarche'
  }
}

/** Marché actuel d'un lot : offre retenue plus ses avenants acceptés. */
export async function marcheDuLot(
  client: PrismaClient,
  missionId: string,
  lotId: string,
): Promise<MoneyValue | null> {
  const lot = await client.lot.findFirst({
    where: { id: lotId, missionId },
    select: { montantRetenuHt: true },
  })
  if (!lot || lot.montantRetenuHt === null) return null

  const avenants = await client.avenant.findMany({
    where: { missionId, lotId, statut: 'ACCEPTE' },
    select: { montantHt: true },
  })

  return Money.ajouter(
    Money.depuisCentimes(lot.montantRetenuHt),
    Money.somme(avenants.map((a) => Money.depuisCentimes(a.montantHt))),
  )
}

export interface SituationDTO {
  readonly id: string
  readonly numeroSituation: number
  readonly periode: Date
  readonly avancementPourcent: string
  readonly montantCumuleHt: string
  readonly montantPeriodeHt: string
  readonly retenueGarantieHt: string
  readonly avanceRemboursee: string
  readonly compteProrataHt: string
  readonly netAPayerHt: string
  readonly dateValidation: Date | null
}

export async function listerSituations(
  client: PrismaClient,
  missionId: string,
  lotId: string,
): Promise<SituationDTO[]> {
  const situations = await client.situationTravaux.findMany({
    where: { missionId, lotId },
    orderBy: { numeroSituation: 'asc' },
  })

  return situations.map((s) => {
    const decompte = decompterSituation({
      montantPeriodeHt: Money.depuisCentimes(s.montantPeriodeHt),
      retenueGarantieHt: Money.depuisCentimes(s.retenueGarantieHt),
      avanceRembourseeHt: Money.depuisCentimes(s.avanceRemboursee),
      compteProrataHt: Money.depuisCentimes(s.compteProrataHt),
    })

    return {
      id: s.id,
      numeroSituation: s.numeroSituation,
      periode: s.periode,
      avancementPourcent: s.avancementPourcent.toString(),
      montantCumuleHt: s.montantCumuleHt.toString(),
      montantPeriodeHt: s.montantPeriodeHt.toString(),
      retenueGarantieHt: s.retenueGarantieHt.toString(),
      avanceRemboursee: s.avanceRemboursee.toString(),
      compteProrataHt: s.compteProrataHt.toString(),
      netAPayerHt: (decompte.netAPayerHt as bigint).toString(),
      dateValidation: s.dateValidation ? s.dateValidation : null,
    }
  })
}

export interface EntreeSituationSaisie {
  readonly periode: Date
  /** L'un ou l'autre : l'avancement en pourcentage, ou le montant cumulé. */
  readonly avancementPourcent?: string | null
  readonly montantCumuleHt?: string | null
  readonly retenueGarantieHt?: string | null
  readonly avanceRemboursee?: string | null
  readonly compteProrataHt?: string | null
  readonly dateValidation?: Date | null
}

function lireMontant(brut: string | null | undefined, champ: string): bigint {
  if (!brut || brut.trim() === '') return 0n
  const nombre = lireNombre(brut)
  if (nombre === null) throw new Error(`${champ} illisible : « ${brut} »`)
  return Money.depuisEuros(nombre) as bigint
}

/**
 * Recalcule les périodes et les pourcentages de toutes les situations d'un
 * lot, dans l'ordre. Appelé après toute création, modification ou suppression :
 * il ne doit jamais exister en base une période qui contredise ses cumuls.
 */
async function rechainer(client: PrismaClient, missionId: string, lotId: string): Promise<void> {
  const marche = (await marcheDuLot(client, missionId, lotId)) ?? Money.ZERO

  const situations = await client.situationTravaux.findMany({
    where: { missionId, lotId },
    orderBy: { numeroSituation: 'asc' },
    select: { id: true, montantCumuleHt: true },
  })

  let precedent = Money.ZERO
  for (const situation of situations) {
    const cumul = Money.depuisCentimes(situation.montantCumuleHt)
    const periode = Money.soustraire(cumul, precedent)
    const avancement = avancementDepuisMontant(cumul, marche)

    await client.situationTravaux.update({
      where: { id: situation.id },
      data: {
        montantPeriodeHt: periode as bigint,
        avancementPourcent: avancement ? avancement.toFixed(2) : '0',
      },
    })

    precedent = cumul
  }
}

export async function creerSituation(
  client: PrismaClient,
  missionId: string,
  lotId: string,
  entree: EntreeSituationSaisie,
): Promise<string> {
  const lot = await client.lot.findFirst({
    where: { id: lotId, missionId },
    select: { id: true, numero: true, montantRetenuHt: true },
  })
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)
  if (lot.montantRetenuHt === null) throw new LotSansMarche(lot.numero)

  const marche = (await marcheDuLot(client, missionId, lotId)) ?? Money.ZERO

  const derniere = await client.situationTravaux.findFirst({
    where: { missionId, lotId },
    orderBy: { numeroSituation: 'desc' },
    select: { numeroSituation: true, montantCumuleHt: true },
  })
  const cumulPrecedent = derniere ? Money.depuisCentimes(derniere.montantCumuleHt) : Money.ZERO

  // Deux façons de saisir, une seule vérité stockée : le montant cumulé.
  let resultat
  if (entree.montantCumuleHt && entree.montantCumuleHt.trim() !== '') {
    resultat = situationDepuisMontant(
      Money.depuisCentimes(lireMontant(entree.montantCumuleHt, 'Montant cumulé')),
      cumulPrecedent,
    )
  } else if (entree.avancementPourcent && entree.avancementPourcent.trim() !== '') {
    const pourcent = lireNombre(entree.avancementPourcent)
    if (pourcent === null) throw new Error(`Avancement illisible : « ${entree.avancementPourcent} »`)
    resultat = calculerSituation({
      montantMarcheHt: marche,
      avancementPourcent: pourcent,
      cumulPrecedentHt: cumulPrecedent,
    })
  } else {
    throw new Error('Saisissez un avancement en pourcentage, ou un montant cumulé.')
  }

  const avancement = avancementDepuisMontant(resultat.montantCumuleHt, marche)

  const situation = await client.situationTravaux.create({
    data: {
      missionId,
      lotId,
      numeroSituation: (derniere?.numeroSituation ?? 0) + 1,
      periode: entree.periode,
      avancementPourcent: avancement ? avancement.toFixed(2) : '0',
      montantCumuleHt: resultat.montantCumuleHt as bigint,
      montantPeriodeHt: resultat.montantPeriodeHt as bigint,
      retenueGarantieHt: lireMontant(entree.retenueGarantieHt, 'Retenue de garantie'),
      avanceRemboursee: lireMontant(entree.avanceRemboursee, 'Avance remboursée'),
      compteProrataHt: lireMontant(entree.compteProrataHt, 'Compte prorata'),
      dateValidation: entree.dateValidation ?? null,
    },
    select: { id: true, numeroSituation: true, montantCumuleHt: true },
  })

  await journaliser(client, {
    entite: 'Situation',
    entiteId: situation.id,
    action: 'CREATION',
    apres: {
      numeroSituation: situation.numeroSituation,
      montantCumuleHt: situation.montantCumuleHt.toString(),
      montantPeriodeHt: (resultat.montantPeriodeHt as bigint).toString(),
    },
  })

  return situation.id
}

export async function modifierSituation(
  client: PrismaClient,
  missionId: string,
  id: string,
  entree: EntreeSituationSaisie,
): Promise<void> {
  const avant = await client.situationTravaux.findFirst({ where: { id, missionId } })
  if (!avant) throw new SituationIntrouvable(id)

  const marche = (await marcheDuLot(client, missionId, avant.lotId)) ?? Money.ZERO

  let montantCumule = Money.depuisCentimes(avant.montantCumuleHt)
  if (entree.montantCumuleHt && entree.montantCumuleHt.trim() !== '') {
    montantCumule = Money.depuisCentimes(lireMontant(entree.montantCumuleHt, 'Montant cumulé'))
  } else if (entree.avancementPourcent && entree.avancementPourcent.trim() !== '') {
    const pourcent = lireNombre(entree.avancementPourcent)
    if (pourcent === null) throw new Error(`Avancement illisible : « ${entree.avancementPourcent} »`)
    montantCumule = Money.depuisEuros(Money.versEuros(marche).mul(dec(pourcent)).div(100))
  }

  const apres = await client.situationTravaux.update({
    where: { id },
    data: {
      montantCumuleHt: montantCumule as bigint,
      ...(entree.periode !== undefined ? { periode: entree.periode } : {}),
      ...(entree.retenueGarantieHt !== undefined
        ? { retenueGarantieHt: lireMontant(entree.retenueGarantieHt, 'Retenue de garantie') }
        : {}),
      ...(entree.avanceRemboursee !== undefined
        ? { avanceRemboursee: lireMontant(entree.avanceRemboursee, 'Avance remboursée') }
        : {}),
      ...(entree.compteProrataHt !== undefined
        ? { compteProrataHt: lireMontant(entree.compteProrataHt, 'Compte prorata') }
        : {}),
      ...(entree.dateValidation !== undefined ? { dateValidation: entree.dateValidation } : {}),
    },
  })

  // Une situation modifiée déplace toutes celles qui la suivent.
  await rechainer(client, missionId, avant.lotId)

  const ecart = difference(
    avant as unknown as Record<string, unknown>,
    apres as unknown as Record<string, unknown>,
  )
  if (ecart) {
    await journaliser(client, {
      entite: 'Situation',
      entiteId: id,
      action: 'MODIFICATION',
      avant: ecart.avant,
      apres: ecart.apres,
    })
  }
}

export async function supprimerSituation(
  client: PrismaClient,
  missionId: string,
  id: string,
): Promise<void> {
  const situation = await client.situationTravaux.findFirst({
    where: { id, missionId },
    select: { id: true, lotId: true, numeroSituation: true, montantCumuleHt: true },
  })
  if (!situation) throw new SituationIntrouvable(id)

  await client.situationTravaux.delete({ where: { id } })

  // Renumérotation : une suite de situations trouée se lit mal sur un décompte.
  const restantes = await client.situationTravaux.findMany({
    where: { missionId, lotId: situation.lotId },
    orderBy: { numeroSituation: 'asc' },
    select: { id: true },
  })
  for (const [index, restante] of restantes.entries()) {
    await client.situationTravaux.update({
      where: { id: restante.id },
      data: { numeroSituation: index + 1 },
    })
  }

  await rechainer(client, missionId, situation.lotId)

  await journaliser(client, {
    entite: 'Situation',
    entiteId: id,
    action: 'SUPPRESSION',
    avant: {
      numeroSituation: situation.numeroSituation,
      montantCumuleHt: situation.montantCumuleHt.toString(),
    },
  })
}

/** Cumul de toutes les situations d'un lot, déductions comprises. */
export async function cumulDuLot(client: PrismaClient, missionId: string, lotId: string) {
  const situations = await client.situationTravaux.findMany({
    where: { missionId, lotId },
    select: {
      montantPeriodeHt: true,
      retenueGarantieHt: true,
      avanceRemboursee: true,
      compteProrataHt: true,
    },
  })

  return cumulerSituations(
    situations.map((s) => ({
      montantPeriodeHt: Money.depuisCentimes(s.montantPeriodeHt),
      retenueGarantieHt: Money.depuisCentimes(s.retenueGarantieHt),
      avanceRembourseeHt: Money.depuisCentimes(s.avanceRemboursee),
      compteProrataHt: Money.depuisCentimes(s.compteProrataHt),
    })),
  )
}
