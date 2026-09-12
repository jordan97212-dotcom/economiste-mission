/**
 * Format de texte des pièces écrites.
 *
 * Choix assumé : un texte brut à conventions simples plutôt qu'un éditeur riche.
 *
 *   ## Titre de paragraphe
 *   Un paragraphe ordinaire.
 *   - un élément de liste
 *
 * Deux raisons. D'abord, le même analyseur sert à l'aperçu écran et au rendu
 * Word : les deux ne peuvent pas diverger. Ensuite, le contenu reste lisible et
 * modifiable sans l'application, ce que le §2.4 demande. Un éditeur riche
 * pourra venir plus tard : il produira le même format, et rien d'autre ne
 * bougera.
 */

export type TypeBloc = 'titre' | 'paragraphe' | 'puce'

export interface BlocTexte {
  readonly type: TypeBloc
  readonly texte: string
}

export interface TexteStructure {
  readonly format: 'texte-structure'
  readonly contenu: string
  /**
   * Désignation de l'ouvrage au moment où le texte a été écrit. Sert à signaler
   * qu'une désignation a changé depuis, sans lien vers le DPGF — §5.4.
   */
  readonly designationSource?: string | null
}

export function estTexteStructure(valeur: unknown): valeur is TexteStructure {
  if (typeof valeur !== 'object' || valeur === null) return false
  const candidat = valeur as Partial<Record<'format' | 'contenu', unknown>>
  return candidat.format === 'texte-structure' && typeof candidat.contenu === 'string'
}

export function creerTexte(contenu: string, designationSource?: string | null): TexteStructure {
  return {
    format: 'texte-structure',
    contenu,
    designationSource: designationSource ?? null,
  }
}

/** Vrai si le texte ne contient rien d'exploitable. */
export function estVide(contenu: string | null | undefined): boolean {
  return (contenu ?? '').trim() === ''
}

/** Découpe le texte en blocs. Les lignes vides séparent les paragraphes. */
export function analyserTexte(contenu: string): BlocTexte[] {
  const blocs: BlocTexte[] = []
  let paragraphe: string[] = []

  const viderParagraphe = (): void => {
    if (paragraphe.length > 0) {
      blocs.push({ type: 'paragraphe', texte: paragraphe.join(' ').trim() })
      paragraphe = []
    }
  }

  for (const ligneBrute of contenu.replace(/\r\n?/g, '\n').split('\n')) {
    const ligne = ligneBrute.trim()

    if (ligne === '') {
      viderParagraphe()
      continue
    }

    if (ligne.startsWith('##')) {
      viderParagraphe()
      blocs.push({ type: 'titre', texte: ligne.replace(/^#+\s*/, '').trim() })
      continue
    }

    if (/^[-•*]\s+/.test(ligne)) {
      viderParagraphe()
      blocs.push({ type: 'puce', texte: ligne.replace(/^[-•*]\s+/, '').trim() })
      continue
    }

    paragraphe.push(ligne)
  }

  viderParagraphe()
  return blocs.filter((bloc) => bloc.texte !== '')
}

/** Reconstruit un texte brut depuis ses blocs. Aller-retour stable. */
export function reconstruireTexte(blocs: readonly BlocTexte[]): string {
  return blocs
    .map((bloc) => {
      if (bloc.type === 'titre') return `## ${bloc.texte}`
      if (bloc.type === 'puce') return `- ${bloc.texte}`
      return bloc.texte
    })
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// Variables de mission
// ---------------------------------------------------------------------------

const MOTIF_VARIABLE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi

export interface ResolutionVariables {
  readonly texte: string
  /** Variables rencontrées dans le texte mais absentes du jeu fourni. */
  readonly manquantes: readonly string[]
}

/**
 * Remplace les variables `{{nom_operation}}` par les valeurs de la mission.
 * Une variable inconnue est laissée telle quelle et signalée : mieux vaut voir
 * la marque dans le document que de découvrir un trou silencieux.
 */
export function resoudreVariables(
  contenu: string,
  variables: Readonly<Record<string, string | null | undefined>>,
): ResolutionVariables {
  const manquantes = new Set<string>()

  const texte = contenu.replace(MOTIF_VARIABLE, (correspondance, nom: string) => {
    const cle = nom.toLowerCase()
    const valeur = variables[cle]
    if (valeur === null || valeur === undefined || valeur === '') {
      manquantes.add(cle)
      return correspondance
    }
    return valeur
  })

  return { texte, manquantes: [...manquantes] }
}

/** Liste les variables présentes dans un texte, sans les résoudre. */
export function listerVariables(contenu: string): string[] {
  const trouvees = new Set<string>()
  for (const correspondance of contenu.matchAll(MOTIF_VARIABLE)) {
    const nom = correspondance[1]
    if (nom) trouvees.add(nom.toLowerCase())
  }
  return [...trouvees]
}

// ---------------------------------------------------------------------------
// Unités citées dans un texte
// ---------------------------------------------------------------------------

// Attention aux limites de mot : « ² » n'est pas un caractère de mot, donc un
// \b placé après lui ne correspond jamais. Les deux écritures sont traitées
// séparément.
const UNITES_CITEES: readonly { readonly motif: RegExp; readonly unite: string }[] = [
  { motif: /\bm²|\bm2\b/i, unite: 'M2' },
  { motif: /\bm³|\bm3\b/i, unite: 'M3' },
  { motif: /\bml\b|\bm[eè]tre[s]?\s+lin[ée]aire[s]?\b/i, unite: 'ML' },
  { motif: /\bkg\b|\bkilogramme[s]?\b/i, unite: 'KG' },
  { motif: /\btonne[s]?\b/i, unite: 'T' },
  { motif: /\bforfait\b/i, unite: 'FORFAIT' },
]

/**
 * Repère les unités de mesure citées dans un texte descriptif.
 * Sert au contrôle de cohérence entre le CCTP et le DPGF — §5.4.
 */
export function unitesCitees(contenu: string): string[] {
  const trouvees = new Set<string>()
  for (const { motif, unite } of UNITES_CITEES) {
    if (motif.test(contenu)) trouvees.add(unite)
  }
  return [...trouvees]
}
