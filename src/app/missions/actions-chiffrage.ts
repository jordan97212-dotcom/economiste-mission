'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../session'
import {
  chargerChiffrage,
  enregistrerModifications,
} from '../../application/chiffrage/service'
import {
  ajouterPoste,
  supprimerPoste,
  deplacerPoste,
  type SensDeplacement,
} from '../../application/chiffrage/structure'
import { collerBloc, type ColonneCollable } from '../../application/chiffrage/coller'
import type { ChiffrageDTO, ModificationPoste } from '../../application/dto'

function rafraichir(missionId: string): void {
  revalidatePath(`/missions/${missionId}`)
  revalidatePath(`/missions/${missionId}/chiffrage`)
  revalidatePath('/')
}

export async function actionEnregistrerPostes(
  missionId: string,
  modifications: ModificationPoste[],
): Promise<ChiffrageDTO> {
  const { db } = await contexte()
  const chiffrage = await enregistrerModifications(db, missionId, modifications)
  rafraichir(missionId)
  return chiffrage
}

export async function actionAjouterPoste(
  missionId: string,
  lotId: string,
  type: 'SOUS_LOT' | 'OUVRAGE',
  apresPosteId: string | null,
): Promise<ChiffrageDTO> {
  const { db } = await contexte()
  await ajouterPoste(db, missionId, {
    lotId,
    type,
    apresPosteId,
    ...(apresPosteId === null ? { parentId: null } : {}),
  })
  rafraichir(missionId)
  return chargerChiffrage(db, missionId)
}

export async function actionSupprimerPoste(
  missionId: string,
  posteId: string,
): Promise<ChiffrageDTO> {
  const { db } = await contexte()
  await supprimerPoste(db, missionId, posteId)
  rafraichir(missionId)
  return chargerChiffrage(db, missionId)
}

export async function actionDeplacerPoste(
  missionId: string,
  posteId: string,
  sens: SensDeplacement,
): Promise<ChiffrageDTO> {
  const { db } = await contexte()
  await deplacerPoste(db, missionId, posteId, sens)
  rafraichir(missionId)
  return chargerChiffrage(db, missionId)
}

/**
 * Colle un bloc de cellules venu d'un tableur. Toute la logique reste côté
 * serveur : création des lignes manquantes, conversion des nombres au format
 * français, puis recalcul. La grille n'a qu'à afficher le résultat.
 */
export async function actionCollerBloc(
  missionId: string,
  lotId: string,
  posteDepartId: string,
  colonneDepart: ColonneCollable,
  lignes: string[][],
  mappage?: (ColonneCollable | null)[],
): Promise<ChiffrageDTO> {
  const { db } = await contexte()
  const chiffrage = await collerBloc(db, missionId, {
    lotId,
    posteDepartId,
    colonneDepart,
    lignes,
    ...(mappage ? { mappage } : {}),
  })
  rafraichir(missionId)
  return chiffrage
}
