import { Decimal, dec, type EntreeDecimale } from '../money/decimal.js'

/** Niveau du chiffrage d'où provient le coefficient effectivement appliqué. */
export type OrigineCoefficient = 'ligne' | 'lot' | 'mission'

export interface CoefficientEffectif {
  readonly valeur: Decimal
  readonly origine: OrigineCoefficient
}

export interface CascadeCoefficient {
  /** Coefficient de la mission. Obligatoire : c'est la valeur par défaut héritée. */
  readonly mission: EntreeDecimale
  /** Surcharge au niveau du lot. Null ou absent = hérite de la mission. */
  readonly lot?: EntreeDecimale | null | undefined
  /** Surcharge au niveau de la ligne. Null ou absent = hérite du lot. */
  readonly ligne?: EntreeDecimale | null | undefined
}

export const COEFFICIENT_MAX = 10

function verifier(valeur: Decimal, niveau: OrigineCoefficient): Decimal {
  if (valeur.lessThanOrEqualTo(0)) {
    throw new RangeError(`Coefficient ${niveau} invalide : ${valeur.toString()}. Il doit être strictement positif.`)
  }
  if (valeur.greaterThan(COEFFICIENT_MAX)) {
    throw new RangeError(`Coefficient ${niveau} invalide : ${valeur.toString()}. Le plafond est ${COEFFICIENT_MAX}.`)
  }
  return valeur
}

/**
 * Résout le coefficient d'ajustement local applicable à une ligne.
 * Cascade mission -> lot -> ligne, le niveau le plus fin l'emportant.
 * L'origine est retournée pour que l'interface puisse dire d'où vient la valeur.
 */
export function resoudreCoefficient(cascade: CascadeCoefficient): CoefficientEffectif {
  if (cascade.ligne !== null && cascade.ligne !== undefined) {
    return { valeur: verifier(dec(cascade.ligne), 'ligne'), origine: 'ligne' }
  }
  if (cascade.lot !== null && cascade.lot !== undefined) {
    return { valeur: verifier(dec(cascade.lot), 'lot'), origine: 'lot' }
  }
  return { valeur: verifier(dec(cascade.mission), 'mission'), origine: 'mission' }
}
