import { lireNombre, normaliserUnite } from '../saisie'
import { devinerMappageDpgf } from '../import/analyse-dpgf'

/**
 * Correspondance des colonnes d'un collage — SPEC_APP_ECONOMISTE.md §5.2.
 *
 * Le collage remplissait jusqu'ici les colonnes dans l'ordre fixe de la grille,
 * à partir de celle où se trouvait le curseur. Un tableur dont les colonnes sont
 * dans un autre ordre — le prix unitaire avant la quantité, cas courant — versait
 * donc le prix dans la quantité et la quantité dans le prix. Les deux valeurs
 * étant parfaitement lisibles, rien ne se signalait : le total était faux, en
 * silence. C'est le défaut que ce module corrige.
 *
 * Le principe retenu suit la règle 7 : ce module *propose*, l'économiste
 * confirme. La proposition dit aussi ce dont elle est sûre et ce dont elle ne
 * l'est pas, pour que l'écran attire l'œil au bon endroit.
 *
 * La certitude ne vient que de deux choses : un en-tête qui nomme la colonne,
 * ou un contenu d'une classe non ambiguë (une unité, du texte). Départager deux
 * colonnes de nombres — quantité ou prix — n'est jamais tenu pour certain, parce
 * que se tromper là fausse un montant.
 *
 * Fonctions pures : aucune I/O.
 */

/** Colonnes que l'on peut remplir par collage, dans l'ordre de la grille. */
export const COLONNES_COLLABLES = [
  'code',
  'designation',
  'unite',
  'quantite',
  'prixUnitaireHtBase',
  'coefficientApplique',
] as const

export type ColonneCollable = (typeof COLONNES_COLLABLES)[number]

export const LIBELLES_COLONNE: Record<ColonneCollable, string> = {
  code: 'Code',
  designation: 'Désignation',
  unite: 'Unité',
  quantite: 'Quantité',
  prixUnitaireHtBase: 'Prix unitaire',
  coefficientApplique: 'Coefficient',
}

/** Une colonne collée, et ce qu'on propose d'en faire. */
export interface PropositionColonne {
  /** Champ visé, ou null pour « ne pas coller cette colonne ». */
  readonly colonne: ColonneCollable | null
  /**
   * Faux quand la proposition relève de la devinette. L'écran doit alors
   * demander une confirmation explicite plutôt que de laisser passer.
   */
  readonly certain: boolean
}

export interface MappageCollage {
  readonly colonnes: readonly PropositionColonne[]
  /** Vrai si la première ligne collée est un en-tête, à ne pas coller. */
  readonly enteteDetectee: boolean
}

/** Proportion minimale de valeurs d'une classe pour trancher sans hésiter. */
const SEUIL_CLASSE = 0.7
const SEUIL_TEXTE = 0.6
const ECHANTILLON_MAX = 30

const MOTIF_CODE = /^[A-Za-z0-9]+([.\-_][A-Za-z0-9]+)+$/
const MOTIF_COEFFICIENT = /coef|coeff|ajustement/i

/** Ce qu'on observe dans une colonne, pour en deviner la nature. */
interface Profil {
  readonly nbValeurs: number
  readonly nbUnites: number
  readonly nbNombres: number
  readonly nbTexteLong: number
  readonly nbCodes: number
  readonly nbDeuxDecimales: number
  readonly nbProchesDeUn: number
}

