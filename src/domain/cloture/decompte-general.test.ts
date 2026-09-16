import { describe, expect, it } from 'vitest'
import * as Money from '../money/money'
import type { LigneSituation } from '../situations/decompte'
import { etablirDecompteGeneral, totaliserDecomptes } from './decompte-general'

const euros = (valeur: string) => Money.depuisEuros(valeur)

function situation(partiel: Partial<LigneSituation> = {}): LigneSituation {
  return {
    montantPeriodeHt: Money.ZERO,
    retenueGarantieHt: Money.ZERO,
    avanceRembourseeHt: Money.ZERO,
    compteProrataHt: Money.ZERO,
    ...partiel,
  }
}

describe('décompte général d’un lot', () => {
  it('rassemble marché, avenants, exécuté et déductions', () => {
    const decompte = etablirDecompteGeneral({
      marcheInitialHt: euros('100000'),
      avenantsAcceptesHt: euros('12000'),
      situations: [
        situation({ montantPeriodeHt: euros('60000'), retenueGarantieHt: euros('3000') }),
        situation({ montantPeriodeHt: euros('52000'), retenueGarantieHt: euros('2600'), compteProrataHt: euros('400') }),
      ],
    })

    expect(decompte.marcheActuelHt).toEqual(euros('112000'))
    expect(decompte.travauxExecutesHt).toEqual(euros('112000'))
    expect(decompte.soldeNonExecuteHt).toEqual(Money.ZERO)
    expect(decompte.retenueGarantieARestituerHt).toEqual(euros('5600'))
    expect(decompte.compteProrataHt).toEqual(euros('400'))
    expect(decompte.netRegleHt).toEqual(euros('106000'))
    expect(decompte.executePourcent?.toFixed(2)).toBe('100.00')
    expect(decompte.nbSituations).toBe(2)
  })

  it('montre la part de marché non exécutée', () => {
    const decompte = etablirDecompteGeneral({
      marcheInitialHt: euros('100000'),
      avenantsAcceptesHt: Money.ZERO,
      situations: [situation({ montantPeriodeHt: euros('80000') })],
    })
    expect(decompte.soldeNonExecuteHt).toEqual(euros('20000'))
    expect(decompte.executePourcent?.toFixed(2)).toBe('80.00')
  })

  it('laisse voir un dépassement du marché plutôt que de le borner', () => {
    // Des travaux exécutés au-delà du marché signalent un avenant manquant :
    // écraser le chiffre masquerait exactement ce qu'il faut voir.
    const decompte = etablirDecompteGeneral({
      marcheInitialHt: euros('100000'),
      avenantsAcceptesHt: Money.ZERO,
      situations: [situation({ montantPeriodeHt: euros('108000') })],
    })
    expect(Money.estNegatif(decompte.soldeNonExecuteHt)).toBe(true)
    expect(decompte.executePourcent?.toFixed(2)).toBe('108.00')
  })

  it('tient sans aucune situation', () => {
    const decompte = etablirDecompteGeneral({
      marcheInitialHt: euros('50000'),
      avenantsAcceptesHt: Money.ZERO,
      situations: [],
    })
    expect(decompte.travauxExecutesHt).toEqual(Money.ZERO)
    expect(decompte.soldeNonExecuteHt).toEqual(euros('50000'))
    expect(decompte.executePourcent?.toFixed(2)).toBe('0.00')
    expect(decompte.nbSituations).toBe(0)
  })

  it('rend un pourcentage null sur un marché nul, plutôt qu’une division maquillée', () => {
    const decompte = etablirDecompteGeneral({
      marcheInitialHt: Money.ZERO,
      avenantsAcceptesHt: Money.ZERO,
      situations: [],
    })
    expect(decompte.executePourcent).toBeNull()
  })

  it('tient compte d’une moins-value qui réduit le marché', () => {
    const decompte = etablirDecompteGeneral({
      marcheInitialHt: euros('100000'),
      avenantsAcceptesHt: euros('-8000'),
      situations: [situation({ montantPeriodeHt: euros('92000') })],
    })
    expect(decompte.marcheActuelHt).toEqual(euros('92000'))
    expect(decompte.soldeNonExecuteHt).toEqual(Money.ZERO)
  })
})

describe('totalisation pour l’opération', () => {
  it('additionne les lots et recalcule le pourcentage d’ensemble', () => {
    const operation = totaliserDecomptes([
      {
        lotId: 'a',
        decompte: etablirDecompteGeneral({
          marcheInitialHt: euros('100000'),
          avenantsAcceptesHt: Money.ZERO,
          situations: [situation({ montantPeriodeHt: euros('100000'), retenueGarantieHt: euros('5000') })],
        }),
      },
      {
        lotId: 'b',
        decompte: etablirDecompteGeneral({
          marcheInitialHt: euros('60000'),
          avenantsAcceptesHt: Money.ZERO,
          situations: [situation({ montantPeriodeHt: euros('30000') })],
        }),
      },
    ])

    expect(operation.marcheActuelHt).toEqual(euros('160000'))
    expect(operation.travauxExecutesHt).toEqual(euros('130000'))
    expect(operation.soldeNonExecuteHt).toEqual(euros('30000'))
    expect(operation.retenueGarantieARestituerHt).toEqual(euros('5000'))
    expect(operation.executePourcent?.toFixed(2)).toBe('81.25')
  })

  it('rend des totaux nuls sans aucun lot', () => {
    const operation = totaliserDecomptes([])
    expect(operation.marcheActuelHt).toEqual(Money.ZERO)
    expect(operation.executePourcent).toBeNull()
  })
})
