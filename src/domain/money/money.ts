import { Decimal, dec, arrondiCommercial, type EntreeDecimale } from './decimal.js'

declare const MARQUE_MONEY: unique symbol

/**
 * Un montant, en centimes entiers. Jamais un flottant.
 * Le type est brandé : on ne peut pas additionner un montant avec un entier
 * quelconque sans passer par les opérations ci-dessous.
 */
export type Money = bigint & { readonly [MARQUE_MONEY]: true }

const CENTIMES_PAR_EURO = 100n

function marquer(centimes: bigint): Money {
  return centimes as Money
}

export const ZERO: Money = marquer(0n)

/** Construit un montant depuis un nombre entier de centimes. */
export function depuisCentimes(centimes: bigint | number | string): Money {
  if (typeof centimes === 'bigint') return marquer(centimes)
  if (typeof centimes === 'number') {
    if (!Number.isSafeInteger(centimes)) {
      throw new RangeError(`Centimes non entiers ou hors plage sûre : ${centimes}`)
    }
    return marquer(BigInt(centimes))
  }
  if (!/^-?\d+$/.test(centimes)) {
    throw new RangeError(`Chaîne de centimes invalide : ${centimes}`)
  }
  return marquer(BigInt(centimes))
}

/** Construit un montant depuis une valeur en euros, arrondie au centime. */
export function depuisEuros(euros: EntreeDecimale): Money {
  const centimes = arrondiCommercial(dec(euros).mul(100), 0)
  return marquer(BigInt(centimes.toFixed(0)))
}

/** Valeur exacte du montant, en euros. */
export function versEuros(montant: Money): Decimal {
  return dec(montant).div(100)
}

export function ajouter(a: Money, b: Money): Money {
  return marquer((a as bigint) + (b as bigint))
}

export function soustraire(a: Money, b: Money): Money {
  return marquer((a as bigint) - (b as bigint))
}

export function negation(a: Money): Money {
  return marquer(-(a as bigint))
}

/** Somme exacte : aucun ré-arrondi intermédiaire. */
export function somme(montants: readonly Money[]): Money {
  let total = 0n
  for (const m of montants) total += m as bigint
  return marquer(total)
}

/** Multiplie un montant par un décimal, puis arrondit au centime. */
export function multiplier(montant: Money, facteur: EntreeDecimale): Money {
  return depuisEuros(versEuros(montant).mul(dec(facteur)))
}

export function comparer(a: Money, b: Money): -1 | 0 | 1 {
  if ((a as bigint) < (b as bigint)) return -1
  if ((a as bigint) > (b as bigint)) return 1
  return 0
}

export function estZero(m: Money): boolean {
  return (m as bigint) === 0n
}

export function estNegatif(m: Money): boolean {
  return (m as bigint) < 0n
}

export function valeurAbsolue(m: Money): Money {
  return (m as bigint) < 0n ? negation(m) : m
}

const ESPACE_FINE_INSECABLE = '\u202F'

/**
 * Formatage français : séparateur de milliers en espace fine insécable,
 * virgule décimale, deux décimales, symbole euro. Construit depuis la
 * représentation exacte, jamais depuis un flottant.
 */
export function formater(montant: Money, options: { symbole?: boolean } = {}): string {
  const { symbole = true } = options
  const negatif = (montant as bigint) < 0n
  const absolu = negatif ? -(montant as bigint) : (montant as bigint)
  const entier = (absolu / CENTIMES_PAR_EURO).toString()
  const centimes = (absolu % CENTIMES_PAR_EURO).toString().padStart(2, '0')
  const groupes = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE_INSECABLE)
  const corps = `${negatif ? '-' : ''}${groupes},${centimes}`
  return symbole ? `${corps}${ESPACE_FINE_INSECABLE}€` : corps
}
