import 'server-only'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { hash, verify } from '@node-rs/argon2'
import { prisma } from './prisma'

export const NOM_COOKIE = 'session_economiste'
const DUREE_SESSION_JOURS = 30

/** Paramètres argon2id conformes aux recommandations OWASP. */
const PARAMETRES_ARGON2 = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export function hacherMotDePasse(motDePasse: string): Promise<string> {
  if (motDePasse.length < 12) {
    throw new Error('Le mot de passe doit faire au moins douze caractères.')
  }
  return hash(motDePasse, PARAMETRES_ARGON2)
}

export async function verifierMotDePasse(empreinte: string, motDePasse: string): Promise<boolean> {
  try {
    return await verify(empreinte, motDePasse)
  } catch {
    return false
  }
}

/**
 * Le jeton en clair part dans le cookie, seule son empreinte est stockée.
 * Une fuite de la base ne permet donc pas de rejouer une session.
 */
function empreinteJeton(jeton: string): string {
  return createHash('sha256').update(jeton).digest('hex')
}

export interface UtilisateurConnecte {
  readonly id: string
  readonly email: string
  readonly nom: string | null
}

export async function creerSession(userId: string, contexte: { userAgent?: string; ip?: string } = {}): Promise<void> {
  const jeton = randomBytes(32).toString('base64url')
  const expireLe = new Date(Date.now() + DUREE_SESSION_JOURS * 24 * 60 * 60 * 1000)

  await prisma.session.create({
    data: {
      jeton: empreinteJeton(jeton),
      userId,
      expireLe,
      userAgent: contexte.userAgent ?? null,
      ip: contexte.ip ?? null,
    },
  })

  const magasin = await cookies()
  magasin.set(NOM_COOKIE, jeton, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expireLe,
  })
}

export async function sessionCourante(): Promise<UtilisateurConnecte | null> {
  const magasin = await cookies()
  const jeton = magasin.get(NOM_COOKIE)?.value
  if (!jeton) return null

  const session = await prisma.session.findUnique({
    where: { jeton: empreinteJeton(jeton) },
    include: { user: true },
  })

  if (!session) return null
  if (session.expireLe.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }

  return { id: session.user.id, email: session.user.email, nom: session.user.nom }
}

export async function deconnecter(): Promise<void> {
  const magasin = await cookies()
  const jeton = magasin.get(NOM_COOKIE)?.value
  if (jeton) {
    await prisma.session.deleteMany({ where: { jeton: empreinteJeton(jeton) } })
  }
  magasin.delete(NOM_COOKIE)
}

/** Comparaison à temps constant, pour ne pas fuir d'information par la durée. */
export function comparaisonConstante(a: string, b: string): boolean {
  const ta = Buffer.from(a)
  const tb = Buffer.from(b)
  if (ta.length !== tb.length) return false
  return timingSafeEqual(ta, tb)
}
