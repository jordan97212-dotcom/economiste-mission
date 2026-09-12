import { Prisma, type PrismaClient } from '@prisma/client'
import { MissionIntrouvable, recalculerMission } from './service'

export class PosteIntrouvable extends Error {
  constructor(id: string) {
    super(`Poste introuvable ou hors de la mission : ${id}`)
    this.name = 'PosteIntrouvable'
  }
}

async function verifierMission(client: PrismaClient, missionId: string): Promise<void> {
  const mission = await client.mission.findUnique({ where: { id: missionId }, select: { id: true } })
  if (!mission) throw new MissionIntrouvable(missionId)
}

async function verifierLot(client: PrismaClient, missionId: string, lotId: string): Promise<void> {
  const lot = await client.lot.findFirst({ where: { id: lotId, missionId }, select: { id: true } })
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)
}

export interface EntreeLot {
  readonly numero: string
  readonly intitule: string
  readonly corpsEtatId?: string | null
  readonly coefficientLocal?: string | null
}

function decimalOuNull(valeur: string | null | undefined): Prisma.Decimal | null {
  if (valeur === null || valeur === undefined) return null
  const nettoye = valeur.trim().replace(',', '.')
  return nettoye === '' ? null : new Prisma.Decimal(nettoye)
}

export async function creerLot(
  client: PrismaClient,
  missionId: string,
  entree: EntreeLot,
): Promise<string> {
  await verifierMission(client, missionId)
  const dernier = await client.lot.findFirst({
    where: { missionId },
    orderBy: { ordre: 'desc' },
    select: { ordre: true },
  })

  const lot = await client.lot.create({
    data: {
      missionId,
      numero: entree.numero.trim(),
      intitule: entree.intitule.trim(),
      ordre: (dernier?.ordre ?? -1) + 1,
      corpsEtatId: entree.corpsEtatId || null,
      coefficientLocal: decimalOuNull(entree.coefficientLocal),
    },
    select: { id: true },
  })
  return lot.id
}

export async function modifierLot(
  client: PrismaClient,
  missionId: string,
  lotId: string,
  entree: Partial<EntreeLot>,
): Promise<void> {
  await verifierLot(client, missionId, lotId)
  const donnees: Prisma.LotUpdateInput = {}
  if (entree.numero !== undefined) donnees.numero = entree.numero.trim()
  if (entree.intitule !== undefined) donnees.intitule = entree.intitule.trim()
  if (entree.coefficientLocal !== undefined) donnees.coefficientLocal = decimalOuNull(entree.coefficientLocal)
  if (entree.corpsEtatId !== undefined) {
    donnees.corpsEtat = entree.corpsEtatId ? { connect: { id: entree.corpsEtatId } } : { disconnect: true }
  }
  await client.lot.update({ where: { id: lotId }, data: donnees })
  // Le coefficient du lot pilote toutes ses lignes.
  await recalculerMission(client, missionId)
}

export async function supprimerLot(client: PrismaClient, missionId: string, lotId: string): Promise<void> {
  await verifierLot(client, missionId, lotId)
  await client.lot.delete({ where: { id: lotId } })
  await recalculerMission(client, missionId)
}

export interface EntreePoste {
  readonly lotId: string
  readonly type: 'SOUS_LOT' | 'OUVRAGE'
  readonly parentId?: string | null
  /** Insérer juste après ce poste ; à défaut, en fin de fratrie. */
  readonly apresPosteId?: string | null
  readonly designation?: string
  readonly code?: string | null
  readonly unite?: string | null
}

/** Renumérote une fratrie de zéro à n, pour que l'ordre reste dense et stable. */
async function renumeroter(client: PrismaClient, lotId: string, parentId: string | null): Promise<void> {
  const fratrie = await client.poste.findMany({
    where: { lotId, parentId },
    orderBy: { ordre: 'asc' },
    select: { id: true },
  })
  await client.$transaction(
    fratrie.map((p, index) => client.poste.update({ where: { id: p.id }, data: { ordre: index } })),
  )
}

