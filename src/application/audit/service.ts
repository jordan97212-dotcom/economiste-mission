import { Prisma, type PrismaClient } from '@prisma/client'

/**
 * Journal d'audit des entités financières — ARCHITECTURE.md §7.
 *
 * Objectif : pouvoir répondre, en cas de contestation sur un chiffrage, à qui a
 * modifié quoi et quand.
 *
 * Deux partis pris.
 *
 * Le journal enregistre l'intention, pas le recalcul. Les valeurs dérivées
 * (prix unitaire final, montants, totaux de lot) sont recalculées par le
 * domaine à chaque écriture : les journaliser noierait le vrai geste sous du
 * bruit. Seuls les champs saisis sont comparés.
 *
 * Un import de DPGF laisse une entrée de synthèse, pas une par ligne. Mille
 * entrées identiques n'apprennent rien, et rendraient le journal illisible le
 * jour où il sert vraiment.
 */

export type ActionAudit = 'CREATION' | 'MODIFICATION' | 'SUPPRESSION'

export type EntiteAuditee =
  | 'Mission'
  | 'Lot'
  | 'Poste'
  | 'Avenant'
  | 'TexteCctp'
  | 'Import'
  | 'Norme'
  | 'Entreprise'
  | 'Consultation'
  | 'Offre'
  | 'RapportOffres'

export interface EntreeAudit {
  readonly entite: EntiteAuditee
  readonly entiteId: string
  readonly action: ActionAudit
  readonly avant?: Record<string, unknown> | null
  readonly apres?: Record<string, unknown> | null
}

/** Champs recalculés par le domaine : jamais journalisés. */
const CHAMPS_DERIVES = new Set([
  'prixUnitaireHtFinal',
  'montantHt',
  'montantEstimeHt',
  'modifieLe',
  'creeLe',
  'ownerId',
])

function normaliser(valeur: unknown): unknown {
  if (valeur === null || valeur === undefined) return null
  if (typeof valeur === 'bigint') return valeur.toString()
  if (valeur instanceof Date) return valeur.toISOString()
  if (typeof valeur === 'object' && 'toString' in (valeur as object)) {
    const texte = String(valeur)
    if (texte !== '[object Object]') return texte
  }
  return valeur
}

/**
 * Compare deux états et ne garde que les champs réellement modifiés,
 * hors valeurs dérivées.
 */
export function difference(
  avant: Record<string, unknown>,
  apres: Record<string, unknown>,
): { avant: Record<string, unknown>; apres: Record<string, unknown> } | null {
  const changesAvant: Record<string, unknown> = {}
  const changesApres: Record<string, unknown> = {}

  for (const cle of new Set([...Object.keys(avant), ...Object.keys(apres)])) {
    if (CHAMPS_DERIVES.has(cle)) continue
    const valeurAvant = normaliser(avant[cle])
    const valeurApres = normaliser(apres[cle])
    if (JSON.stringify(valeurAvant) === JSON.stringify(valeurApres)) continue
    changesAvant[cle] = valeurAvant
    changesApres[cle] = valeurApres
  }

  if (Object.keys(changesApres).length === 0) return null
  return { avant: changesAvant, apres: changesApres }
}

function enJson(valeur: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!valeur) return Prisma.DbNull
  const nettoye: Record<string, unknown> = {}
  for (const [cle, contenu] of Object.entries(valeur)) nettoye[cle] = normaliser(contenu)
  return nettoye as Prisma.InputJsonValue
}

/** Enregistre une entrée. Ne doit jamais faire échouer l'opération métier. */
export async function journaliser(client: PrismaClient, entree: EntreeAudit): Promise<void> {
  try {
    await client.journalAudit.create({
      data: {
        entite: entree.entite,
        entiteId: entree.entiteId,
        action: entree.action,
        avant: enJson(entree.avant),
        apres: enJson(entree.apres),
      } as Prisma.JournalAuditCreateInput,
    })
  } catch {
    // Un journal indisponible ne doit pas empêcher l'économiste de travailler.
  }
}

/** Enregistre plusieurs entrées d'un coup, pour une modification en lot. */
export async function journaliserPlusieurs(
  client: PrismaClient,
  entrees: readonly EntreeAudit[],
): Promise<void> {
  if (entrees.length === 0) return
  try {
    await client.journalAudit.createMany({
      data: entrees.map((entree) => ({
        entite: entree.entite,
        entiteId: entree.entiteId,
        action: entree.action,
        avant: enJson(entree.avant),
        apres: enJson(entree.apres),
      })) as Prisma.JournalAuditCreateManyInput[],
    })
  } catch {
    // Idem : le journal est un témoin, pas un verrou.
  }
}

export interface FiltresJournal {
  readonly entite?: EntiteAuditee | null
  readonly limite?: number
}

export async function listerJournal(client: PrismaClient, filtres: FiltresJournal = {}) {
  return client.journalAudit.findMany({
    where: filtres.entite ? { entite: filtres.entite } : {},
    orderBy: { survenuLe: 'desc' },
    take: Math.min(filtres.limite ?? 200, 1000),
  })
}
