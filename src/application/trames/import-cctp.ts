import type { PrismaClient } from '@prisma/client'
import {
  decouperEnArticles,
  replierEnUnSeulTexte,
  type ArticleImporte,
  type ParagrapheWord,
} from '../../domain/texte/import-word'
import { lireParagraphesDocx } from '../../infrastructure/docx/lecture-docx'
import { creerTrame, type TypeTrame } from './service'
import { journaliserPlusieurs } from '../audit/service'

/**
 * Import d'un CCTP Word dans la bibliothèque de trames — §5.4.
 *
 * L'économiste a des années de CCTP rédigés. Ce service lit un de ses documents
 * et propose de le découper en articles réutilisables, un par ouvrage.
 *
 * L'analyse et l'écriture sont deux gestes séparés, et c'est voulu :
 * `analyserFichier` ne touche pas la base, l'écran montre ce qui a été compris,
 * et `importerArticles` n'écrit que ce qui a été coché. Un import de trente
 * articles qu'on n'a pas relus ne vaut rien — règle 6.
 */

/** Un article proposé, avec de quoi le retrouver dans la liste de l'écran. */
export interface ArticlePropose extends ArticleImporte {
  /** Rang dans le document, qui sert d'identifiant le temps de la sélection. */
  readonly index: number
}

export type MotifNonDecoupe = 'aucun_titre' | 'document_vide'

export interface AnalyseCctp {
  readonly articles: readonly ArticlePropose[]
  readonly nbParagraphes: number
  /**
   * Renseigné quand le découpage n'a rien donné : le document part alors en une
   * seule trame, à découper à la main, plutôt que de ne rien rendre.
   */
  readonly motifNonDecoupe?: MotifNonDecoupe
  /** Document entier, proposé en repli quand le découpage échoue. */
  readonly texteComplet: string
}

/** Lit un fichier et propose son découpage. N'écrit rien. */
export async function analyserFichier(
  donnees: Buffer | ArrayBuffer | Uint8Array,
): Promise<AnalyseCctp> {
  const paragraphes = await lireParagraphesDocx(donnees)
  return analyserParagraphes(paragraphes)
}

/** Partie sans I/O, isolée pour se tester sans fabriquer de fichier. */
export function analyserParagraphes(paragraphes: readonly ParagrapheWord[]): AnalyseCctp {
  const nonVides = paragraphes.filter((p) => p.texte.trim() !== '')
  const texteComplet = replierEnUnSeulTexte(paragraphes)

  if (nonVides.length === 0) {
    return {
      articles: [],
      nbParagraphes: 0,
      motifNonDecoupe: 'document_vide',
      texteComplet: '',
    }
  }

  const articles = decouperEnArticles(paragraphes).map((article, index) => ({ ...article, index }))

  if (articles.length === 0) {
    return {
      articles: [],
      nbParagraphes: nonVides.length,
      motifNonDecoupe: 'aucun_titre',
      texteComplet,
    }
  }

  return { articles, nbParagraphes: nonVides.length, texteComplet }
}

export interface DemandeImport {
  readonly type: TypeTrame
  readonly corpsEtatId?: string | null
  /** Articles retenus, dans l'ordre où l'écran les a présentés. */
  readonly articles: readonly { readonly intitule: string; readonly contenu: string }[]
}

export interface ResultatImport {
  readonly nbCreees: number
  readonly ignorees: readonly string[]
}

/**
 * Verse les articles retenus dans la bibliothèque.
 *
 * Un article sans intitulé ou sans contenu n'est pas créé : une trame vide
 * encombrerait la bibliothèque sans rien apporter. Le compte des ignorées
 * remonte à l'écran plutôt que de disparaître.
 */
export async function importerArticles(
  client: PrismaClient,
  demande: DemandeImport,
): Promise<ResultatImport> {
  const ignorees: string[] = []
  const creees: string[] = []

  for (const article of demande.articles) {
    const intitule = article.intitule.trim()
    const contenu = article.contenu.trim()
    if (intitule === '' || contenu === '') {
      ignorees.push(intitule || '(sans intitulé)')
      continue
    }

    const id = await creerTrame(client, {
      type: demande.type,
      intitule,
      contenu,
      ...(demande.type === 'CCTP' ? { corpsEtatId: demande.corpsEtatId ?? null } : {}),
    })
    creees.push(id)
  }

  // Une entrée par trame créée : elles sont peu nombreuses et chacune est un
  // texte que l'économiste engagera dans un DCE.
  await journaliserPlusieurs(
    client,
    creees.map((id) => ({
      entite: 'TexteCctp' as const,
      entiteId: id,
      action: 'CREATION' as const,
      apres: { origine: 'import Word' },
    })),
  )

  return { nbCreees: creees.length, ignorees }
}
