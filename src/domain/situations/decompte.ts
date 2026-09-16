import { arrondiCommercial, dec, type Decimal, type EntreeDecimale } from '../money/decimal'
import * as Money from '../money/money'
import type { Money as MoneyValue } from '../money/money'

/**
 * Décompte d'une situation de travaux — point 10.6 de l'architecture.
 *
 * Une situation ne se paie pas telle quelle : on en retire la retenue de
 * garantie, le remboursement de l'avance forfaitaire et la quote-part du
 * compte prorata. En marché public, un décompte sans ces trois lignes n'est
 * pas exploitable.
 *
 * Parti pris : les trois montants sont saisis par l'économiste, pas déduits
 * de règles codées en dur. Les taux varient selon le marché, le CCAP et les
 * négociations ; une règle figée dans l'application se tromperait souvent et
 * silencieusement. `retenueSuggeree` propose une valeur à partir d'un taux,
 * mais ce n'est qu'un brouillon que la saisie remplace.
 *
 * Fonction pure : aucune I/O.
 */

export interface EntreeDecompte {
  readonly montantPeriodeHt: MoneyValue
  readonly retenueGarantieHt: MoneyValue
  readonly avanceRembourseeHt: MoneyValue
  readonly compteProrataHt: MoneyValue
}

export interface Decompte {
  readonly montantPeriodeHt: MoneyValue
  readonly deductionsHt: MoneyValue
  readonly netAPayerHt: MoneyValue
}

/**
 * Le net à payer de la période. Il peut être négatif — une situation de
 * régularisation en moins-value existe, et la masquer serait pire que la
 * montrer.
 */
export function decompterSituation(entree: EntreeDecompte): Decompte {
  const deductionsHt = Money.somme([
    entree.retenueGarantieHt,
    entree.avanceRembourseeHt,
    entree.compteProrataHt,
  ])

  return {
    montantPeriodeHt: entree.montantPeriodeHt,
    deductionsHt,
    netAPayerHt: Money.soustraire(entree.montantPeriodeHt, deductionsHt),
  }
}

/**
 * Retenue suggérée pour un montant, à un taux donné. Un brouillon, jamais une
 * valeur imposée : le CCAP fait foi, pas l'application.
 */
export function retenueSuggeree(montantHt: MoneyValue, tauxPourcent: EntreeDecimale): MoneyValue {
  const taux = dec(tauxPourcent)
  if (taux.isNegative() || taux.greaterThan(100)) {
    throw new RangeError(`Taux de retenue hors bornes : ${taux.toString()} %. Attendu entre 0 et 100.`)
  }
  return Money.depuisEuros(Money.versEuros(montantHt).mul(taux).div(100))
}

export interface LigneSituation {
  readonly montantPeriodeHt: MoneyValue
  readonly retenueGarantieHt: MoneyValue
  readonly avanceRembourseeHt: MoneyValue
  readonly compteProrataHt: MoneyValue
}

export interface CumulDecompte {
  readonly travauxRealisesHt: MoneyValue
  readonly retenueGarantieCumuleeHt: MoneyValue
  readonly avanceRembourseeCumuleeHt: MoneyValue
  readonly compteProrataCumuleHt: MoneyValue
  readonly netPayeCumuleHt: MoneyValue
}

/**
 * Cumul de toutes les situations d'un lot. La retenue cumulée est ce qui
 * devra être restitué à la levée des réserves : c'est le chiffre qu'on
 * cherche au moment de la clôture.
 */
export function cumulerSituations(situations: readonly LigneSituation[]): CumulDecompte {
  const travauxRealisesHt = Money.somme(situations.map((s) => s.montantPeriodeHt))
  const retenueGarantieCumuleeHt = Money.somme(situations.map((s) => s.retenueGarantieHt))
  const avanceRembourseeCumuleeHt = Money.somme(situations.map((s) => s.avanceRembourseeHt))
  const compteProrataCumuleHt = Money.somme(situations.map((s) => s.compteProrataHt))

  return {
    travauxRealisesHt,
    retenueGarantieCumuleeHt,
    avanceRembourseeCumuleeHt,
    compteProrataCumuleHt,
    netPayeCumuleHt: Money.soustraire(
      travauxRealisesHt,
      Money.somme([retenueGarantieCumuleeHt, avanceRembourseeCumuleeHt, compteProrataCumuleHt]),
    ),
  }
}

/**
 * Part de la retenue de garantie sur le marché, en pourcentage. Sert à
 * vérifier d'un coup d'œil qu'on ne dépasse pas le taux du CCAP.
 */
export function tauxRetenueConstate(
  retenueCumuleeHt: MoneyValue,
  marcheHt: MoneyValue,
): Decimal | null {
  if (Money.estZero(marcheHt)) return null
  return arrondiCommercial(
    Money.versEuros(retenueCumuleeHt).div(Money.versEuros(marcheHt)).mul(100),
    2,
  )
}
