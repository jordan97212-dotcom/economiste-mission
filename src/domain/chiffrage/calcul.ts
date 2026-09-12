import { Decimal, dec, arrondiCommercial, type EntreeDecimale } from '../money/decimal'
import * as Money from '../money/money'
import type { Money as MoneyValue } from '../money/money'
import * as PU from '../money/prix-unitaire'
import type { PrixUnitaire } from '../money/prix-unitaire'
import { resoudreCoefficient, type CascadeCoefficient, type CoefficientEffectif } from './coefficient'

export interface EntreeOuvrage {
  readonly quantite?: EntreeDecimale | null
  readonly prixUnitaireHtBase?: PrixUnitaire | null
  readonly coefficient: CascadeCoefficient
  /** Précision d'affichage et de calcul du prix unitaire, réglée par mission. */
  readonly precisionPu: number
}

export interface ResultatOuvrage {
  readonly coefficient: CoefficientEffectif
  readonly prixUnitaireHtFinal: PrixUnitaire
  readonly montantHt: MoneyValue
}

/**
 * Chaîne de calcul d'une ligne de DPGF.
 *
 *   pu_final = arrondi( pu_base × coefficient, precisionPu )
 *   montant  = arrondi( quantite × pu_final,   2 )
 *
 * Le prix unitaire est arrondi AVANT la multiplication, parce que le DPGF
 * imprimé est le document contractuel : l'entreprise recalcule quantité fois
 * prix affiché, et le total de l'application doit tomber sur le sien.
 */
export function calculerOuvrage(entree: EntreeOuvrage): ResultatOuvrage {
  PU.verifierPrecision(entree.precisionPu)
  const coefficient = resoudreCoefficient(entree.coefficient)

  const base = entree.prixUnitaireHtBase ?? PU.PU_ZERO
  const prixUnitaireHtFinal = PU.depuisEuros(
    PU.versEuros(base).mul(coefficient.valeur),
    entree.precisionPu,
  )

  const quantite = entree.quantite === null || entree.quantite === undefined ? null : dec(entree.quantite)
  if (quantite !== null && quantite.isNegative()) {
    throw new RangeError(`Quantité négative : ${quantite.toString()}`)
  }

  const montantHt =
    quantite === null
      ? Money.ZERO
      : Money.depuisEuros(quantite.mul(PU.versEuros(prixUnitaireHtFinal)))

  return { coefficient, prixUnitaireHtFinal, montantHt }
}

/** Un nœud de l'arborescence lot -> sous-lot -> ouvrage. */
export type NoeudChiffrage =
  | { readonly type: 'OUVRAGE'; readonly montantHt: MoneyValue }
  | { readonly type: 'SOUS_LOT'; readonly enfants: readonly NoeudChiffrage[] }

/** Total exact d'un arbre de postes. Aucun ré-arrondi à chaque niveau. */
export function totaliserArbre(noeuds: readonly NoeudChiffrage[]): MoneyValue {
  let total = Money.ZERO
  for (const noeud of noeuds) {
    total = Money.ajouter(
      total,
      noeud.type === 'OUVRAGE' ? noeud.montantHt : totaliserArbre(noeud.enfants),
    )
  }
  return total
}

/** Total d'un lot : somme exacte des montants de lignes. */
export function totalLot(montants: readonly MoneyValue[]): MoneyValue {
  return Money.somme(montants)
}

/** Total tous corps d'état : somme exacte des totaux de lots. */
export function totalTce(totauxLots: readonly MoneyValue[]): MoneyValue {
  return Money.somme(totauxLots)
}

/**
 * Ratio en euros par mètre carré. Retourne null quand la surface est absente
 * ou nulle, plutôt qu'un chiffre faussement précis.
 */
export function ratioEuroParM2(total: MoneyValue, surface: EntreeDecimale | null | undefined): Decimal | null {
  if (surface === null || surface === undefined) return null
  const s = dec(surface)
  if (s.isZero() || s.isNegative()) return null
  return arrondiCommercial(Money.versEuros(total).div(s), 2)
}

export interface RecapitulatifLot {
  readonly lotId: string
  readonly numero: string
  readonly intitule: string
  readonly montantHt: MoneyValue
  readonly partPourcent: Decimal | null
}

export interface Recapitulatif {
  readonly lots: readonly RecapitulatifLot[]
  readonly totalTceHt: MoneyValue
  readonly ratioEuroParM2: Decimal | null
}

/** Récapitulatif de chiffrage : montant par lot, total TCE, part et ratio. */
export function recapituler(
  lots: readonly { lotId: string; numero: string; intitule: string; montantHt: MoneyValue }[],
  surface: EntreeDecimale | null | undefined,
): Recapitulatif {
  const totalTceHt = totalTce(lots.map((l) => l.montantHt))
  const totalEuros = Money.versEuros(totalTceHt)
  return {
    lots: lots.map((l) => ({
      ...l,
      partPourcent: totalEuros.isZero()
        ? null
        : arrondiCommercial(Money.versEuros(l.montantHt).div(totalEuros).mul(100), 2),
    })),
    totalTceHt,
    ratioEuroParM2: ratioEuroParM2(totalTceHt, surface),
  }
}
