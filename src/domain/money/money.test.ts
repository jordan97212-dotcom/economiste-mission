import { describe, expect, it } from 'vitest'
import { Decimal, dec, arrondiCommercial } from './decimal'
import * as Money from './money'
import * as PU from './prix-unitaire'

describe('arrondi commercial', () => {
  it('arrondit au plus proche et s’éloigne de zéro à l’équidistance', () => {
    expect(arrondiCommercial('0.005', 2).toString()).toBe('0.01')
    expect(arrondiCommercial('-0.005', 2).toString()).toBe('-0.01')
    expect(arrondiCommercial('0.004', 2).toString()).toBe('0')
    expect(arrondiCommercial('0.015', 2).toString()).toBe('0.02')
    expect(arrondiCommercial('0.025', 2).toString()).toBe('0.03')
  })

  it('n’applique pas l’arrondi bancaire', () => {
    // L'arrondi bancaire donnerait 0,02 dans les deux cas. Ici on veut 0,03 puis 0,02.
    expect(arrondiCommercial('0.025', 2).toString()).toBe('0.03')
    expect(arrondiCommercial('0.0249', 2).toString()).toBe('0.02')
  })

  it('refuse un nombre de décimales aberrant', () => {
    expect(() => arrondiCommercial('1', -1)).toThrow(RangeError)
    expect(() => arrondiCommercial('1', 1.5)).toThrow(RangeError)
  })
})

describe('conversion décimale', () => {
  it('lit un nombre par sa représentation décimale et non par ses bits', () => {
    expect(dec(0.1).plus(dec(0.2)).toString()).toBe('0.3')
  })

  it('refuse une valeur non finie', () => {
    expect(() => dec(Number.POSITIVE_INFINITY)).toThrow(RangeError)
    expect(() => dec(Number.NaN)).toThrow(RangeError)
  })
})

describe('Money', () => {
  it('construit depuis des centimes entiers', () => {
    expect(Money.depuisCentimes(1_694_753n)).toBe(1_694_753n)
    expect(Money.depuisCentimes('-250')).toBe(-250n)
  })

  it('refuse des centimes non entiers', () => {
    expect(() => Money.depuisCentimes(12.5)).toThrow(RangeError)
    expect(() => Money.depuisCentimes('12,50')).toThrow(RangeError)
  })

  it('construit depuis des euros en arrondissant au centime', () => {
    expect(Money.depuisEuros('285.43')).toBe(28_543n)
    expect(Money.depuisEuros('0.005')).toBe(1n)
    expect(Money.depuisEuros('-0.005')).toBe(-1n)
    expect(Money.depuisEuros('0.004')).toBe(0n)
  })

  it('ne dérive pas sur une addition qui piège les flottants', () => {
    const dixCentimes = Money.depuisEuros('0.10')
    const vingtCentimes = Money.depuisEuros('0.20')
    const total = Money.ajouter(dixCentimes, vingtCentimes)
    expect(total).toBe(30n)
    expect(Money.versEuros(total).toString()).toBe('0.3')
  })

  it('somme exactement cinq cents lignes d’un centime', () => {
    const lignes = Array.from({ length: 500 }, () => Money.depuisCentimes(1n))
    expect(Money.somme(lignes)).toBe(500n)
  })

  it('somme exactement une série irrégulière, à l’identique d’un cumul en entiers', () => {
    const centimes = Array.from({ length: 500 }, (_, i) => BigInt(i * 7919 - 100_000))
    const attendu = centimes.reduce((a, b) => a + b, 0n)
    const montants = centimes.map((c) => Money.depuisCentimes(c))
    expect(Money.somme(montants)).toBe(attendu)
  })

  it('somme une liste vide à zéro', () => {
    expect(Money.somme([])).toBe(Money.ZERO)
  })

  it('gère les montants négatifs, cas des avenants en moins-value', () => {
    const moinsValue = Money.depuisEuros('-12500.75')
    expect(moinsValue).toBe(-1_250_075n)
    expect(Money.estNegatif(moinsValue)).toBe(true)
    expect(Money.valeurAbsolue(moinsValue)).toBe(1_250_075n)
    expect(Money.ajouter(Money.depuisEuros('20000'), moinsValue)).toBe(749_925n)
  })

  it('multiplie par un décimal en arrondissant au centime', () => {
    expect(Money.multiplier(Money.depuisEuros('100'), '1.2345')).toBe(12_345n)
    expect(Money.multiplier(Money.depuisEuros('0.01'), '0.5')).toBe(1n) // 0,005 -> 0,01
  })

  it('compare et repère le zéro', () => {
    expect(Money.comparer(Money.depuisCentimes(1n), Money.depuisCentimes(2n))).toBe(-1)
    expect(Money.comparer(Money.depuisCentimes(2n), Money.depuisCentimes(1n))).toBe(1)
    expect(Money.comparer(Money.depuisCentimes(2n), Money.depuisCentimes(2n))).toBe(0)
    expect(Money.estZero(Money.ZERO)).toBe(true)
    expect(Money.negation(Money.depuisCentimes(5n))).toBe(-5n)
    expect(Money.soustraire(Money.depuisCentimes(5n), Money.depuisCentimes(8n))).toBe(-3n)
  })

  it('formate à la française', () => {
    expect(Money.formater(Money.depuisEuros('16947.53'))).toBe('16\u202F947,53\u202F€')
    expect(Money.formater(Money.depuisEuros('1234567.05'))).toBe('1\u202F234\u202F567,05\u202F€')
    expect(Money.formater(Money.depuisEuros('-0.5'))).toBe('-0,50\u202F€')
    expect(Money.formater(Money.ZERO, { symbole: false })).toBe('0,00')
  })
})

