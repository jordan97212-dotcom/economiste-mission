'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../session'
import {
  chargerMetrePoste,
  creerRepere,
  enregistrerMetrePoste,
  enregistrerRepere,
  listerReperes,
  supprimerMetrePoste,
  supprimerRepere,
} from '../../application/metre/service'
import { chargerChiffrage } from '../../application/chiffrage/service'
import type {
  ChiffrageDTO,
  MetrePosteDTO,
  RepereDetailDTO,
  SaisieLigneMetre,
} from '../../application/dto'

/**
 * Le métré change la quantité, donc le montant du poste, donc le total du lot.
 * Les actions renvoient le chiffrage recalculé avec la feuille : la grille et
 * la feuille ne peuvent pas afficher deux états différents de la même ligne.
 */
export interface RetourMetre {
  readonly metre: MetrePosteDTO
  readonly chiffrage: ChiffrageDTO
}

function rafraichir(missionId: string): void {
  revalidatePath(`/missions/${missionId}`)
  revalidatePath(`/missions/${missionId}/chiffrage`)
  revalidatePath(`/missions/${missionId}/metre`)
}

export async function actionChargerMetre(
  missionId: string,
  posteId: string,
): Promise<MetrePosteDTO> {
  const { db } = await contexte()
  return chargerMetrePoste(db, missionId, posteId)
}

export async function actionEnregistrerMetre(
  missionId: string,
  posteId: string,
  lignes: SaisieLigneMetre[],
): Promise<RetourMetre> {
  const { db } = await contexte()
  const metre = await enregistrerMetrePoste(db, missionId, posteId, lignes)
  rafraichir(missionId)
  return { metre, chiffrage: await chargerChiffrage(db, missionId) }
}

export async function actionSupprimerMetre(
  missionId: string,
  posteId: string,
): Promise<ChiffrageDTO> {
  const { db } = await contexte()
  await supprimerMetrePoste(db, missionId, posteId)
  rafraichir(missionId)
  return chargerChiffrage(db, missionId)
}

export async function actionListerReperes(missionId: string): Promise<RepereDetailDTO[]> {
  const { db } = await contexte()
  return listerReperes(db, missionId)
}

export async function actionCreerRepere(
  missionId: string,
  nom: string,
  unite: string | null,
): Promise<RepereDetailDTO[]> {
  const { db } = await contexte()
  await creerRepere(db, missionId, { nom, unite })
  rafraichir(missionId)
  return listerReperes(db, missionId)
}

export async function actionEnregistrerRepere(
  missionId: string,
  repereId: string,
  entree: { nom?: string; unite?: string | null; lignes?: SaisieLigneMetre[] },
): Promise<RepereDetailDTO[]> {
  const { db } = await contexte()
  await enregistrerRepere(db, missionId, repereId, entree)
  rafraichir(missionId)
  return listerReperes(db, missionId)
}

export async function actionSupprimerRepere(
  missionId: string,
  repereId: string,
): Promise<RepereDetailDTO[]> {
  const { db } = await contexte()
  await supprimerRepere(db, missionId, repereId)
  rafraichir(missionId)
  return listerReperes(db, missionId)
}
