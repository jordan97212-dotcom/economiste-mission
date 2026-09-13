'use server'

import { revalidatePath } from 'next/cache'
import type { StatutNorme } from '@prisma/client'
import { contexte } from '../session'
import {
  ajouterNorme,
  amorcerDepuisTextes,
  modifierNorme,
  supprimerNorme,
} from '../../application/normes/service'

export interface EtatNorme {
  readonly erreur?: string
  readonly succes?: string
}

function lire(donnees: FormData, cle: string): string {
  return String(donnees.get(cle) ?? '').trim()
}

function lireDate(donnees: FormData, cle: string): Date | null {
  const brut = lire(donnees, cle)
  if (brut === '') return null
  const date = new Date(brut)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function actionAjouterNorme(
  _precedent: EtatNorme,
  donnees: FormData,
): Promise<EtatNorme> {
  const { db } = await contexte()
  try {
    await ajouterNorme(db, {
      reference: lire(donnees, 'reference'),
      titre: lire(donnees, 'titre') || null,
      statut: (lire(donnees, 'statut') || 'EN_VIGUEUR') as StatutNorme,
      remplaceePar: lire(donnees, 'remplaceePar') || null,
      dateEdition: lireDate(donnees, 'dateEdition'),
      dateVerification: lireDate(donnees, 'dateVerification') ?? new Date(),
      source: lire(donnees, 'source') || null,
      commentaire: lire(donnees, 'commentaire') || null,
    })
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : 'Enregistrement impossible.'
    return {
      erreur: message.includes('Unique constraint')
        ? 'Cette référence est déjà au référentiel.'
        : message,
    }
  }
  revalidatePath('/normes')
  return { succes: 'Référence ajoutée.' }
}

export async function actionModifierStatut(
  _precedent: EtatNorme,
  donnees: FormData,
): Promise<EtatNorme> {
  const { db } = await contexte()
  try {
    await modifierNorme(db, lire(donnees, 'id'), {
      statut: lire(donnees, 'statut') as StatutNorme,
      remplaceePar: lire(donnees, 'remplaceePar') || null,
      // Changer un statut à la main, c'est l'avoir vérifié : on date d'aujourd'hui.
      dateVerification: new Date(),
      source: lire(donnees, 'source') || 'Vérifié à la main',
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Modification impossible.' }
  }
  revalidatePath('/normes')
  return { succes: 'Statut mis à jour.' }
}

export async function actionConfirmerEnVigueur(
  _precedent: EtatNorme,
  donnees: FormData,
): Promise<EtatNorme> {
  const { db } = await contexte()
  try {
    await modifierNorme(db, lire(donnees, 'id'), {
      statut: 'EN_VIGUEUR',
      dateVerification: new Date(),
      source: 'Confirmé par l’économiste',
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Modification impossible.' }
  }
  revalidatePath('/normes')
  return { succes: 'Statut confirmé et daté de ce jour.' }
}

export async function actionSupprimerNorme(
  _precedent: EtatNorme,
  donnees: FormData,
): Promise<EtatNorme> {
  const { db } = await contexte()
  try {
    await supprimerNorme(db, lire(donnees, 'id'))
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Suppression impossible.' }
  }
  revalidatePath('/normes')
  return { succes: 'Référence retirée.' }
}

export async function actionAmorcer(_precedent: EtatNorme): Promise<EtatNorme> {
  const { db } = await contexte()
  try {
    const { ajoutees } = await amorcerDepuisTextes(db)
    revalidatePath('/normes')
    return {
      succes:
        ajoutees.length === 0
          ? 'Vos textes ne citent aucune norme absente du référentiel.'
          : `${ajoutees.length} référence(s) versée(s), à confirmer une par une.`,
    }
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Relevé impossible.' }
  }
}