describe('PrixUnitaire', () => {
  it('stocke quatre décimales d’euro', () => {
    expect(PU.depuisEuros('285.43')).toBe(2_854_300n)
    expect(PU.depuisEuros('0.0325')).toBe(325n)
    expect(PU.versEuros(PU.depuisEuros('356.7875')).toString()).toBe('356.7875')
  })

  it('arrondit à la précision demandée', () => {
    expect(PU.depuisEuros('356.7875', 2)).toBe(3_567_900n)
    expect(PU.depuisEuros('356.7875', 3)).toBe(3_567_880n)
    expect(PU.depuisEuros('356.7875', 4)).toBe(3_567_875n)
  })

  it('n’accepte qu’une précision de mission comprise entre 2 et 4', () => {
    expect(() => PU.verifierPrecision(2)).not.toThrow()
    expect(() => PU.verifierPrecision(4)).not.toThrow()
    expect(() => PU.verifierPrecision(1)).toThrow(RangeError)
    expect(() => PU.verifierPrecision(5)).toThrow(RangeError)
    expect(() => PU.verifierPrecision(2.5)).toThrow(RangeError)
  })

  it('refuse une précision au-delà de l’échelle de stockage', () => {
    expect(() => PU.depuisEuros('1', 5)).toThrow(RangeError)
  })

  it('formate à la précision d’affichage', () => {
    expect(PU.formater(PU.depuisEuros('356.79'), 2)).toBe('356,79\u202F€')
    expect(PU.formater(PU.depuisEuros('0.0325'), 4)).toBe('0,0325\u202F€')
    expect(PU.formater(PU.depuisEuros('1234.5'), 2, { symbole: false })).toBe('1\u202F234,50')
  })

  it('compare et repère le zéro', () => {
    expect(PU.comparer(PU.depuisEuros('1'), PU.depuisEuros('2'))).toBe(-1)
    expect(PU.comparer(PU.depuisEuros('2'), PU.depuisEuros('1'))).toBe(1)
    expect(PU.comparer(PU.depuisEuros('2'), PU.depuisEuros('2'))).toBe(0)
    expect(PU.estZero(PU.PU_ZERO)).toBe(true)
    expect(PU.depuisStockage(2_854_300)).toBe(2_854_300n)
    expect(() => PU.depuisStockage(1.5)).toThrow(RangeError)
  })
})

describe('cohérence des deux échelles', () => {
  it('un prix unitaire converti en montant pour une quantité de 1 retombe au centime', () => {
    const pu = PU.depuisEuros('356.7875')
    const montant = Money.depuisEuros(new Decimal(1).mul(PU.versEuros(pu)))
    expect(montant).toBe(35_679n) // 356,7875 -> 356,79
  })
})
