'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../session'
import { listerFeuilles, lireGrille, elaguer } from '../../infrastructure/excel/lecture'
import { importerDpgf } from '../../application/import/dpgf'
import type { MappageDpgf } from '../../application/import/analyse-dpgf'
import { importerBasePrix } from '../../application/prix/service'
import type { MappagePrix } from '../../application/prix/analyse-import'
import type { ChiffrageDTO } from '../../application/dto'

/** Au-delà, il ne s'agit plus d'un DPGF mais d'un export de base de données. */
const LIGNES_MAX = 8000

export interface FeuilleLue {
  readonly nom: string
  readonly grille: string[][]
}

export interface LectureClasseur {
  readonly feuilles: readonly FeuilleLue[]
  readonly tronque: boolean
  readonly erreur?: string
}

/**
 * Lit un classeur et renvoie ses feuilles sous forme de grilles de chaînes.
 * Tout le reste de l'assistant, choix de la feuille, ligne d'en-tête, mappage
 * et aperçu, se fait ensuite dans le navigateur sans renvoyer le fichier.
 */
export async function actionLireClasseur(donnees: FormData): Promise<LectureClasseur> {
  await contexte()

  const fichier = donnees.get('fichier')
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { feuilles: [], tronque: false, erreur: 'Aucun fichier reçu.' }
  }
  if (fichier.size > 25 * 1024 * 1024) {
    return { feuilles: [], tronque: false, erreur: 'Fichier trop volumineux : 25 Mo au maximum.' }
  }

  let contenu: ArrayBuffer
  try {
    contenu = await fichier.arrayBuffer()
  } catch {
    return { feuilles: [], tronque: false, erreur: 'Lecture du fichier impossible.' }
  }

  try {
    const resumes = await listerFeuilles(contenu)
    if (resumes.length === 0) {
      return { feuilles: [], tronque: false, erreur: 'Le classeur ne contient aucune feuille.' }
    }

    const feuilles: FeuilleLue[] = []
    let tronque = false

    for (const resume of resumes) {
      const grille = elaguer(
        await lireGrille(contenu, { nomFeuille: resume.nom, maxLignes: LIGNES_MAX }),
      )
      if (resume.nbLignes > LIGNES_MAX) tronque = true
      feuilles.push({ nom: resume.nom, grille })
    }

    return { feuilles, tronque }
  } catch (erreur) {
    return {
      feuilles: [],
      tronque: false,
      erreur:
        erreur instanceof Error
          ? `Classeur illisible : ${erreur.message}`
          : 'Classeur illisible. Vérifiez qu’il s’agit bien d’un fichier .xlsx.',
    }
  }
}

export interface ResultatImportDpgfUi {
  readonly chiffrage?: ChiffrageDTO
  readonly nbOuvrages?: number
  readonly nbSousLots?: number
  readonly erreur?: string
}

export async function actionImporterDpgf(
  missionId: string,
  lotId: string,
  grille: string[][],
  mappage: MappageDpgf,
  options: { premiereLigne: number; remplacer: boolean },
): Promise<ResultatImportDpgfUi> {
  const { db } = await contexte()
  try {
    const resultat = await importerDpgf(db, missionId, lotId, grille, mappage, {
      premiereLigne: options.premiereLigne,
      remplacer: options.remplacer,
    })
    revalidatePath(`/missions/${missionId}`)
    revalidatePath(`/missions/${missionId}/chiffrage`)
    revalidatePath('/')
    return {
      chiffrage: resultat.chiffrage,
      nbOuvrages: resultat.nbOuvrages,
      nbSousLots: resultat.nbSousLots,
    }
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Import impossible.' }
  }
}

export interface ResultatImportPrixUi {
  readonly crees?: number
  readonly ignores?: number
  readonly anomalies?: readonly { ligne: number; message: string }[]
  readonly erreur?: string
}

export async function actionImporterBasePrix(
  grille: string[][],
  mappage: MappagePrix,
  options: { premiereLigne: number },
): Promise<ResultatImportPrixUi> {
  const { db } = await contexte()
  try {
    const resultat = await importerBasePrix(db, grille, mappage, {
      premiereLigne: options.premiereLigne,
    })
    revalidatePath('/base-prix')
    return { crees: resultat.crees, ignores: resultat.ignores, anomalies: resultat.anomalies }
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Import impossible.' }
  }
}
