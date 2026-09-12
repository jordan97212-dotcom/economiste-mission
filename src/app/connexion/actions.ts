'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { prisma } from '../../infrastructure/prisma'
import { creerSession, deconnecter, verifierMotDePasse, hacherMotDePasse } from '../../infrastructure/auth'

export interface EtatConnexion {
  readonly erreur?: string
}

/**
 * Connexion. Le message d'erreur est volontairement identique que l'adresse
 * soit inconnue ou le mot de passe faux : inutile d'indiquer à un tiers
 * quelles adresses existent.
 */
export async function connexion(_precedent: EtatConnexion, donnees: FormData): Promise<EtatConnexion> {
  const email = String(donnees.get('email') ?? '').trim().toLowerCase()
  const motDePasse = String(donnees.get('motDePasse') ?? '')

  if (!email || !motDePasse) {
    return { erreur: 'Renseignez votre adresse et votre mot de passe.' }
  }

  const utilisateur = await prisma.user.findUnique({ where: { email } })
  const valide =
    utilisateur?.motDePasse !== null &&
    utilisateur?.motDePasse !== undefined &&
    (await verifierMotDePasse(utilisateur.motDePasse, motDePasse))

  if (!utilisateur || !valide) {
    return { erreur: 'Adresse ou mot de passe incorrect.' }
  }

  const entetes = await headers()
  const userAgent = entetes.get('user-agent')
  const ip = entetes.get('x-forwarded-for')?.split(',')[0]?.trim()
  await creerSession(utilisateur.id, {
    ...(userAgent ? { userAgent } : {}),
    ...(ip ? { ip } : {}),
  })

  redirect('/')
}

/** Première mise en service : crée le compte s'il n'en existe encore aucun. */
export async function initialiser(_precedent: EtatConnexion, donnees: FormData): Promise<EtatConnexion> {
  const nombre = await prisma.user.count({ where: { motDePasse: { not: null } } })
  if (nombre > 0) return { erreur: 'Un compte existe déjà.' }

  const email = String(donnees.get('email') ?? '').trim().toLowerCase()
  const motDePasse = String(donnees.get('motDePasse') ?? '')
  const nom = String(donnees.get('nom') ?? '').trim()

  if (!email.includes('@')) return { erreur: 'Adresse électronique invalide.' }
  if (motDePasse.length < 12) return { erreur: 'Le mot de passe doit faire au moins douze caractères.' }

  const empreinte = await hacherMotDePasse(motDePasse)
  const utilisateur = await prisma.user.upsert({
    where: { email },
    update: { motDePasse: empreinte, ...(nom ? { nom } : {}) },
    create: { email, motDePasse: empreinte, nom: nom || null },
  })

  await creerSession(utilisateur.id)
  redirect('/')
}

export async function deconnexion(): Promise<void> {
  await deconnecter()
  redirect('/connexion')
}
