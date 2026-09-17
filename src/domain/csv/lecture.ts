/**
 * Lecture d'un fichier CSV — point d'entrée du répertoire d'entreprises.
 *
 * Un CSV n'est pas un format, c'est une famille d'habitudes. Celui qui sort
 * d'un Excel français utilise le point-virgule et l'encodage Windows-1252 ;
 * celui d'un logiciel de gestion, la virgule et l'UTF-8 ; celui d'un export de
 * messagerie, la tabulation. Demander à l'économiste lequel est le sien serait
 * lui poser une question dont il n'a pas à connaître la réponse.
 *
 * Ce module devine, et le dit. Ce qu'il ne sait pas lire devient une anomalie,
 * jamais une ligne vide silencieuse — règle 7.
 */

export type Separateur = ';' | ',' | '\t'

export const SEPARATEURS: readonly Separateur[] = [';', ',', '\t']

export const LIBELLES_SEPARATEUR: Record<Separateur, string> = {
  ';': 'point-virgule',
  ',': 'virgule',
  '\t': 'tabulation',
}

export type Encodage = 'utf-8' | 'windows-1252'

export interface LectureCsv {
  readonly grille: readonly (readonly string[])[]
  readonly separateur: Separateur
  readonly encodage: Encodage
  /** Vrai quand les lignes n'ont pas toutes le même nombre de colonnes. */
  readonly colonnesIrregulieres: boolean
}

/**
 * Décode les octets du fichier.
 *
 * L'UTF-8 strict sert de test : un fichier qui s'y refuse vient presque
 * toujours d'un Excel français, donc du Windows-1252. Deviner dans ce sens ne
 * peut pas abîmer un fichier correct, alors que l'inverse transformerait tous
 * les accents en charabia sans que rien ne le signale.
 */
export function decoder(octets: Uint8Array): { texte: string; encodage: Encodage } {
  // Une marque d'ordre des octets lève tout doute.
  if (octets.length >= 3 && octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf) {
    return { texte: new TextDecoder('utf-8').decode(octets.subarray(3)), encodage: 'utf-8' }
  }

  try {
    return { texte: new TextDecoder('utf-8', { fatal: true }).decode(octets), encodage: 'utf-8' }
  } catch {
    return { texte: new TextDecoder('windows-1252').decode(octets), encodage: 'windows-1252' }
  }
}

/** Découpe une ligne en respectant les guillemets, sans traiter les retours à la ligne. */
function compterHorsGuillemets(texte: string, separateur: string): number {
  let compte = 0
  let dansGuillemets = false
  for (let i = 0; i < texte.length; i += 1) {
    const caractere = texte[i]
    if (caractere === '"') {
      if (dansGuillemets && texte[i + 1] === '"') {
        i += 1
        continue
      }
      dansGuillemets = !dansGuillemets
      continue
    }
    if (!dansGuillemets && caractere === separateur) compte += 1
  }
  return compte
}

/**
 * Choisit le séparateur : celui qui découpe le plus de colonnes, et le fait de
 * façon constante d'une ligne à l'autre. Une régularité parfaite sur trois
 * lignes vaut mieux qu'un grand nombre de colonnes sur une seule.
 */
export function devinerSeparateur(texte: string): Separateur {
  const lignes = texte.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '').slice(0, 10)
  if (lignes.length === 0) return ';'

  let meilleur: Separateur = ';'
  let meilleurScore = -1

  for (const separateur of SEPARATEURS) {
    const comptes = lignes.map((ligne) => compterHorsGuillemets(ligne, separateur))
    const premier = comptes[0] ?? 0
    if (premier === 0) continue
    const regulier = comptes.every((compte) => compte === premier)
    // Un séparateur régulier l'emporte largement sur un séparateur abondant.
    const score = premier * (regulier ? 10 : 1)
    if (score > meilleurScore) {
      meilleurScore = score
      meilleur = separateur
    }
  }

  return meilleur
}

/**
 * Analyse le texte en grille. Les guillemets protègent les séparateurs et les
 * retours à la ligne — une adresse sur deux lignes reste une seule cellule.
 */
export function analyserCsv(texte: string, separateur: Separateur): string[][] {
  const grille: string[][] = []
  let ligne: string[] = []
  let cellule = ''
  let dansGuillemets = false

  const finirCellule = (): void => {
    ligne.push(cellule)
    cellule = ''
  }
  const finirLigne = (): void => {
    finirCellule()
    grille.push(ligne)
    ligne = []
  }

  for (let i = 0; i < texte.length; i += 1) {
    const caractere = texte[i] as string

    if (dansGuillemets) {
      if (caractere === '"') {
        // Deux guillemets de suite : un guillemet littéral.
        if (texte[i + 1] === '"') {
          cellule += '"'
          i += 1
        } else {
          dansGuillemets = false
        }
      } else {
        cellule += caractere
      }
      continue
    }

    if (caractere === '"' && cellule.trim() === '') {
      // Un guillemet n'ouvre un champ qu'en tête de cellule ; ailleurs c'est
      // un caractère comme un autre (« Ets 15" » n'est pas une citation).
      cellule = ''
      dansGuillemets = true
      continue
    }

    if (caractere === separateur) {
      finirCellule()
      continue
    }

    if (caractere === '\r') {
      if (texte[i + 1] === '\n') i += 1
      finirLigne()
      continue
    }

    if (caractere === '\n') {
      finirLigne()
      continue
    }

    cellule += caractere
  }

  // La dernière ligne n'est close par aucun retour chariot.
  if (cellule !== '' || ligne.length > 0) finirLigne()

  // Une ligne entièrement vide n'est pas une donnée.
  return grille.filter((l) => l.some((c) => c.trim() !== ''))
}

export function lireCsv(octets: Uint8Array): LectureCsv {
  const { texte, encodage } = decoder(octets)
  const separateur = devinerSeparateur(texte)
  const grille = analyserCsv(texte, separateur).map((ligne) => ligne.map((c) => c.trim()))

  const largeurs = new Set(grille.map((ligne) => ligne.length))

  return {
    grille,
    separateur,
    encodage,
    colonnesIrregulieres: largeurs.size > 1,
  }
}
