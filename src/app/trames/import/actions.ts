'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../../session'
import {
  analyserFichier,
  importerArticles,
  type AnalyseCctp,
  type MotifNonDecoupe,
} from '../../../application/trames/import-cctp'
import { FichierWordInvalide } from '../../../infrastructure/docx/lecture-docx'
import type { TypeTrame } from '../../../application/trames/service'

/** Au-delà, ce n'est plus un CCTP mais un dossier entier : on le dit. */
const TAILLE_MAX_OCTETS = 20 * 1024 * 1024

export interface EtatAnalyse {
  readonly erreur?: string
  readonly analyse?: {
    readonly articles: readonly {
      readonly index: number
      readonly intitule: string
      readonly contenu: string
      readonly niveau: number
      readonly nbLignes: number
    }[]
    readonly nbParagraphes: number
    readonly motifNonDecoupe?: MotifNonDecoupe
    readonly texteComplet: string
    readonly nomFichier: string
  }
}

/** Lit le fichier et propose son découpage. N'écrit rien en base. */
export async function actionAnalyser(
  _precedent: EtatAnalyse,
  donnees: FormData,
): Promise<EtatAnalyse> {
  await contexte()

  const fichier = donnees.get('fichier')
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: 'Choisissez un fichier Word à lire.' }
  }
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return {
      erreur: `Ce fichier fait ${Math.round(fichier.size / 1024 / 1024)} Mo, au-delà des 20 Mo acceptés. Un CCTP très lourd porte souvent des images : enregistrez-en une copie allégée.`,
    }
  }

  let analyse: AnalyseCctp
  try {
    analyse = await analyserFichier(await fichier.arrayBuffer())
  } catch (erreur) {
    if (erreur instanceof FichierWordInvalide) return { erreur: erreur.message }
    throw erreur
  }

  return {
    analyse: {
      articles: analyse.articles.map((a) => ({ ...a })),
      nbParagraphes: analyse.nbParagraphes,
      ...(analyse.motifNonDecoupe ? { motifNonDecoupe: analyse.motifNonDecoupe } : {}),
      texteComplet: analyse.texteComplet,
      nomFichier: fichier.name,
    },
  }
}

export interface EtatImport {
  readonly erreur?: string
  readonly succes?: string
}

/** Verse en bibliothèque les seuls articles cochés. */
export async function actionImporter(
  _precedent: EtatImport,
  donnees: FormData,
): Promise<EtatImport> {
  const { db } = await contexte()

  const type = (String(donnees.get('type') ?? 'CCTP') || 'CCTP') as TypeTrame
  const corpsEtatId = String(donnees.get('corpsEtatId') ?? '') || null

  let articles: { intitule: string; contenu: string }[]
  try {
    const brut = JSON.parse(String(donnees.get('articles') ?? '[]')) as unknown
    if (!Array.isArray(brut)) throw new Error('forme inattendue')
    articles = brut.map((a) => ({
      intitule: String((a as { intitule?: unknown }).intitule ?? ''),
      contenu: String((a as { contenu?: unknown }).contenu ?? ''),
    }))
  } catch {
    return { erreur: 'La sélection n’a pas pu être lue. Relancez l’analyse du fichier.' }
  }

  if (articles.length === 0) return { erreur: 'Cochez au moins un article à importer.' }

  const resultat = await importerArticles(db, {
    type,
    ...(type === 'CCTP' ? { corpsEtatId } : {}),
    articles,
  })

  revalidatePath('/trames')

  const ignorees =
    resultat.ignorees.length > 0
      ? ` ${resultat.ignorees.length} article(s) vide(s) ont été laissés de côté.`
      : ''

  return {
    succes: `${resultat.nbCreees} trame(s) ajoutée(s) à la bibliothèque.${ignorees}`,
  }
}
