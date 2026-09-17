import { Decimal, arrondiCommercial } from '../money/decimal'
import * as Money from '../money/money'
import type { Money as MoneyValue } from '../money/money'

export interface Ecart {
  /** Écart en euros : positif si l'offre dépasse l'estimatif. */
  readonly montantHt: MoneyValue
  /** Écart en pourcentage, ou null quand l'estimatif est nul. */
  readonly pourcent: Decimal | null
}

/**
 * Écart d'une offre vis-à-vis de l'estimatif.
 * Le pourcentage est null quand l'estimatif vaut zéro : mieux vaut l'absence
 * de chiffre qu'une division par zéro maquillée en infini.
 */
export function ecartVsEstimatif(offreHt: MoneyValue, estimatifHt: MoneyValue): Ecart {
  const montantHt = Money.soustraire(offreHt, estimatifHt)
  if (Money.estZero(estimatifHt)) return { montantHt, pourcent: null }
  const pourcent = arrondiCommercial(
    Money.versEuros(montantHt).div(Money.versEuros(estimatifHt)).mul(100),
    2,
  )
  return { montantHt, pourcent }
}

/**
 * Famille d'offres comparables entre elles.
 *
 * `cle` sert au regroupement, `libelle` au message : « inférieure de 20 % à la
 * médiane des offres de base » dit quelque chose, « à la médiane des offres
 * reçues » beaucoup moins quand ces offres ne répondent pas au même dossier.
 */
export interface FamilleOffres {
  readonly cle: string
  readonly libelle: string
}

export interface OffreComparee<T = unknown> {
  readonly reference: T
  readonly montantHt: MoneyValue
  /**
   * Famille à laquelle comparer cette offre. La médiane se calcule par famille :
   * une variante est moins chère par construction — c'est sa raison d'être — et
   * la mêler aux offres de base tirerait leur médiane vers le bas, jusqu'à
   * masquer une base réellement sous-évaluée.
   *
   * Absente, toutes les offres forment une seule famille : l'ancien
   * comportement, conservé pour les appels qui n'ont rien à distinguer.
   */
  readonly famille?: FamilleOffres
}

export type MotifAnomalie = 'basse_vs_estimatif' | 'basse_vs_offres' | 'haute_vs_estimatif'

export interface Anomalie<T = unknown> {
  readonly reference: T
  readonly motif: MotifAnomalie
  readonly ecart: Ecart
  readonly message: string
}

export interface SeuilsAnomalie {
  /** Sous ce pourcentage d'écart négatif vis-à-vis de l'estimatif, on signale. */
  readonly baisseVsEstimatif?: number
  /** Au-dessus de ce pourcentage d'écart positif, on signale. */
  readonly hausseVsEstimatif?: number
  /** Sous ce pourcentage d'écart vis-à-vis de la médiane des offres, on signale. */
  readonly baisseVsMediane?: number
}

const SEUILS_PAR_DEFAUT: Required<SeuilsAnomalie> = {
  baisseVsEstimatif: 20,
  hausseVsEstimatif: 25,
  baisseVsMediane: 20,
}

/** Médiane exacte d'une série de montants. Moyenne des deux centraux si pair. */
export function medianne(montants: readonly MoneyValue[]): MoneyValue | null {
  if (montants.length === 0) return null
  const tries = [...montants].sort(Money.comparer)
  const milieu = Math.floor(tries.length / 2)
  if (tries.length % 2 === 1) return tries[milieu] as MoneyValue
  const bas = tries[milieu - 1] as MoneyValue
  const haut = tries[milieu] as MoneyValue
  return Money.depuisEuros(Money.versEuros(bas).plus(Money.versEuros(haut)).div(2))
}

/**
 * Repère les offres à vérifier manuellement. Une offre anormalement basse est
 * un risque de dérive en chantier : on la signale, on ne l'écarte jamais seul.
 */
export function detecterAnomalies<T>(
  offres: readonly OffreComparee<T>[],
  estimatifHt: MoneyValue,
  seuils: SeuilsAnomalie = {},
): Anomalie<T>[] {
  const s = { ...SEUILS_PAR_DEFAUT, ...seuils }
  const anomalies: Anomalie<T>[] = []

  // Une médiane par famille, et son effectif : trois offres restent le minimum
  // pour qu'une médiane dise quelque chose, et ce minimum s'apprécie famille
  // par famille.
  const parFamille = new Map<string, OffreComparee<T>[]>()
  for (const offre of offres) {
    const cle = offre.famille?.cle ?? ''
    const liste = parFamille.get(cle) ?? []
    liste.push(offre)
    parFamille.set(cle, liste)
  }
  const medianes = new Map(
    [...parFamille].map(([cle, liste]) => [
      cle,
      { valeur: medianne(liste.map((o) => o.montantHt)), effectif: liste.length },
    ]),
  )

  for (const offre of offres) {
    const ecart = ecartVsEstimatif(offre.montantHt, estimatifHt)

    if (ecart.pourcent !== null && ecart.pourcent.lessThanOrEqualTo(-s.baisseVsEstimatif)) {
      anomalies.push({
        reference: offre.reference,
        motif: 'basse_vs_estimatif',
        ecart,
        message: `Offre inférieure de ${ecart.pourcent.abs().toFixed(2)} % à l'estimatif. À vérifier avant analyse.`,
      })
    } else if (ecart.pourcent !== null && ecart.pourcent.greaterThanOrEqualTo(s.hausseVsEstimatif)) {
      anomalies.push({
        reference: offre.reference,
        motif: 'haute_vs_estimatif',
        ecart,
        message: `Offre supérieure de ${ecart.pourcent.toFixed(2)} % à l'estimatif.`,
      })
    }

    const famille = medianes.get(offre.famille?.cle ?? '')
    const mediane = famille?.valeur ?? null

    if (mediane !== null && (famille?.effectif ?? 0) >= 3 && !Money.estZero(mediane)) {
      const ecartMediane = arrondiCommercial(
        Money.versEuros(Money.soustraire(offre.montantHt, mediane))
          .div(Money.versEuros(mediane))
          .mul(100),
        2,
      )
      if (ecartMediane.lessThanOrEqualTo(-s.baisseVsMediane)) {
        anomalies.push({
          reference: offre.reference,
          motif: 'basse_vs_offres',
          ecart,
          message: `Offre inférieure de ${ecartMediane.abs().toFixed(2)} % à la médiane des ${offre.famille?.libelle ?? 'offres reçues'}.`,
        })
      }
    }
  }

  return anomalies
}

/** Offre la moins-disante. Null si aucune offre. */
export function moinsDisante<T>(offres: readonly OffreComparee<T>[]): OffreComparee<T> | null {
  if (offres.length === 0) return null
  return offres.reduce((min, o) => (Money.comparer(o.montantHt, min.montantHt) < 0 ? o : min))
}

