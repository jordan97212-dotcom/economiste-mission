import { Decimal, dec, arrondiCommercial, type EntreeDecimale } from './decimal.js'

declare const MARQUE_PU: unique symbol

/**
 * Un prix unitaire, en dix-millièmes d'euro (1 unité = 0,0001 €).
 *
 * Pourquoi une échelle différente des montants : la spec autorise un prix
 * unitaire à plus de deux décimales (visserie, quincaillerie, prix au kilo).
 * Un montant, lui, est toujours au centime. Les deux types sont distincts
 * pour qu'aucun calcul ne puisse confondre les deux échelles.
 */
export type PrixUnitaire = bigint & { readonly [MARQUE_PU]: true }

/** Nombre de décimales représentables par l'échelle de stockage. */
export const DECIMALES_STOCKAGE = 4
const FACTEUR = 10_000n

/** Précisions d'affichage et de calcul autorisées pour une mission. */
export const PRECISION_MIN = 2
export const PRECISION_MAX = 4

function marquer(valeur: bigint): PrixUnitaire {
  return valeur as PrixUnitaire
}

export const PU_ZERO: PrixUnitaire = marquer(0n)

export function verifierPrecision(precision: number): void {
  if (!Number.isInteger(precision) || precision < PRECISION_MIN || precision > PRECISION_MAX) {
    throw new RangeError(
      `Précision de prix unitaire invalide : ${precision}. Attendu un entier entre ${PRECISION_MIN} et ${PRECISION_MAX}.`,
    )
  }
}

/** Construit un prix unitaire depuis une valeur en euros, arrondie à la précision donnée. */
export function depuisEuros(euros: EntreeDecimale, precision = DECIMALES_STOCKAGE): PrixUnitaire {
  if (!Number.isInteger(precision) || precision < 0 || precision > DECIMALES_STOCKAGE) {
    throw new RangeError(`Précision hors de l'échelle de stockage : ${precision}`)
  }
  const arrondi = arrondiCommercial(euros, precision)
  return marquer(BigInt(arrondi.mul(FACTEUR.toString()).toFixed(0)))
}

/** Construit un prix unitaire depuis sa valeur brute de stockage. */
export function depuisStockage(valeur: bigint | number): PrixUnitaire {
  if (typeof valeur === 'number') {
    if (!Number.isSafeInteger(valeur)) {
      throw new RangeError(`Valeur de stockage non entière : ${valeur}`)
    }
    return marquer(BigInt(valeur))
  }
  return marquer(valeur)
}

/** Valeur exacte du prix unitaire, en euros. */
export function versEuros(pu: PrixUnitaire): Decimal {
  return dec(pu).div(FACTEUR.toString())
}

export function comparer(a: PrixUnitaire, b: PrixUnitaire): -1 | 0 | 1 {
  if ((a as bigint) < (b as bigint)) return -1
  if ((a as bigint) > (b as bigint)) return 1
  return 0
}

export function estZero(pu: PrixUnitaire): boolean {
  return (pu as bigint) === 0n
}

const ESPACE_FINE_INSECABLE = '\u202F'

/** Formatage français à la précision demandée. */
export function formater(pu: PrixUnitaire, precision = PRECISION_MIN, options: { symbole?: boolean } = {}): string {
  const { symbole = true } = options
  const texte = arrondiCommercial(versEuros(pu), precision).toFixed(precision)
  const negatif = texte.startsWith('-')
  const sansSigne = negatif ? texte.slice(1) : texte
  const [entier = '0', decimales = ''] = sansSigne.split('.')
  const groupes = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE_INSECABLE)
  const corps = `${negatif ? '-' : ''}${groupes}${decimales ? `,${decimales}` : ''}`
  return symbole ? `${corps}${ESPACE_FINE_INSECABLE}€` : corps
}
