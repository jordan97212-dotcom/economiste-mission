'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { contexte } from '../session'
import {
  creerMission,
  modifierMission,
  dupliquerMission,
  archiverMission,
  supprimerMission,
  type EntreeMission,
} from '../../application/missions/service'
import { creerLot, modifierLot, supprimerLot } from '../../application/chiffrage/structure'

export interface EtatFormulaire {
  readonly erreur?: string
}

function lire(donnees: FormData, cle: string): string {
  return String(donnees.get(cle) ?? '').trim()
}

function entreeDepuisFormulaire(donnees: FormData): EntreeMission {
  const precision = Number.parseInt(lire(donnees, 'precisionPu') || '2', 10)
  return {
    reference: lire(donnees, 'reference'),
    nomOperation: lire(donnees, 'nomOperation'),
    maitreOuvrage: lire(donnees, 'maitreOuvrage'),
    maitreOeuvre: lire(donnees, 'maitreOeuvre'),
    typeOuvrage: lire(donnees, 'typeOuvrage'),
    nature: lire(donnees, 'nature'),
    typeMarche: lire(donnees, 'typeMarche'),
    surfaceShon: lire(donnees, 'surfaceShon'),
    surfaceUtile: lire(donnees, 'surfaceUtile'),
    budgetPrevisionnelHt: lire(donnees, 'budgetPrevisionnelHt'),
    phasesContractuelles: donnees.getAll('phasesContractuelles').map(String),
    dateDebut: lire(donnees, 'dateDebut'),
    dateFinPrevue: lire(donnees, 'dateFinPrevue'),
    statut: lire(donnees, 'statut'),
    honorairesMissionHt: lire(donnees, 'honorairesMissionHt'),
    modeFacturation: lire(donnees, 'modeFacturation'),
    coefficientLocalDefaut: lire(donnees, 'coefficientLocalDefaut'),
    precisionPu: Number.isFinite(precision) ? precision : 2,
    tauxTva: lire(donnees, 'tauxTva'),
    seuilDerivePourcent: lire(donnees, 'seuilDerivePourcent'),
  }
}

function messageErreur(erreur: unknown): string {
  if (erreur instanceof Error) {
    if (erreur.message.includes('Unique constraint')) {
      return 'Cette référence de mission est déjà utilisée.'
    }
    return erreur.message
  }
  return 'Une erreur inattendue est survenue.'
}

export async function actionCreerMission(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const { db } = await contexte()
  const entree = entreeDepuisFormulaire(donnees)
  if (!entree.nomOperation) return { erreur: 'Le nom de l’opération est obligatoire.' }

  let id: string
  try {
    id = await creerMission(db, entree)
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/')
  redirect(`/missions/${id}`)
}

export async function actionModifierMission(
  _precedent: EtatFormulaire,
  donnees: FormData,
): Promise<EtatFormulaire> {
  const { db } = await contexte()
  const id = lire(donnees, 'id')
  const entree = entreeDepuisFormulaire(donnees)
  if (!entree.nomOperation) return { erreur: 'Le nom de l’opération est obligatoire.' }

  try {
    await modifierMission(db, id, entree)
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/')
  revalidatePath(`/missions/${id}`)
  redirect(`/missions/${id}`)
}

export async function actionDupliquerMission(donnees: FormData): Promise<void> {
  const { db } = await contexte()
  const sourceId = lire(donnees, 'id')
  const copie = await dupliquerMission(db, sourceId, {
    reprendreLesPrix: lire(donnees, 'reprendreLesPrix') !== 'non',
  })
  revalidatePath('/')
  redirect(`/missions/${copie}`)
}

export async function actionArchiverMission(donnees: FormData): Promise<void> {
  const { db } = await contexte()
  await archiverMission(db, lire(donnees, 'id'), lire(donnees, 'archivee') === 'oui')
  revalidatePath('/')
  revalidatePath(`/missions/${lire(donnees, 'id')}`)
}

export async function actionSupprimerMission(donnees: FormData): Promise<void> {
  const { db } = await contexte()
  await supprimerMission(db, lire(donnees, 'id'))
  revalidatePath('/')
  redirect('/')
}

export async function actionCreerLot(donnees: FormData): Promise<void> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  await creerLot(db, missionId, {
    numero: lire(donnees, 'numero'),
    intitule: lire(donnees, 'intitule'),
    corpsEtatId: lire(donnees, 'corpsEtatId') || null,
    coefficientLocal: lire(donnees, 'coefficientLocal') || null,
  })
  revalidatePath(`/missions/${missionId}`)
  revalidatePath(`/missions/${missionId}/chiffrage`)
}

export async function actionModifierLot(donnees: FormData): Promise<void> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  await modifierLot(db, missionId, lire(donnees, 'lotId'), {
    numero: lire(donnees, 'numero'),
    intitule: lire(donnees, 'intitule'),
    corpsEtatId: lire(donnees, 'corpsEtatId') || null,
    coefficientLocal: lire(donnees, 'coefficientLocal') || null,
  })
  revalidatePath(`/missions/${missionId}`)
  revalidatePath(`/missions/${missionId}/chiffrage`)
}

export async function actionSupprimerLot(donnees: FormData): Promise<void> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  await supprimerLot(db, missionId, lire(donnees, 'lotId'))
  revalidatePath(`/missions/${missionId}`)
  revalidatePath(`/missions/${missionId}/chiffrage`)
}
