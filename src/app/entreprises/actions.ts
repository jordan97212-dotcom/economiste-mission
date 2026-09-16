'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../session'
import { creerEntreprise, modifierEntreprise, supprimerEntreprise } from '../../application/entreprises/service'

export interface EtatEntreprise {
  readonly erreur?: string
  readonly succes?: string
}

function lire(donnees: FormData, cle: string): string {
  return String(donnees.get(cle) ?? '').trim()
}

function lireCorpsEtat(donnees: FormData): string[] {
  return lire(donnees, 'corpsEtatQualifies')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '')
}

export async function actionCreerEntreprise(
  _precedent: EtatEntreprise,
  donnees: FormData,
): Promise<EtatEntreprise> {
  const { db } = await contexte()
  try {
    await creerEntreprise(db, {
      raisonSociale: lire(donnees, 'raisonSociale'),
      siret: lire(donnees, 'siret') || null,
      contactNom: lire(donnees, 'contactNom') || null,
      email: lire(donnees, 'email') || null,
      telephone: lire(donnees, 'telephone') || null,
      corpsEtatQualifies: lireCorpsEtat(donnees),
      zoneIntervention: lire(donnees, 'zoneIntervention') || null,
      historiqueNotes: lire(donnees, 'historiqueNotes') || null,
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Enregistrement impossible.' }
  }
  revalidatePath('/entreprises')
  return { succes: 'Entreprise ajoutée au répertoire.' }
}

export async function actionModifierEntreprise(
  _precedent: EtatEntreprise,
  donnees: FormData,
): Promise<EtatEntreprise> {
  const { db } = await contexte()
  try {
    await modifierEntreprise(db, lire(donnees, 'id'), {
      raisonSociale: lire(donnees, 'raisonSociale'),
      siret: lire(donnees, 'siret') || null,
      contactNom: lire(donnees, 'contactNom') || null,
      email: lire(donnees, 'email') || null,
      telephone: lire(donnees, 'telephone') || null,
      corpsEtatQualifies: lireCorpsEtat(donnees),
      zoneIntervention: lire(donnees, 'zoneIntervention') || null,
      historiqueNotes: lire(donnees, 'historiqueNotes') || null,
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Modification impossible.' }
  }
  revalidatePath('/entreprises')
  return { succes: 'Entreprise modifiée.' }
}

export async function actionSupprimerEntreprise(
  _precedent: EtatEntreprise,
  donnees: FormData,
): Promise<EtatEntreprise> {
  const { db } = await contexte()
  try {
    await supprimerEntreprise(db, lire(donnees, 'id'))
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Suppression impossible.' }
  }
  revalidatePath('/entreprises')
  return { succes: 'Entreprise retirée du répertoire.' }
}