function profiler(valeurs: readonly string[]): Profil {
  let nbValeurs = 0
  let nbUnites = 0
  let nbNombres = 0
  let nbTexteLong = 0
  let nbCodes = 0
  let nbDeuxDecimales = 0
  let nbProchesDeUn = 0

  for (const brut of valeurs) {
    const texte = brut.trim()
    if (texte === '') continue
    nbValeurs += 1

    if (normaliserUnite(texte) !== null) nbUnites += 1

    // L'ordre compte : « 02.01 » se lit aussi comme le nombre 2,01. Or en
    // français la décimale s'écrit avec une virgule, donc un séparateur point
    // désigne presque toujours un code d'ouvrage. On teste le code d'abord,
    // sans quoi une colonne de codes passe pour une colonne de coefficients.
    if (MOTIF_CODE.test(texte) && !texte.includes(',')) {
      nbCodes += 1
      continue
    }

    const nombre = lireNombre(texte)
    if (nombre !== null) {
      nbNombres += 1
      const decimales = nombre.split('.')[1]
      if (decimales?.length === 2) nbDeuxDecimales += 1
      const valeur = Number(nombre)
      if (valeur >= 0.5 && valeur <= 3 && !Number.isInteger(valeur)) nbProchesDeUn += 1
      continue
    }

    // Une désignation est du texte long, ni nombre ni code.
    if (texte.length > 12) nbTexteLong += 1
  }

  return { nbValeurs, nbUnites, nbNombres, nbTexteLong, nbCodes, nbDeuxDecimales, nbProchesDeUn }
}

/** Correspondance historique : les colonnes de la grille, à la suite. */
export function mappagePositionnel(
  colonneDepart: ColonneCollable,
  largeur: number,
): readonly PropositionColonne[] {
  const depart = COLONNES_COLLABLES.indexOf(colonneDepart)
  return Array.from({ length: largeur }, (_, index) => ({
    colonne: COLONNES_COLLABLES[depart + index] ?? null,
    certain: false,
  }))
}

/**
 * Lit la première ligne comme un en-tête. Rend une correspondance par nom de
 * colonne, ou null si la ligne n'a rien d'un en-tête.
 */
function mappageDepuisEntete(ligne: readonly string[]): (ColonneCollable | null)[] | null {
  const depuisDpgf = devinerMappageDpgf(ligne)
  const parIndex = new Map<number, ColonneCollable>()

  // Le module d'import nomme le prix « prixUnitaireHt » ; la grille stocke un
  // prix de base, sur lequel s'applique ensuite le coefficient.
  if (depuisDpgf.code !== undefined) parIndex.set(depuisDpgf.code, 'code')
  if (depuisDpgf.designation !== undefined) parIndex.set(depuisDpgf.designation, 'designation')
  if (depuisDpgf.unite !== undefined) parIndex.set(depuisDpgf.unite, 'unite')
  if (depuisDpgf.quantite !== undefined) parIndex.set(depuisDpgf.quantite, 'quantite')
  if (depuisDpgf.prixUnitaireHt !== undefined) {
    parIndex.set(depuisDpgf.prixUnitaireHt, 'prixUnitaireHtBase')
  }

  // Le coefficient n'existe pas dans un DPGF importé : il est propre à la grille.
  for (const [index, cellule] of ligne.entries()) {
    if (parIndex.has(index)) continue
    if (MOTIF_COEFFICIENT.test(cellule.trim())) parIndex.set(index, 'coefficientApplique')
  }

  // Une seule colonne reconnue peut être un hasard ; deux, non.
  if (parIndex.size < 2) return null
  return ligne.map((_, index) => parIndex.get(index) ?? null)
}

/**
 * Propose à quoi correspond chaque colonne d'un bloc collé.
 *
 * `colonneDepart` sert de repli : quand le contenu ne dit rien, on retombe sur
 * l'ancien comportement positionnel — mais sans le présenter comme certain.
 */
