/**
 * Lecture d'un CCTP existant au format Word — SPEC_APP_ECONOMISTE.md §5.4.
 *
 * L'économiste a des années de CCTP rédigés. Les ressaisir pour alimenter la
 * bibliothèque de trames n'a aucun sens : ce module lit ses documents et en
 * propose le découpage en articles réutilisables.
 *
 * Trois partis pris.
 *
 * On lit le Word, pas le PDF. La structure d'un document Word est explicite —
 * un titre porte un style de titre — là où un PDF ne rend qu'un texte à plat
 * dont il faudrait deviner la hiérarchie. À contenu égal, l'import est fidèle
 * au lieu d'être approximatif.
 *
 * Un article est le titre le moins profond qui porte du texte. Ses
 * sous-titres éventuels sont repliés dedans en `## `, parce qu'un article de
 * CCTP a souvent des sous-points qui n'ont pas de sens séparés. Un titre de
 * chapitre qui ne contient que d'autres titres n'est pas un article : il ne
 * porterait aucune prescription.
 *
 * Rien n'est importé sans avoir été coché. Ce module propose un découpage,
 * l'écran le montre, l'économiste tranche — règle 6.
 *
 * Fonctions pures : aucune I/O. Le déballage du fichier vit dans
 * `src/infrastructure/docx/lecture-docx.ts`.
 */

export interface ParagrapheWord {
  /** Style Word du paragraphe, tel quel : « Heading2 », « Titre3 », « Normal »… */
  readonly style: string | null
  readonly texte: string
  /** Vrai quand Word lui applique une puce ou une numérotation automatique. */
  readonly liste: boolean
}

export interface ArticleImporte {
  readonly intitule: string
  /** Texte structuré, au format des pièces écrites. */
  readonly contenu: string
  /** Profondeur du titre dans le document, 1 pour un titre de premier niveau. */
  readonly niveau: number
  /** Nombre de lignes de texte, pour que l'écran montre le poids de l'article. */
  readonly nbLignes: number
}

/* ------------------------------------------------------------------ */
/* Lecture du XML de Word                                              */
/* ------------------------------------------------------------------ */

const ENTITES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0', // insécable, écrit en échappement : invisible autrement
}

function decoderEntites(texte: string): string {
  return texte.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entier, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
    }
    if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10))
    return ENTITES[code] ?? entier
  })
}

/**
 * Extrait les paragraphes de `word/document.xml`.
 *
 * On ne lit que `w:t` : le texte supprimé en révision vit dans `w:delText` et
 * reste donc dehors, ce qui est le comportement attendu — on importe le
 * document tel qu'il se lit, pas son historique.
 */
export function analyserDocumentWord(xml: string): ParagrapheWord[] {
  const paragraphes: ParagrapheWord[] = []

  for (const bloc of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const corps = bloc[1] ?? ''

    const style = /<w:pStyle\s[^>]*w:val="([^"]*)"/.exec(corps)?.[1] ?? null
    const liste = /<w:numPr[\s/>]/.test(corps)

    // Tabulations et sauts de ligne deviennent des espaces : un article de CCTP
    // se lit en phrases, pas en colonnes.
    const morceaux = [...corps.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(?:tab|br)\s*\/>/g)]
    const texte = morceaux
      .map((m) => (m[1] === undefined ? ' ' : decoderEntites(m[1])))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()

    paragraphes.push({ style, texte, liste })
  }

  return paragraphes
}

/* ------------------------------------------------------------------ */
/* Reconnaissance des titres                                           */
/* ------------------------------------------------------------------ */

/** « Heading2 », « Titre 3 », « Title » — Word nomme ses styles selon sa langue. */
const STYLE_TITRE = /^(?:heading|titre|title|berschrift)\s*(\d)?$/i

/** « 2.1.3 Voile béton » — la numérotation manuelle, très répandue. */
const NUMEROTATION = /^(\d+(?:\.\d+)*)[.)]?\s+(\S.*)$/

const LONGUEUR_MAX_TITRE = 120

/** Un paragraphe d'espaces vaut un paragraphe vide. */
function estBlanc(paragraphe: ParagrapheWord): boolean {
  return paragraphe.texte.trim() === ''
}

/**
 * Profondeur d'un paragraphe comme titre, ou null s'il n'en est pas un.
 *
 * Beaucoup de CCTP n'utilisent aucun style Word : leur hiérarchie tient dans une
 * numérotation tapée à la main. La refuser reviendrait à ne rien savoir importer
 * de la moitié des documents réels.
 */