export async function ajouterPoste(
  client: PrismaClient,
  missionId: string,
  entree: EntreePoste,
): Promise<string> {
  await verifierLot(client, missionId, entree.lotId)

  let parentId = entree.parentId ?? null
  let ordre: number

  if (entree.apresPosteId) {
    const voisin = await client.poste.findFirst({
      where: { id: entree.apresPosteId, lotId: entree.lotId },
      select: { parentId: true, ordre: true },
    })
    if (!voisin) throw new PosteIntrouvable(entree.apresPosteId)
    parentId = entree.parentId === undefined ? voisin.parentId : parentId
    ordre = voisin.ordre + 1
    await client.poste.updateMany({
      where: { lotId: entree.lotId, parentId, ordre: { gte: ordre } },
      data: { ordre: { increment: 1 } },
    })
  } else {
    const dernier = await client.poste.findFirst({
      where: { lotId: entree.lotId, parentId },
      orderBy: { ordre: 'desc' },
      select: { ordre: true },
    })
    ordre = (dernier?.ordre ?? -1) + 1
  }

  const poste = await client.poste.create({
    data: {
      lotId: entree.lotId,
      parentId,
      type: entree.type,
      ordre,
      code: entree.code || null,
      designation: entree.designation ?? (entree.type === 'SOUS_LOT' ? 'Nouveau sous-lot' : ''),
      unite: (entree.unite || null) as NonNullable<Prisma.PosteCreateInput['unite']> | null,
    },
    select: { id: true },
  })

  return poste.id
}

export async function supprimerPoste(
  client: PrismaClient,
  missionId: string,
  posteId: string,
): Promise<void> {
  const poste = await client.poste.findFirst({
    where: { id: posteId, lot: { missionId } },
    select: { id: true, lotId: true, parentId: true },
  })
  if (!poste) throw new PosteIntrouvable(posteId)

  // La cascade du schéma emporte la descendance.
  await client.poste.delete({ where: { id: posteId } })
  await renumeroter(client, poste.lotId, poste.parentId)
  await recalculerMission(client, missionId)
}

export type SensDeplacement = 'haut' | 'bas' | 'indenter' | 'desindenter'

/**
 * Déplace un poste dans l'arbre. Indenter le rattache au frère qui le précède,
 * désindenter le remonte au niveau de son parent, juste après celui-ci.
 */
export async function deplacerPoste(
  client: PrismaClient,
  missionId: string,
  posteId: string,
  sens: SensDeplacement,
): Promise<void> {
  const poste = await client.poste.findFirst({
    where: { id: posteId, lot: { missionId } },
    select: { id: true, lotId: true, parentId: true, ordre: true },
  })
  if (!poste) throw new PosteIntrouvable(posteId)

  const fratrie = await client.poste.findMany({
    where: { lotId: poste.lotId, parentId: poste.parentId },
    orderBy: { ordre: 'asc' },
    select: { id: true, ordre: true, type: true },
  })
  const position = fratrie.findIndex((p) => p.id === posteId)

  if (sens === 'haut' || sens === 'bas') {
    const cible = sens === 'haut' ? position - 1 : position + 1
    if (cible < 0 || cible >= fratrie.length) return
    const voisin = fratrie[cible]
    const courant = fratrie[position]
    if (!voisin || !courant) return
    await client.$transaction([
      client.poste.update({ where: { id: courant.id }, data: { ordre: voisin.ordre } }),
      client.poste.update({ where: { id: voisin.id }, data: { ordre: courant.ordre } }),
    ])
    return
  }

  if (sens === 'indenter') {
    const precedent = fratrie[position - 1]
    if (!precedent) return
    if (precedent.type !== 'SOUS_LOT') {
      await client.poste.update({ where: { id: precedent.id }, data: { type: 'SOUS_LOT' } })
    }
    const dernier = await client.poste.findFirst({
      where: { lotId: poste.lotId, parentId: precedent.id },
      orderBy: { ordre: 'desc' },
      select: { ordre: true },
    })
    await client.poste.update({
      where: { id: posteId },
      data: { parentId: precedent.id, ordre: (dernier?.ordre ?? -1) + 1 },
    })
    await renumeroter(client, poste.lotId, poste.parentId)
    await recalculerMission(client, missionId)
    return
  }

  // Désindenter
  if (poste.parentId === null) return
  const parent = await client.poste.findUnique({
    where: { id: poste.parentId },
    select: { id: true, parentId: true, ordre: true },
  })
  if (!parent) return

  await client.poste.updateMany({
    where: { lotId: poste.lotId, parentId: parent.parentId, ordre: { gt: parent.ordre } },
    data: { ordre: { increment: 1 } },
  })
  await client.poste.update({
    where: { id: posteId },
    data: { parentId: parent.parentId, ordre: parent.ordre + 1 },
  })
  await renumeroter(client, poste.lotId, poste.parentId)
  await recalculerMission(client, missionId)
}
