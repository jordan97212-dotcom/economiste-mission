'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../session'
import {
  listerPieces,
  modifierPiece,
  supprimerPiece,
  type ModificationPiece,
} from '../../application/pieces/service'
import type { PieceJointeDTO } from '../../application/dto'

/**
 * Le dépôt d'un fichier passe par une route HTTP — voir `pieces/depot`. Ces
 * actions ne portent que des métadonnées, qui tiennent largement dans la limite
 * d'une action serveur.
 */

function rafraichir(missionId: string): void {
  revalidatePath(`/missions/${missionId}`)
  revalidatePath(`/missions/${missionId}/pieces`)
  revalidatePath(`/missions/${missionId}/dce`)
}

export async function actionListerPieces(missionId: string): Promise<PieceJointeDTO[]> {
  const { db } = await contexte()
  return listerPieces(db, missionId)
}

export async function actionModifierPiece(
  missionId: string,
  pieceId: string,
  champs: ModificationPiece,
): Promise<PieceJointeDTO[]> {
  const { db } = await contexte()
  await modifierPiece(db, missionId, pieceId, champs)
  rafraichir(missionId)
  return listerPieces(db, missionId)
}

export async function actionSupprimerPiece(
  missionId: string,
  pieceId: string,
): Promise<PieceJointeDTO[]> {
  const { db } = await contexte()
  await supprimerPiece(db, missionId, pieceId)
  rafraichir(missionId)
  return listerPieces(db, missionId)
}
