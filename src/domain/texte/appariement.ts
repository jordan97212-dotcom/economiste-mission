/**
 * Appariement des ouvrages du DPGF avec la bibliothèque de trames — §5.4.
 *
 * Rédiger le CCTP revient à retrouver, pour chaque ligne du bordereau, le texte
 * qu'on a déjà écrit ailleurs. Ce module fait ce rapprochement et propose une
 * correspondance ; il n'écrit rien et n'invente aucune prescription.
 *
 * Ce qu'il ne fait pas, et pourquoi. Il ne rédige pas le texte d'un ouvrage qui
 * n'a pas de trame : un CCTP est une pièce contractuelle que l'économiste signe,
 * et une prescription technique inventée l'engagerait sur des tolérances, des
 * dosages ou des normes que personne n'a vérifiés. Un ouvrage sans trame
 * ressort donc comme tel, à rédiger.
 *
 * La correspondance est un brouillon. Elle se présente avec son degré de
 * certitude, et seules les propositions cochées sont appliquées — règle 6.
 *
 * Fonction pure : aucune I/O.
 */

export interface PosteAApparier {
  readonly posteId: string
  readonly designation: string
  /** Vrai si l'ouvrage porte déjà un texte : on ne l'écrase pas en silence. */
  readonly aDejaUnTexte: boolean
}

export interface TrameCandidate {
  readonly trameId: string
  readonly intitule: string
  /** Null pour les généralités, qui valent pour tous les corps d'état. */
  readonly corpsEtatId: string | null
}

export type MotifSansTrame = 'texte_deja_present' | 'aucune_correspondance'

export interface Appariement {
  readonly posteId: string
  readonly designation: string
  readonly trameId: string | null
  readonly intituleTrame: string | null
  /** De 0 à 1. Zéro quand rien ne correspond. */
  readonly score: number
  /**
   * Vrai quand la correspondance est franche. L'écran coche ces lignes
   * d'entrée ; les autres attendent un regard.
   */
  readonly sur: boolean
  readonly motif?: MotifSansTrame
}

/**
 * En deçà, la ressemblance tient du hasard : deux désignations de bâtiment
 * partagent toujours quelques mots. On préfère ne rien proposer.
 */
export const SEUIL_PROPOSITION = 0.34

/** Au-delà, la correspondance est franche et la ligne est cochée d'entrée. */
export const SEUIL_CERTITUDE = 0.6

/**
 * Mots trop fréquents pour distinguer quoi que ce soit dans un bordereau.
 * Les garder ferait ressembler « Fourniture et pose de carrelage » à
 * « Fourniture et pose de faïence ».
 */
const MOTS_VIDES = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux',
  'et', 'ou', 'en', 'dans', 'sur', 'sous', 'pour', 'par', 'avec', 'sans',
  'ce', 'cet', 'cette', 'ces', 'son', 'sa', 'ses', 'leur', 'leurs',
  'est', 'sont', 'toute', 'tout', 'tous', 'compris', 'comprise', 'y',
  'fourniture', 'pose', 'mise', 'oeuvre', 'ouvrage', 'ouvrages', 'travaux',
])

const LONGUEUR_MIN_MOT = 3

/** Réduit un mot à sa forme comparable : sans accent, sans pluriel évident. */
function normaliserMot(mot: string): string {
  const sansAccent = mot
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  // Pluriel simple. On ne fait pas de vraie lemmatisation : sur des désignations
  // de bâtiment, le gain ne vaudrait pas l'imprévisibilité.
  if (sansAccent.length > LONGUEUR_MIN_MOT && /(s|x)$/.test(sansAccent)) {
    return sansAccent.slice(0, -1)
  }
  return sansAccent
}

/** Mots significatifs d'une désignation, dédoublonnés. */
export function motsSignificatifs(texte: string): Set<string> {
  const mots = new Set<string>()
  for (const brut of texte.split(/[^0-9A-Za-zÀ-ÿ]+/)) {
    if (brut === '') continue
    const mot = normaliserMot(brut)
    // Les nombres comptent : « 20 » distingue un voile de 20 d'un voile de 16.
    const estNombre = /^\d+$/.test(mot)
    if (!estNombre && mot.length < LONGUEUR_MIN_MOT) continue
    if (MOTS_VIDES.has(mot)) continue
    mots.add(mot)
  }
  return mots
}

/**
 * Ressemblance entre deux désignations, de 0 à 1 — coefficient de Dice.
 *
 * Symétrique et simple à expliquer : deux fois les mots communs, divisés par le
 * total des mots des deux côtés.
 */
export function ressemblance(a: string, b: string): number {
  const motsA = motsSignificatifs(a)
  const motsB = motsSignificatifs(b)
  if (motsA.size === 0 || motsB.size === 0) return 0

  let communs = 0
  for (const mot of motsA) if (motsB.has(mot)) communs += 1

  return (2 * communs) / (motsA.size + motsB.size)
}

/**
 * Rapproche chaque ouvrage de la trame qui lui ressemble le plus.
 *
 * Les trames retenues sont celles du corps d'état du lot, plus les généralités
 * qui n'en portent aucun. Un ouvrage qui a déjà un texte est laissé tel quel :
 * la génération complète le CCTP, elle ne le réécrit pas.
 */
export function apparierTrames(
  postes: readonly PosteAApparier[],
  trames: readonly TrameCandidate[],
  corpsEtatIdDuLot: string | null,
): Appariement[] {
  const utilisables = trames.filter(
    (trame) => trame.corpsEtatId === null || trame.corpsEtatId === corpsEtatIdDuLot,
  )

  return postes.map((poste) => {
    if (poste.aDejaUnTexte) {
      return {
        posteId: poste.posteId,
        designation: poste.designation,
        trameId: null,
        intituleTrame: null,
        score: 0,
        sur: false,
        motif: 'texte_deja_present' as const,
      }
    }

    let meilleure: TrameCandidate | null = null
    let meilleurScore = 0
    for (const trame of utilisables) {
      const score = ressemblance(poste.designation, trame.intitule)
      if (score > meilleurScore) {
        meilleurScore = score
        meilleure = trame
      }
    }

    if (!meilleure || meilleurScore < SEUIL_PROPOSITION) {
      return {
        posteId: poste.posteId,
        designation: poste.designation,
        trameId: null,
        intituleTrame: null,
        score: 0,
        sur: false,
        motif: 'aucune_correspondance' as const,
      }
    }

    return {
      posteId: poste.posteId,
      designation: poste.designation,
      trameId: meilleure.trameId,
      intituleTrame: meilleure.intitule,
      score: Math.round(meilleurScore * 100) / 100,
      sur: meilleurScore >= SEUIL_CERTITUDE,
    }
  })
}

export interface SyntheseAppariement {
  readonly nbPostes: number
  readonly nbSurs: number
  readonly nbIncertains: number
  readonly nbSansTrame: number
  readonly nbDejaRediges: number
}

export function synthetiserAppariement(
  appariements: readonly Appariement[],
): SyntheseAppariement {
  return {
    nbPostes: appariements.length,
    nbSurs: appariements.filter((a) => a.sur).length,
    nbIncertains: appariements.filter((a) => a.trameId !== null && !a.sur).length,
    nbSansTrame: appariements.filter((a) => a.motif === 'aucune_correspondance').length,
    nbDejaRediges: appariements.filter((a) => a.motif === 'texte_deja_present').length,
  }
}
