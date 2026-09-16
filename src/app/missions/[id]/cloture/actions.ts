'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../../../session'
import { cloturerMission, rouvrirMission, verserPrix } from '../../../../application/cloture/service'

export interface EtatCloture {
  readonly erreur?: string
  readonly succes?: string
}

function lire(donnees: FormData, cle: string): string {
  return String(donnees.get(cle) ?? '').trim()
}

export async function actionVerserPrix(
  _precedent: EtatCloture,
  donnees: FormData,
): Promise<EtatCloture> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')

  // Seules les lignes cochées sont versées : rien n'entre en base sans geste.
  const posteIds = donnees.getAll('posteIds').map((v) => String(v)).filter((v) => v !== '')
  if (posteIds.length === 0) {
    return { erreur: 'Cochez au moins un prix à verser.' }
  }

  try {
    const resultat = await verserPrix(db, missionId, posteIds)
    revalidatePath(`/missions/${missionId}/cloture`)
    revalidatePath('/base-prix')
    return {
      succes: `${resultat.nbVerses} prix versé(s) dans la base personnelle, avec le contexte de l’opération.`,
    }
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Versement impossible.' }
  }
}

export async function actionCloturer(
  _precedent: EtatCloture,
  donnees: FormData,
): Promise<EtatCloture> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  try {
    await cloturerMission(db, missionId)
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Clôture impossible.' }
  }
  revalidatePath(`/missions/${missionId}/cloture`)
  revalidatePath(`/missions/${missionId}`)
  revalidatePath('/')
  return { succes: 'Opération clôturée. Elle reste entièrement consultable.' }
}

export async function actionRouvrir(
  _precedent: EtatCloture,
  donnees: FormData,
): Promise<EtatCloture> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  try {
    await rouvrirMission(db, missionId)
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Réouverture impossible.' }
  }
  revalidatePath(`/missions/${missionId}/cloture`)
  revalidatePath(`/missions/${missionId}`)
  revalidatePath('/')
  return { succes: 'Opération rouverte.' }
}
