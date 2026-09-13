import { PrismaClient } from '@prisma/client'

/**
 * Client Prisma partagé. En développement, Next.js recharge les modules à chaud :
 * sans ce cache global on ouvrirait une nouvelle réserve de connexions à chaque
 * rechargement, jusqu'à saturer PostgreSQL.
 */
const global_ = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient =
  global_.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') global_.prisma = prisma

/**
 * Modèles qui portent directement `ownerId`. Les entités filles (lot, poste,
 * offre…) sont cloisonnées par leur parent : les services vérifient la mission
 * avant d'y toucher.
 */
const MODELES_CLOISONNES = new Set([
  'Mission',
  'PrixReference',
  'Entreprise',
  'CorpsEtat',
  'Trame',
  'ModeleHonoraires',
  'PieceJointe',
  'JournalAudit',
  'ReferenceNormative',
])
// `Session` n'y figure pas : elle porte `userId` et non `ownerId`, et elle est
// lue avant qu'on sache qui est connecté.

const OPERATIONS_LECTURE = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
])

const OPERATIONS_CREATION = new Set(['create', 'createMany', 'createManyAndReturn'])

type ArgsAvecWhere = { where?: Record<string, unknown> }
type ArgsAvecData = { data?: Record<string, unknown> | Record<string, unknown>[] }

/**
 * Renvoie un client dont toutes les requêtes sur les modèles cloisonnés portent
 * le filtre `ownerId`, injecté ici plutôt que dans chaque service. Aucune requête
 * ne peut donc l'oublier par distraction.
 *
 * Le cloisonnement s'appuie sur les filtres non uniques autorisés dans un `where`
 * unique depuis Prisma 5 : `findUnique({ where: { id, ownerId } })` est valide et
 * ne renvoie rien si la ligne appartient à quelqu'un d'autre.
 */
export function clientPour(ownerId: string): PrismaClient {
  return prisma.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!MODELES_CLOISONNES.has(model)) return query(args)

          // On modifie l'objet à travers un alias typé, mais on transmet
          // toujours `args` lui-même : les types génériques de Prisma restent
          // intacts, et aucune assertion large n'est nécessaire.
          if (OPERATIONS_LECTURE.has(operation)) {
            const a = args as ArgsAvecWhere
            a.where = { ...(a.where ?? {}), ownerId }
            return query(args)
          }

          if (OPERATIONS_CREATION.has(operation)) {
            const a = args as ArgsAvecData
            if (Array.isArray(a.data)) {
              a.data = a.data.map((d) => ({ ...d, ownerId }))
            } else if (a.data) {
              a.data = { ...a.data, ownerId }
            }
            return query(args)
          }

          if (operation === 'upsert') {
            const a = args as ArgsAvecWhere & {
              create?: Record<string, unknown>
              update?: Record<string, unknown>
            }
            a.where = { ...(a.where ?? {}), ownerId }
            if (a.create) a.create = { ...a.create, ownerId }
            return query(args)
          }

          return query(args)
        },
      },
    },
  }) as unknown as PrismaClient
}

export type ClientCloisonne = ReturnType<typeof clientPour>
