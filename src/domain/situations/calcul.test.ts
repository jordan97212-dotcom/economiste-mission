import { describe, expect, it } from 'vitest'
import * as Money from '../money/money'
import {
  calculerSituation,
  situationDepuisMontant,
  avancementDepuisMontant,
  marcheActuel,
  tableauFinancier,
} from './calcul'

const euros = (v: string) => Money.depuisEuros(v)

describe('situation de travaux', () => {
  it('calcule le cumul depuis l’avancement et la période depuis le cumul précédent', () => {
    const r = calculerSituation({
      montantMarcheHt: euros('100000'),
      avancementPourcent: '33.33',
      cumulPrecedentHt: Money.ZERO,
    })
    expect(r.montantCumuleHt).toBe(3_333_000n)
    expect(r.montantPeriodeHt).toBe(3_333_000n)
  })

  it('la somme des périodes retombe exactement sur le cumul final', () => {
    // Marché volontairement non rond pour que les arrondis se voient.
    const marche = euros('1000.01')
    const avancements = ['33.33', '66.66', '100']
    let cumulPrecedent = Money.ZERO
    const periodes: Money.Money[] = []

    for (const avancement of avancements) {
      const r = calculerSituation({
        montantMarcheHt: marche,
        avancementPourcent: avancement,
        cumulPrecedentHt: cumulPrecedent,
      })
      periodes.push(r.montantPeriodeHt)
      cumulPrecedent = r.montantCumuleHt
    }

    expect(cumulPrecedent).toBe(marche)
    expect(Money.somme(periodes)).toBe(marche)
  })

  it('ne dérive pas sur douze situations mensuelles', () => {
    const marche = euros('847213.77')
    let cumulPrecedent = Money.ZERO
    const periodes: Money.Money[] = []

    for (let mois = 1; mois <= 12; mois += 1) {
      const r = calculerSituation({
        montantMarcheHt: marche,
        avancementPourcent: ((mois * 100) / 12).toFixed(4),
        cumulPrecedentHt: cumulPrecedent,
      })
      periodes.push(r.montantPeriodeHt)
      cumulPrecedent = r.montantCumuleHt
    }

    expect(cumulPrecedent).toBe(marche)
    expect(Money.somme(periodes)).toBe(marche)
  })

  it('accepte une saisie directe en montant', () => {
    const r = situationDepuisMontant(euros('45000'), euros('30000'))
    expect(r.montantCumuleHt).toBe(4_500_000n)
    expect(r.montantPeriodeHt).toBe(1_500_000n)
  })

  it('produit une période négative en cas de correction à la baisse', () => {
    const r = situationDepuisMontant(euros('28000'), euros('30000'))
    expect(r.montantPeriodeHt).toBe(-200_000n)
  })

  it('refuse un avancement hors des bornes', () => {
    const base = { montantMarcheHt: euros('100000'), cumulPrecedentHt: Money.ZERO }
    expect(() => calculerSituation({ ...base, avancementPourcent: '-1' })).toThrow(RangeError)
    expect(() => calculerSituation({ ...base, avancementPourcent: '100.01' })).toThrow(RangeError)
  })

  it('retrouve l’avancement depuis un montant cumulé', () => {
    expect(avancementDepuisMontant(euros('33330'), euros('100000'))?.toString()).toBe('33.33')
    expect(avancementDepuisMontant(euros('0'), euros('100000'))?.toString()).toBe('0')
  })

  it('ne calcule pas d’avancement sur un marché nul', () => {
    expect(avancementDepuisMontant(euros('100'), Money.ZERO)).toBeNull()
  })
})

describe('marché actuel', () => {
  it('additionne les avenants acceptés, moins-values comprises', () => {
    const actuel = marcheActuel(euros('500000'), [euros('25000'), euros('-12500.75')])
    expect(actuel).toBe(51_249_925n)
    expect(Money.formater(actuel)).toBe(Money.formater(euros('512499.25')))
  })

  it('sans avenant, le marché actuel est le marché initial', () => {
    expect(marcheActuel(euros('500000'), [])).toBe(50_000_000n)
  })
})

describe('tableau de bord financier', () => {
  const base = {
    marcheInitialHt: euros('500000'),
    avenantsAcceptesHt: [euros('25000'), euros('-5000')],
    cumulRealiseHt: euros('260000'),
    estimatifInitialHt: euros('480000'),
    seuilDerivePourcent: '5',
  }

  it('enchaîne marché initial, avenants, marché actuel et reste à réaliser', () => {
    const t = tableauFinancier(base)
    expect(t.avenantsCumulesHt).toBe(2_000_000n)
    expect(t.marcheActuelHt).toBe(52_000_000n)
    expect(t.travauxRealisesHt).toBe(26_000_000n)
    expect(t.resteARealiserHt).toBe(26_000_000n)
    expect(t.avancementPourcent?.toString()).toBe('50')
  })

  it('calcule l’écart vis-à-vis de l’estimatif initial', () => {
    const t = tableauFinancier(base)
    expect(t.ecartVsEstimatifHt).toBe(4_000_000n)
    expect(t.ecartVsEstimatifPourcent?.toString()).toBe('8.33')
  })

  it('déclenche l’alerte de dérive au-delà du seuil paramétré', () => {
    expect(tableauFinancier(base).deriveDetectee).toBe(true)
    expect(tableauFinancier({ ...base, seuilDerivePourcent: '10' }).deriveDetectee).toBe(false)
  })

  it('déclenche l’alerte aussi sur une dérive à la baisse', () => {
    const t = tableauFinancier({
      ...base,
      avenantsAcceptesHt: [euros('-100000')],
      estimatifInitialHt: euros('500000'),
    })
    expect(t.ecartVsEstimatifPourcent?.toString()).toBe('-20')
    expect(t.deriveDetectee).toBe(true)
  })

  it('ne calcule pas de pourcentage quand l’estimatif initial est nul', () => {
    const t = tableauFinancier({ ...base, estimatifInitialHt: Money.ZERO })
    expect(t.ecartVsEstimatifPourcent).toBeNull()
    expect(t.deriveDetectee).toBe(false)
  })

  it('refuse un seuil de dérive négatif', () => {
    expect(() => tableauFinancier({ ...base, seuilDerivePourcent: '-1' })).toThrow(RangeError)
  })
})