export function niveauTitre(paragraphe: ParagrapheWord): number | null {
  if (estBlanc(paragraphe)) return null

  if (paragraphe.style) {
    const correspondance = STYLE_TITRE.exec(paragraphe.style.replace(/[\s_-]/g, ''))
    if (correspondance) return correspondance[1] ? Number(correspondance[1]) : 1
  }

  // Un paragraphe numéroté par Word est une liste, pas un titre.
  if (paragraphe.liste) return null

  const numerote = NUMEROTATION.exec(paragraphe.texte)
  if (numerote && paragraphe.texte.length <= LONGUEUR_MAX_TITRE) {
    return (numerote[1] ?? '').split('.').length
  }

  return null
}

/** Enlève la numérotation d'un intitulé : elle est déjà dans la hiérarchie. */
function intituleNet(texte: string): string {
  const numerote = NUMEROTATION.exec(texte)
  return (numerote?.[2] ?? texte).trim()
}

function estPuce(paragraphe: ParagrapheWord): boolean {
  if (paragraphe.liste) return true
  if (/^list/i.test(paragraphe.style ?? '')) return true
  return /^[-–—•·*]\s+/.test(paragraphe.texte)
}

function texteDePuce(texte: string): string {
  return texte.replace(/^[-–—•·*]\s+/, '').trim()
}

/* ------------------------------------------------------------------ */
/* Découpage en articles                                               */
/* ------------------------------------------------------------------ */

interface Candidat {
  niveau: number
  intitule: string
  blocs: string[]
  /** Un titre qui ne porte aucun texte n'est pas un article, mais un chapitre. */
  aDuTexte: boolean
  nbLignes: number
}

function cloturer(candidat: Candidat | null, articles: ArticleImporte[]): void {
  if (!candidat || !candidat.aDuTexte) return
  articles.push({
    intitule: candidat.intitule,
    contenu: candidat.blocs.join('\n\n').trim(),
    niveau: candidat.niveau,
    nbLignes: candidat.nbLignes,
  })
}

/**
 * Découpe un document en articles réutilisables.
 *
 * Un article est le titre le moins profond qui porte directement du texte ; les
 * sous-titres qu'il contient sont repliés dedans en `## `. Un titre qui ne
 * contient que d'autres titres ne produit rien : c'est un chapitre.
 */
export function decouperEnArticles(paragraphes: readonly ParagrapheWord[]): ArticleImporte[] {
  const articles: ArticleImporte[] = []
  let candidat: Candidat | null = null

  for (const paragraphe of paragraphes) {
    if (estBlanc(paragraphe)) continue

    const niveau = niveauTitre(paragraphe)

    if (niveau !== null) {
      // Un sous-titre d'un article déjà ouvert lui appartient.
      if (candidat && candidat.aDuTexte && niveau > candidat.niveau) {
        candidat.blocs.push(`## ${intituleNet(paragraphe.texte)}`)
        continue
      }
      cloturer(candidat, articles)
      candidat = {
        niveau,
        intitule: intituleNet(paragraphe.texte),
        blocs: [],
        aDuTexte: false,
        nbLignes: 0,
      }
      continue
    }

    // Du texte avant le premier titre n'a pas d'article où aller : le document
    // n'a alors pas de structure exploitable, et l'appelant retombe sur un
    // import en bloc plutôt que de perdre le contenu en silence.
    if (!candidat) continue

    candidat.blocs.push(estPuce(paragraphe) ? `- ${texteDePuce(paragraphe.texte)}` : paragraphe.texte)
    candidat.aDuTexte = true
    candidat.nbLignes += 1
  }

  cloturer(candidat, articles)
  return articles
}

/**
 * Replie tout le document en un seul texte structuré.
 *
 * Sert quand aucun titre n'est reconnu : mieux vaut une trame à découper à la
 * main qu'un import qui ne rend rien.
 */
export function replierEnUnSeulTexte(paragraphes: readonly ParagrapheWord[]): string {
  const blocs: string[] = []
  for (const paragraphe of paragraphes) {
    if (estBlanc(paragraphe)) continue
    const niveau = niveauTitre(paragraphe)
    if (niveau !== null) blocs.push(`## ${intituleNet(paragraphe.texte)}`)
    else if (estPuce(paragraphe)) blocs.push(`- ${texteDePuce(paragraphe.texte)}`)
    else blocs.push(paragraphe.texte)
  }
  return blocs.join('\n\n').trim()
}
