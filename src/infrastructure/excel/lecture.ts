import ExcelJS from 'exceljs'

/**
 * Lecture de classeurs Excel.
 *
 * Les DPGF reçus sont rarement propres : en-têtes sur plusieurs lignes, colonnes
 * fusionnées, formules, nombres stockés en texte. On ramène donc tout à une
 * grille de chaînes, et c'est l'assistant d'import qui décide du sens de chaque
 * colonne. Aucune conversion numérique n'a lieu ici.
 */

export interface FeuilleResume {
  readonly nom: string
  readonly nbLignes: number
  readonly nbColonnes: number
}

/** Transforme n'importe quelle valeur de cellule en texte exploitable. */
export function valeurEnTexte(valeur: ExcelJS.CellValue): string {
  if (valeur === null || valeur === undefined) return ''
  if (typeof valeur === 'string') return valeur.trim()
  if (typeof valeur === 'number') return String(valeur)
  if (typeof valeur === 'boolean') return valeur ? 'vrai' : 'faux'
  if (valeur instanceof Date) return valeur.toISOString().slice(0, 10)

  if (typeof valeur === 'object') {
    // Cellule à texte enrichi
    if ('richText' in valeur && Array.isArray(valeur.richText)) {
      return valeur.richText.map((morceau) => morceau.text).join('').trim()
    }
    // Cellule calculée : on prend le résultat, pas la formule
    if ('result' in valeur && valeur.result !== undefined && valeur.result !== null) {
      return valeurEnTexte(valeur.result as ExcelJS.CellValue)
    }
    if ('error' in valeur) return ''
    if ('text' in valeur && typeof valeur.text === 'string') return valeur.text.trim()
  }

  return String(valeur).trim()
}

async function ouvrir(contenu: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> {
  const classeur = new ExcelJS.Workbook()
  // ExcelJS déclare son propre type de tampon ; les octets sont les mêmes.
  const octets = contenu instanceof ArrayBuffer ? new Uint8Array(contenu) : contenu
  await classeur.xlsx.load(octets as unknown as ExcelJS.Buffer)
  return classeur
}

export async function listerFeuilles(contenu: Buffer | ArrayBuffer): Promise<FeuilleResume[]> {
  const classeur = await ouvrir(contenu)
  return classeur.worksheets.map((feuille) => ({
    nom: feuille.name,
    nbLignes: feuille.actualRowCount ?? feuille.rowCount,
    nbColonnes: feuille.actualColumnCount ?? feuille.columnCount,
  }))
}

export interface OptionsLecture {
  readonly nomFeuille?: string
  /** Numéro de la première ligne lue, 1 pour la première ligne du classeur. */
  readonly ligneDebut?: number
  readonly maxLignes?: number
  readonly maxColonnes?: number
}

/** Lit une feuille sous forme de grille de chaînes, index zéro. */
export async function lireGrille(
  contenu: Buffer | ArrayBuffer,
  options: OptionsLecture = {},
): Promise<string[][]> {
  const classeur = await ouvrir(contenu)
  const feuille = options.nomFeuille
    ? classeur.getWorksheet(options.nomFeuille)
    : classeur.worksheets[0]

  if (!feuille) {
    throw new Error(
      options.nomFeuille
        ? `Feuille introuvable dans le classeur : ${options.nomFeuille}`
        : 'Le classeur ne contient aucune feuille.',
    )
  }

  const ligneDebut = Math.max(options.ligneDebut ?? 1, 1)
  const maxLignes = options.maxLignes ?? 20_000
  const maxColonnes = Math.min(options.maxColonnes ?? 40, 200)

  const grille: string[][] = []
  const derniere = Math.min(feuille.rowCount, ligneDebut + maxLignes - 1)

  for (let numero = ligneDebut; numero <= derniere; numero += 1) {
    const ligne = feuille.getRow(numero)
    const cellules: string[] = []
    for (let colonne = 1; colonne <= maxColonnes; colonne += 1) {
      cellules.push(valeurEnTexte(ligne.getCell(colonne).value))
    }
    // On supprime les colonnes vides de fin, mais on garde les lignes vides :
    // leur position compte pour retrouver la correspondance avec le fichier.
    while (cellules.length > 0 && cellules[cellules.length - 1] === '') cellules.pop()
    grille.push(cellules)
  }

  return grille
}

/** Retire les lignes entièrement vides en fin de grille. */
export function elaguer(grille: readonly string[][]): string[][] {
  const copie = grille.map((ligne) => [...ligne])
  while (copie.length > 0 && (copie[copie.length - 1] ?? []).every((c) => c === '')) copie.pop()
  return copie
}
