'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../session'
import { lireCsv, LIBELLES_SEPARATEUR, type Separateur } from '../../domain/csv/lecture'
import {
  analyserLignes,
  devinerMappage,
  type AnomalieEntreprise,
  type EntrepriseLue,
  type MappageEntreprise,
} from '../../domain/entreprises/import'
import {
  importerEntreprises,
  type ResultatImportEntreprises,
  type SurExistante,
} from '../../application/entreprises/import'

/** Un répertoire d'entreprises tient dans quelques dizaines de kilo-octets. */
const TAILLE_MAXIMALE = 5 * 1024 * 1024

export interface LectureFichier {
  readonly grille: readonly (readonly string[])[]
  readonly separateur: string
  readonly encodage: string
  readonly colonnesIrregulieres: boolean
  readonly mappagePropose: MappageEntreprise
  readonly erreur?: string
}

const VIDE: LectureFichier = {
  grille: [],
  separateur: '',
  encodage: '',
  colonnesIrregulieres: false,
  mappagePropose: {},
}

export async function actionLireCsv(donnees: FormData): Promise<LectureFichier> {
  await contexte()

  const fichier = donnees.get('fichier')
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { ...VIDE, erreur: 'Aucun fichier reçu.' }
  }
  if (fichier.size > TAILLE_MAXIMALE) {
    return { ...VIDE, erreur: 'Fichier trop volumineux : 5 Mo au maximum pour un répertoire.' }
  }

  let octets: Uint8Array
  try {
    octets = new Uint8Array(await fichier.arrayBuffer())
  } catch {
    return { ...VIDE, erreur: 'Lecture du fichier impossible.' }
  }

  const lecture = lireCsv(octets)
  if (lecture.grille.length === 0) {
    return { ...VIDE, erreur: 'Ce fichier ne contient aucune ligne exploitable.' }
  }

  return {
    grille: lecture.grille,
    separateur: LIBELLES_SEPARATEUR[lecture.separateur as Separateur] ?? lecture.separateur,
    encodage: lecture.encodage === 'utf-8' ? 'UTF-8' : 'Windows-1252',
    colonnesIrregulieres: lecture.colonnesIrregulieres,
    mappagePropose: devinerMappage(lecture.grille[0] ?? []),
  }
}

export interface Apercu {
  readonly entreprises: readonly EntrepriseLue[]
  readonly lignesRejetees: number
  readonly anomalies: readonly AnomalieEntreprise[]
}

/** Analyse le contenu sans rien écrire : c'est l'aperçu avant décision. */
export async function actionAnalyser(
  grille: string[][],
  mappage: MappageEntreprise,
  ligneEntete: number,
): Promise<Apercu> {
  await contexte()
  const corps = grille.slice(ligneEntete)
  return analyserLignes(corps, mappage, ligneEntete + 1)
}

export async function actionImporter(
  entreprises: EntrepriseLue[],
  surExistante: SurExistante,
): Promise<ResultatImportEntreprises> {
  const { db } = await contexte()
  const resultat = await importerEntreprises(db, entreprises, surExistante)
  revalidatePath('/entreprises')
  return resultat
}
