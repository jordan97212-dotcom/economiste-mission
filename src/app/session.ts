import 'server-only'
import { redirect } from 'next/navigation'
import type { PrismaClient } from '@prisma/client'
import { sessionCourante, type UtilisateurConnecte } from '../infrastructure/auth'
import { clientPour } from '../infrastructure/prisma'

/** Exige une session valide, sinon renvoie vers la page de connexion. */
export async function exigerUtilisateur(): Promise<UtilisateurConnecte> {
  const utilisateur = await sessionCourante()
  if (!utilisateur) redirect('/connexion')
  return utilisateur
}

/**
 * Client de données déjà cloisonné sur l'utilisateur connecté.
 * Aucun service n'a besoin de penser au filtre : il est injecté en amont.
 */
export async function contexte(): Promise<{ utilisateur: UtilisateurConnecte; db: PrismaClient }> {
  const utilisateur = await exigerUtilisateur()
  return { utilisateur, db: clientPour(utilisateur.id) }
}
