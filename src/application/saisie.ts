import { dec, arrondiCommercial } from '../domain/money/decimal'

/**
 * Lecture des valeurs telles qu'un tableur français les produit.
 * Partagé par le collage dans la grille, l'import de DPGF et l'import de la
 * base de prix : une seule façon de lire un nombre, donc un seul endroit à
 * corriger si un format exotique apparaît.
 */

const UNITES_CONNUES: Record<string, string> = {
  m2: 'M2',
  'm²': 'M2',
  m3: 'M3',
  'm³': 'M3',
  ml: 'ML',
  m: 'ML',
  mL: 'ML',
  u: 'U',
  un: 'U',
  unite: 'U',
  'unité': 'U',
  ens: 'ENS',
  'ens.': 'ENS',
  ensemble: 'ENS',
  f: 'FORFAIT',
  ft: 'FORFAIT',
  fft: 'FORFAIT',
  forfait: 'FORFAIT',
  kg: 'KG',
  t: 'T',
  tonne: 'T',
  h: 'H',
  heure: 'H',
  j: 'J',
  jour: 'J',
}

export function normaliserUnite(brut: string): string | null {
  const cle = brut.trim().toLowerCase()
  if (cle === '') return null
  return UNITES_CONNUES[cle] ?? null
}

/**
 * Lit un nombre avec espaces de milliers, espaces fines insécables, virgule
 * décimale et symbole monétaire éventuel. Retourne null si ce n'est pas un
 * nombre, plutôt qu'un zéro trompeur.
 */
export function lireNombre(brut: string): string | null {
  const nettoye = brut
    .replace(/[\s  ]/g, '')
    .replace(/[€%]/g, '')
    .replace(',', '.')
    .trim()
  if (nettoye === '') return null
  if (!/^-?\d*\.?\d+$/.test(nettoye)) return null
  return nettoye
}

/** Lit une quantité et l'arrondit au millième. */
export function lireQuantite(brut: string): string | null {
  const nombre = lireNombre(brut)
  if (nombre === null) return null
  const valeur = dec(nombre)
  if (valeur.isNegative()) return null
  return arrondiCommercial(valeur, 3).toString()
}

/** Lit un coefficient, borné comme dans le domaine. */
export function lireCoefficient(brut: string): string | null {
  const nombre = lireNombre(brut)
  if (nombre === null) return null
  const valeur = dec(nombre)
  if (valeur.lessThanOrEqualTo(0) || valeur.greaterThan(10)) return null
  return arrondiCommercial(valeur, 4).toString()
}

/** Lit une date au format français ou ISO. */
export function lireDate(brut: string): Date | null {
  const texte = brut.trim()
  if (texte === '') return null

  const francais = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(texte)
  if (francais) {
    const [, jour, mois, annee] = francais
    const a = Number(annee)
    const date = new Date(Date.UTC(a < 100 ? 2000 + a : a, Number(mois) - 1, Number(jour)))
    return Number.isNaN(date.getTime()) ? null : date
  }

  const date = new Date(texte)
  return Number.isNaN(date.getTime()) ? null : date
}
