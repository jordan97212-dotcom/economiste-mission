import Decimal from 'decimal.js'

// Arrondi commercial par défaut : au plus proche, et à l'équidistance on s'éloigne
// de zéro (0,005 -> 0,01 ; -0,005 -> -0,01). Ce n'est PAS l'arrondi bancaire.
// Précision large pour que les produits intermédiaires ne perdent jamais de chiffres.
Decimal.set({
  precision: 34,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40,
})

export { Decimal }
export type { Decimal as DecimalType } from 'decimal.js'

/** Valeur acceptée en entrée partout où le domaine attend un décimal exact. */
export type EntreeDecimale = Decimal | string | number | bigint

export function dec(valeur: EntreeDecimale): Decimal {
  if (valeur instanceof Decimal) return valeur
  if (typeof valeur === 'bigint') return new Decimal(valeur.toString())
  if (typeof valeur === 'number') {
    if (!Number.isFinite(valeur)) {
      throw new RangeError(`Valeur numérique non finie : ${String(valeur)}`)
    }
    // On passe par la représentation décimale courte du nombre, pas par ses bits.
    return new Decimal(valeur.toString())
  }
  const d = new Decimal(valeur)
  if (!d.isFinite()) throw new RangeError(`Valeur décimale non finie : ${valeur}`)
  return d
}

/** Arrondi commercial à n décimales. */
export function arrondiCommercial(valeur: EntreeDecimale, decimales: number): Decimal {
  if (!Number.isInteger(decimales) || decimales < 0 || decimales > 12) {
    throw new RangeError(`Nombre de décimales invalide : ${decimales}`)
  }
  return dec(valeur).toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP)
}
