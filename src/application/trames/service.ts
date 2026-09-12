import { Prisma, type PrismaClient } from '@prisma/client'
import { creerTexte, estTexteStructure, type TexteStructure } from '../../domain/texte/structure'

/**
 * Bibliothèque de trames — SPEC_APP_ECONOMISTE.md §5.4.
 *
 * Les trames de CCTP sont rangées par corps d'état ; celles de CCAP et de CCTG
 * valent pour l'opération entière et n'en portent donc pas. Une trame de CCTP
 * sans corps d'état sert de généralités, placées en tête du document.
 */

export type TypeTrame = 'CCTP' | 'CCAP' | 'CCTG' | 'HONORAIRES'

export interface EntreeTrame {
  readonly type: TypeTrame
  readonly intitule: string
  readonly corpsEtatId?: string | null
  readonly contenu: string
}

export class TrameIntrouvable extends Error {
  constructor(id: string) {
    super(`Trame introuvable ou inaccessible : ${id}`)
    this.name = 'TrameIntrouvable'
  }
}

export function contenuDeTrame(valeur: Prisma.JsonValue | null): string {
  if (!estTexteStructure(valeur)) return ''
  return (valeur as TexteStructure).contenu
}

export async function listerTrames(client: PrismaClient, type?: TypeTrame) {
  return client.trame.findMany({
    where: type ? { type } : {},
    orderBy: [{ type: 'asc' }, { intitule: 'asc' }],
    include: { corpsEtat: { select: { id: true, code: true, libelle: true } } },
  })
}

export async function creerTrame(client: PrismaClient, entree: EntreeTrame): Promise<string> {
  if (!entree.intitule.trim()) throw new Error('L’intitulé de la trame est obligatoire.')

  const trame = await client.trame.create({
    data: {
      type: entree.type,
      intitule: entree.intitule.trim(),
      corpsEtatId: entree.type === 'CCTP' ? entree.corpsEtatId || null : null,
      contenu: creerTexte(entree.contenu) as unknown as Prisma.InputJsonValue,
    } as unknown as Prisma.TrameCreateInput,
    select: { id: true },
  })
  return trame.id
}

export async function modifierTrame(
  client: PrismaClient,
  id: string,
  entree: Partial<EntreeTrame>,
): Promise<void> {
  const existante = await client.trame.findUnique({ where: { id }, select: { id: true } })
  if (!existante) throw new TrameIntrouvable(id)

  const donnees: Prisma.TrameUncheckedUpdateInput = {}
  if (entree.intitule !== undefined) donnees.intitule = entree.intitule.trim()
  if (entree.contenu !== undefined) {
    donnees.contenu = creerTexte(entree.contenu) as unknown as Prisma.InputJsonValue
  }
  if (entree.corpsEtatId !== undefined) donnees.corpsEtatId = entree.corpsEtatId || null

  await client.trame.update({ where: { id }, data: donnees })
}

export async function supprimerTrame(client: PrismaClient, id: string): Promise<void> {
  const existante = await client.trame.findUnique({ where: { id }, select: { id: true } })
  if (!existante) throw new TrameIntrouvable(id)
  await client.trame.delete({ where: { id } })
}

/** Trames proposées pour un ouvrage, selon le corps d'état de son lot. */
export async function tramesPourCorpsEtat(client: PrismaClient, corpsEtatId: string | null) {
  return client.trame.findMany({
    where: { type: 'CCTP', ...(corpsEtatId ? { corpsEtatId } : {}) },
    orderBy: { intitule: 'asc' },
    select: { id: true, intitule: true, corpsEtatId: true },
  })
}
