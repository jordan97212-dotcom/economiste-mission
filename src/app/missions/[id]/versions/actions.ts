'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../../../session'
import {
  figerVersion,
  supprimerVersion,
  VersionIntrouvable,
  type PhaseContractuelle,
} from '../../../../application/chiffrage/versions'

export interface EtatVersion {
  readonly erreur?: string
  readonly succes?: string
}

const PHASES: readonly PhaseContractuelle[] = ['ESQ', 'APS', 'APD', 'PRO', 'DCE', 'ACT', 'DET', 'AOR']

export async function actionFiger(
  _precedent: EtatVersion,
  donnees: FormData,
): Promise<EtatVersion> {
  const { db } = await contexte()

  const missionId = String(donnees.get('missionId') ?? '')
  const phase = String(donnees.get('phase') ?? '') as PhaseContractuelle
  const libelle = String(donnees.get('libelle') ?? '').trim()

  if (!missionId) return { erreur: 'Opération introuvable.' }
  if (!PHASES.includes(phase)) return { erreur: 'Choisissez la phase contractuelle à figer.' }

  await figerVersion(db, missionId, { phase, ...(libelle ? { libelle } : {}) })
  revalidatePath(`/missions/${missionId}/versions`)
  revalidatePath(`/missions/${missionId}/suivi`)

  return { succes: 'Chiffrage figé. Cette version ne bougera plus, quoi qu’il arrive au bordereau.' }
}

export async function actionSupprimer(
  _precedent: EtatVersion,
  donnees: FormData,
): Promise<EtatVersion> {
  const { db } = await contexte()

  const missionId = String(donnees.get('missionId') ?? '')
  const id = String(donnees.get('versionId') ?? '')

  try {
    await supprimerVersion(db, missionId, id)
  } catch (erreur) {
    if (erreur instanceof VersionIntrouvable) return { erreur: 'Cette version n’existe plus.' }
    throw erreur
  }

  revalidatePath(`/missions/${missionId}/versions`)
  revalidatePath(`/missions/${missionId}/suivi`)
  return { succes: 'Version supprimée.' }
}
