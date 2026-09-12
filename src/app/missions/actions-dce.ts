'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../session'
import { appliquerTrame, enregistrerTexte, verifierMission } from '../../application/dce/service'
import type { SyntheseCoherence } from '../../domain/coherence/verification'

export interface EtatTexte {
  readonly erreur?: string
  readonly enregistreLe?: string
}

function rafraichir(missionId: string): void {
  revalidatePath(`/missions/${missionId}/dce`)
  revalidatePath(`/missions/${missionId}/dce/textes`)
}

export async function actionEnregistrerTexte(
  missionId: string,
  posteId: string,
  contenu: string,
): Promise<EtatTexte> {
  const { db } = await contexte()
  try {
    await enregistrerTexte(db, missionId, posteId, contenu)
    rafraichir(missionId)
    return { enregistreLe: new Date().toISOString() }
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Enregistrement impossible.' }
  }
}

export async function actionAppliquerTrame(
  missionId: string,
  posteId: string,
  trameId: string,
): Promise<EtatTexte & { contenu?: string }> {
  const { db } = await contexte()
  try {
    await appliquerTrame(db, missionId, posteId, trameId)
    const poste = await db.poste.findFirst({
      where: { id: posteId, lot: { missionId } },
      select: { texteCctp: true },
    })
    const valeur = poste?.texteCctp as { contenu?: string } | null
    rafraichir(missionId)
    return { enregistreLe: new Date().toISOString(), contenu: valeur?.contenu ?? '' }
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Application impossible.' }
  }
}

export async function actionVerifierCoherence(missionId: string): Promise<SyntheseCoherence> {
  const { db } = await contexte()
  return verifierMission(db, missionId)
}
