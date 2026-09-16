'use server'

import { revalidatePath } from 'next/cache'
import type { StatutAvenant } from '@prisma/client'
import { contexte } from '../../../session'
import { creerAvenant, modifierAvenant, supprimerAvenant } from '../../../../application/avenants/service'
import {
  creerSituation,
  modifierSituation,
  supprimerSituation,
} from '../../../../application/situations/service'
import { annulerAttribution, retenirOffre } from '../../../../application/marche/service'

export interface EtatSuivi {
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

function chemin(missionId: string): string {
  return `/missions/${missionId}/suivi`
}

/* --- Attribution ------------------------------------------------------- */

export async function actionRetenirOffre(
  _precedent: EtatSuivi,
  donnees: FormData,
): Promise<EtatSuivi> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const lotId = lire(donnees, 'lotId')
  try {
    await retenirOffre(db, missionId, lotId, lire(donnees, 'offreId'))
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Attribution impossible.' }
  }
  revalidatePath(chemin(missionId))
  revalidatePath(`/missions/${missionId}/consultation/${lotId}`)
  return { succes: 'Offre retenue : le lot a désormais un marché.' }
}

export async function actionAnnulerAttribution(
  _precedent: EtatSuivi,
  donnees: FormData,
): Promise<EtatSuivi> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const lotId = lire(donnees, 'lotId')
  try {
    await annulerAttribution(db, missionId, lotId)
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Annulation impossible.' }
  }
  revalidatePath(chemin(missionId))
  revalidatePath(`/missions/${missionId}/consultation/${lotId}`)
  return { succes: 'Attribution annulée.' }
}

/* --- Avenants ----------------------------------------------------------- */

export async function actionCreerAvenant(
  _precedent: EtatSuivi,
  donnees: FormData,
): Promise<EtatSuivi> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const date = lireDate(donnees, 'date')
  if (!date) return { erreur: 'La date de l’avenant est nécessaire.' }

  try {
    await creerAvenant(db, missionId, {
      lotId: lire(donnees, 'lotId') || null,
      objet: lire(donnees, 'objet'),
      montantHt: lire(donnees, 'montantHt'),
      date,
      motif: lire(donnees, 'motif') || null,
      statut: (lire(donnees, 'statut') || 'PROPOSE') as StatutAvenant,
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Création impossible.' }
  }
  revalidatePath(chemin(missionId))
  return { succes: 'Avenant enregistré.' }
}

export async function actionModifierStatutAvenant(
  _precedent: EtatSuivi,
  donnees: FormData,
): Promise<EtatSuivi> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  try {
    await modifierAvenant(db, missionId, lire(donnees, 'id'), {
      statut: lire(donnees, 'statut') as StatutAvenant,
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Modification impossible.' }
  }
  revalidatePath(chemin(missionId))
  return { succes: 'Statut de l’avenant mis à jour.' }
}

export async function actionSupprimerAvenant(
  _precedent: EtatSuivi,
  donnees: FormData,
): Promise<EtatSuivi> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  try {
    await supprimerAvenant(db, missionId, lire(donnees, 'id'))
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Suppression impossible.' }
  }
  revalidatePath(chemin(missionId))
  return { succes: 'Avenant supprimé.' }
}

/* --- Situations --------------------------------------------------------- */

export async function actionCreerSituation(
  _precedent: EtatSuivi,
  donnees: FormData,
): Promise<EtatSuivi> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const periode = lireDate(donnees, 'periode')
  if (!periode) return { erreur: 'La période est nécessaire.' }

  try {
    await creerSituation(db, missionId, lire(donnees, 'lotId'), {
      periode,
      avancementPourcent: lire(donnees, 'avancementPourcent') || null,
      montantCumuleHt: lire(donnees, 'montantCumuleHt') || null,
      retenueGarantieHt: lire(donnees, 'retenueGarantieHt') || null,
      avanceRemboursee: lire(donnees, 'avanceRemboursee') || null,
      compteProrataHt: lire(donnees, 'compteProrataHt') || null,
      dateValidation: lireDate(donnees, 'dateValidation'),
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Enregistrement impossible.' }
  }
  revalidatePath(chemin(missionId))
  return { succes: 'Situation enregistrée.' }
}

export async function actionModifierSituation(
  _precedent: EtatSuivi,
  donnees: FormData,
): Promise<EtatSuivi> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const periode = lireDate(donnees, 'periode')

  try {
    await modifierSituation(db, missionId, lire(donnees, 'id'), {
      periode: periode ?? new Date(),
      montantCumuleHt: lire(donnees, 'montantCumuleHt') || null,
      retenueGarantieHt: lire(donnees, 'retenueGarantieHt') || null,
      avanceRemboursee: lire(donnees, 'avanceRemboursee') || null,
      compteProrataHt: lire(donnees, 'compteProrataHt') || null,
      dateValidation: lireDate(donnees, 'dateValidation'),
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Modification impossible.' }
  }
  revalidatePath(chemin(missionId))
  return { succes: 'Situation mise à jour.' }
}

export async function actionSupprimerSituation(
  _precedent: EtatSuivi,
  donnees: FormData,
): Promise<EtatSuivi> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  try {
    await supprimerSituation(db, missionId, lire(donnees, 'id'))
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Suppression impossible.' }
  }
  revalidatePath(chemin(missionId))
  return { succes: 'Situation supprimée, les suivantes ont été renumérotées.' }
}
