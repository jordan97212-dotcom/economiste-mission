import { arrondiCommercial, type Decimal } from '../money/decimal'
import * as Money from '../money/money'
import type { Money as MoneyValue } from '../money/money'
import { cumulerSituations, type LigneSituation } from '../situations/decompte'

/**
 * Décompte général définitif — SPEC_APP_ECONOMISTE.md §5.7.
 *
 * Ce que l'application sait établir, et ce qu'elle n'établit pas — il faut le
 * dire ici plutôt que de le laisser croire. Le décompte produit rassemble ce
 * qui est dans l'application : marché, avenants acceptés, travaux exécutés,
 * déductions cumulées et retenue à restituer.
 *
 * Il ne contient ni révision de prix, ni intérêts moratoires, ni pénalités de
 * retard : aucun n'est modélisé (point 10.7 pour la révision), et les
 * inventer produirait un document faux sur un sujet contractuel. Le document
 * généré le dit en toutes lettres et reste un projet de décompte, à compléter
 * avant signature.
 *
 * Fonction pure : aucune I/O.
 */

export interface EntreeDecompteGeneral {
  readonly marcheInitialHt: MoneyValue
  readonly avenantsAcceptesHt: MoneyValue
  readonly situations: readonly LigneSituation[]
}

export interface DecompteGeneral {
  readonly marcheInitialHt: MoneyValue
  readonly avenantsAcceptesHt: MoneyValue
  readonly marcheActuelHt: MoneyValue
  readonly travauxExecutesHt: MoneyValue
  /** Part du marché non exécutée. Négative si les travaux l'ont dépassé. */
  readonly soldeNonExecuteHt: MoneyValue
  readonly retenueGarantieARestituerHt: MoneyValue
  readonly avanceRembourseeHt: MoneyValue
  readonly compteProrataHt: MoneyValue
  /** Somme des nets versés à l'entreprise au fil des situations. */
  readonly netRegleHt: MoneyValue
  readonly executePourcent: Decimal | null
  readonly nbSituations: number
}

export function etablirDecompteGeneral(entree: EntreeDecompteGeneral): DecompteGeneral {
  const marcheActuelHt = Money.ajouter(entree.marcheInitialHt, entree.avenantsAcceptesHt)
  const cumul = cumulerSituations(entree.situations)

  const executePourcent = Money.estZero(marcheActuelHt)
    ? null
    : arrondiCommercial(
        Money.versEuros(cumul.travauxRealisesHt).div(Money.versEuros(marcheActuelHt)).mul(100),
        2,
      )

  return {
    marcheInitialHt: entree.marcheInitialHt,
    avenantsAcceptesHt: entree.avenantsAcceptesHt,
    marcheActuelHt,
    travauxExecutesHt: cumul.travauxRealisesHt,
    soldeNonExecuteHt: Money.soustraire(marcheActuelHt, cumul.travauxRealisesHt),
    retenueGarantieARestituerHt: cumul.retenueGarantieCumuleeHt,
    avanceRembourseeHt: cumul.avanceRembourseeCumuleeHt,
    compteProrataHt: cumul.compteProrataCumuleHt,
    netRegleHt: cumul.netPayeCumuleHt,
    executePourcent,
    nbSituations: entree.situations.length,
  }
}

export interface LotADecompter {
  readonly lotId: string
  readonly decompte: DecompteGeneral
}

export interface DecompteOperation {
  readonly marcheActuelHt: MoneyValue
  readonly travauxExecutesHt: MoneyValue
  readonly retenueGarantieARestituerHt: MoneyValue
  readonly netRegleHt: MoneyValue
  readonly soldeNonExecuteHt: MoneyValue
  readonly executePourcent: Decimal | null
}

/** Totalise les décomptes de lots pour l'opération entière. */
export function totaliserDecomptes(lots: readonly LotADecompter[]): DecompteOperation {
  const marcheActuelHt = Money.somme(lots.map((l) => l.decompte.marcheActuelHt))
  const travauxExecutesHt = Money.somme(lots.map((l) => l.decompte.travauxExecutesHt))

  return {
    marcheActuelHt,
    travauxExecutesHt,
    retenueGarantieARestituerHt: Money.somme(
      lots.map((l) => l.decompte.retenueGarantieARestituerHt),
    ),
    netRegleHt: Money.somme(lots.map((l) => l.decompte.netRegleHt)),
    soldeNonExecuteHt: Money.soustraire(marcheActuelHt, travauxExecutesHt),
    executePourcent: Money.estZero(marcheActuelHt)
      ? null
      : arrondiCommercial(
          Money.versEuros(travauxExecutesHt).div(Money.versEuros(marcheActuelHt)).mul(100),
          2,
        ),
  }
}