export function devinerMappageCollage(
  lignes: readonly (readonly string[])[],
  colonneDepart: ColonneCollable,
): MappageCollage {
  const largeur = lignes.reduce((max, ligne) => Math.max(max, ligne.length), 0)
  if (largeur === 0) return { colonnes: [], enteteDetectee: false }

  const premiere = lignes[0]
  const parEntete = premiere ? mappageDepuisEntete(premiere) : null
  if (parEntete) {
    // Un en-tête nomme les colonnes : c'est la seule source de certitude sur
    // un couple quantité / prix.
    return {
      colonnes: Array.from({ length: largeur }, (_, index) => ({
        colonne: parEntete[index] ?? null,
        certain: parEntete[index] !== null && parEntete[index] !== undefined,
      })),
      enteteDetectee: true,
    }
  }

  const corps = lignes.slice(0, ECHANTILLON_MAX)
  const profils = Array.from({ length: largeur }, (_, index) =>
    profiler(corps.map((ligne) => ligne[index] ?? '')),
  )

  const resultat: (PropositionColonne | null)[] = Array.from({ length: largeur }, () => null)
  const pris = new Set<ColonneCollable>()

  const attribuer = (index: number, colonne: ColonneCollable, certain: boolean): void => {
    resultat[index] = { colonne, certain }
    pris.add(colonne)
  }

  // 1. L'unité : la classe la moins ambiguë. « M2 » n'est rien d'autre.
  profils.forEach((profil, index) => {
    if (pris.has('unite') || profil.nbValeurs === 0) return
    if (profil.nbUnites / profil.nbValeurs >= SEUIL_CLASSE) attribuer(index, 'unite', true)
  })

  // 2. La désignation : du texte long, qui n'est ni un nombre ni un code.
  profils.forEach((profil, index) => {
    if (resultat[index] || pris.has('designation') || profil.nbValeurs === 0) return
    if (profil.nbTexteLong / profil.nbValeurs >= SEUIL_TEXTE) attribuer(index, 'designation', true)
  })

  // 3. Le code : un identifiant à séparateurs.
  profils.forEach((profil, index) => {
    if (resultat[index] || pris.has('code') || profil.nbValeurs === 0) return
    if (profil.nbCodes / profil.nbValeurs >= SEUIL_CLASSE) attribuer(index, 'code', true)
  })

  // 4. Les colonnes de nombres. Ici commence la devinette, et elle se déclare
  //    comme telle : c'est exactement là que l'ancien collage se trompait.
  const numeriques = profils
    .map((profil, index) => ({ profil, index }))
    .filter(
      ({ profil, index }) =>
        !resultat[index] && profil.nbValeurs > 0 && profil.nbNombres / profil.nbValeurs >= SEUIL_CLASSE,
    )

  // Un coefficient se reconnaît à ses valeurs serrées autour de 1, mais on ne
  // le propose que s'il reste d'autres colonnes de nombres à côté.
  if (numeriques.length >= 3 && !pris.has('coefficientApplique')) {
    const candidat = numeriques.find(
      ({ profil }) => profil.nbProchesDeUn / profil.nbValeurs >= 0.8,
    )
    if (candidat) attribuer(candidat.index, 'coefficientApplique', false)
  }

  const restants = numeriques.filter(({ index }) => !resultat[index])

  if (restants.length === 2) {
    // Deux colonnes de nombres : celle qui porte le plus de montants à deux
    // décimales est probablement le prix. « Probablement » — donc jamais certain.
    const [premier, second] = restants as [typeof restants[0], typeof restants[0]]
    const partDecimales = (p: Profil): number => (p.nbValeurs === 0 ? 0 : p.nbDeuxDecimales / p.nbValeurs)
    const prixDabord = partDecimales(premier.profil) > partDecimales(second.profil)
    attribuer(premier.index, prixDabord ? 'prixUnitaireHtBase' : 'quantite', false)
    attribuer(second.index, prixDabord ? 'quantite' : 'prixUnitaireHtBase', false)
  } else {
    for (const { index } of restants) {
      const colonne = (['quantite', 'prixUnitaireHtBase'] as const).find((c) => !pris.has(c))
      if (!colonne) break
      attribuer(index, colonne, false)
    }
  }

  // 5. Ce qui reste sans nature retombe sur l'ordre de la grille, en le disant.
  const repli = mappagePositionnel(colonneDepart, largeur)
  const colonnes = resultat.map((proposition, index) => {
    if (proposition) return proposition
    const secours = repli[index]?.colonne ?? null
    return { colonne: secours && !pris.has(secours) ? secours : null, certain: false }
  })

  return { colonnes, enteteDetectee: false }
}
