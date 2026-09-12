import { Decimal, dec, arrondiCommercial, type EntreeDecimale } from '../money/decimal.js'
import * as Money from '../money/money.js'
import type { Money as MoneyValue } from '../money/money.js'

export interface EntreeSituation {
  /** Montant du marché du lot, avenants acceptés compris. */
  readonly montantMarcheHt: MoneyValue
  /** Avancement cumulé à la fin de la période, en pourcentage. */
  readonly avancementPourcent: EntreeDecimale
  /** Montant cumulé validé à la situation précédente. */
  readonly cumulPrecedentHt: MoneyValue
}

export interface ResultatSituation {
  readonly montantCumuleHt: MoneyValue
  readonly montantPeriodeHt: MoneyValue
}

/**
 * Situation de travaux saisie en pourcentage d'avancement.
 * Le cumul est calculé sur le marché, jamais par addition des périodes :
 * ainsi la somme des périodes retombe toujours exactement sur le cumul final.
 */
export function calculerSituation(entree: EntreeSituation): ResultatSituation {
  const avancement = dec(entree.avancementPourcent)
  if (avancement.isNegative() || avancement.greaterThan(100)) {
    throw new RangeError(`Avancement hors bornes : ${avancement.toString()} %. Attendu entre 0 et 100.`)
  }
  const montantCumuleHt = Money.depuisEuros(
    Money.versEuros(entree.montantMarcheHt).mul(avancement).div(100),
  )
  return {
    montantCumuleHt,
    montantPeriodeHt: Money.soustraire(montantCumuleHt, entree.cumulPrecedentHt),
  }
}

/** Situation saisie en montant plutôt qu'en pourcentage. */
export function situationDepuisMontant(
  montantCumuleHt: MoneyValue,
  cumulPrecedentHt: MoneyValue,
): ResultatSituation {
  return {
    montantCumuleHt,
    montantPeriodeHt: Money.soustraire(montantCumuleHt, cumulPrecedentHt),
  }
}

/** Avancement correspondant à un montant cumulé. Null si le marché est nul. */
export function avancementDepuisMontant(
  montantCumuleHt: MoneyValue,
  montantMarcheHt: MoneyValue,
): Decimal | null {
  if (Money.estZero(montantMarcheHt)) return null
  return arrondiCommercial(
    Money.versEuros(montantCumuleHt).div(Money.versEuros(montantMarcheHt)).mul(100),
    2,
  )
}

/** Marché actuel : marché initial plus les avenants acceptés, moins-values comprises. */
export function marcheActuel(
  marcheInitialHt: MoneyValue,
  avenantsAcceptesHt: readonly MoneyValue[],
): MoneyValue {
  return Money.ajouter(marcheInitialHt, Money.somme(avenantsAcceptesHt))
}

export interface EntreeTableauFinancier {
  readonly marcheInitialHt: MoneyValue
  readonly avenantsAcceptesHt: readonly MoneyValue[]
  readonly cumulRealiseHt: MoneyValue
  readonly estimatifInitialHt: MoneyValue
  /** Seuil de dérive, en pourcentage, paramétrable par l'utilisateur. */
  readonly seuilDerivePourcent: EntreeDecimale
}

export interface TableauFinancier {
  readonly marcheInitialHt: MoneyValue
  readonly avenantsCumulesHt: MoneyValue
  readonly marcheActuelHt: MoneyValue
  readonly travauxRealisesHt: MoneyValue
  readonly resteARealiserHt: MoneyValue
  readonly ecartVsEstimatifHt: MoneyValue
  readonly ecartVsEstimatifPourcent: Decimal | null
  readonly avancementPourcent: Decimal | null
  readonly deriveDetectee: boolean
}

/** Tableau de bord financier de l'opération — spec §5.6. */
export function tableauFinancier(entree: EntreeTableauFinancier): TableauFinancier {
  const avenantsCumulesHt = Money.somme(entree.avenantsAcceptesHt)
  const marcheActuelHt = Money.ajouter(entree.marcheInitialHt, avenantsCumulesHt)
  const resteARealiserHt = Money.soustraire(marcheActuelHt, entree.cumulRealiseHt)
  const ecartVsEstimatifHt = Money.soustraire(marcheActuelHt, entree.estimatifInitialHt)

  const ecartVsEstimatifPourcent = Money.estZero(entree.estimatifInitialHt)
    ? null
    : arrondiCommercial(
        Money.versEuros(ecartVsEstimatifHt).div(Money.versEuros(entree.estimatifInitialHt)).mul(100),
        2,
      )

  const seuil = dec(entree.seuilDerivePourcent)
  if (seuil.isNegative()) {
    throw new RangeError(`Seuil de dérive négatif : ${seuil.toString()}`)
  }

  return {
    marcheInitialHt: entree.marcheInitialHt,
    avenantsCumulesHt,
    marcheActuelHt,
    travauxRealisesHt: entree.cumulRealiseHt,
    resteARealiserHt,
    ecartVsEstimatifHt,
    ecartVsEstimatifPourcent,
    avancementPourcent: avancementDepuisMontant(entree.cumulRealiseHt, marcheActuelHt),
    deriveDetectee:
      ecartVsEstimatifPourcent !== null && ecartVsEstimatifPourcent.abs().greaterThan(seuil),
  }
}
