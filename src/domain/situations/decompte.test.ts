import { describe, expect, it } from 'vitest'
import * as Money from '../money/money'
import {
  cumulerSituations,
  decompterSituation,
  retenueSuggeree,
  tauxRetenueConstate,
  type LigneSituation,
} from './decompte'

const euros = (valeur: string) => Money.depuisEuros(valeur)

function ligne(partiel: Partial<LigneSituation> = {}): LigneSituation {
  return {
    montantPeriodeHt: Money.ZERO,
    retenueGarantieHt: Money.ZERO,
    avanceRembourseeHt: Money.ZERO,
    compteProrataHt: Money.ZERO,
    ...partiel,
  }
}

describe('décompte d’une situation', () => {
  it('retire les trois déductions du montant de la période', () => {
    const decompte = decompterSituation({
      montantPeriodeHt: euros('100000'),
      retenueGarantieHt: euros('5000'),
      avanceRembourseeHt: euros('3000'),
      compteProrataHt: euros('1000'),
    })
    expect(decompte.deductionsHt).toEqual(euros('9000'))
    expect(decompte.netAPayerHt).toEqual(euros('91000'))
  })

  it('sans déduction, le net à payer est le montant de la période', () => {
    const decompte = decompterSituation({
      montantPeriodeHt: euros('42000'),
      retenueGarantieHt: Money.ZERO,
      avanceRembourseeHt: Money.ZERO,
      compteProrataHt: Money.ZERO,
    })
    expect(decompte.netAPayerHt).toEqual(euros('42000'))
  })

  it('laisse un net à payer négatif se voir, au lieu de le masquer', () => {
    // Situation de régularisation en moins-value : cela existe, et l'écraser
    // à zéro ferait disparaître une somme due.
    const decompte = decompterSituation({
      montantPeriodeHt: euros('1000'),
      retenueGarantieHt: euros('2500'),
      avanceRembourseeHt: Money.ZERO,
      compteProrataHt: Money.ZERO,
    })
    expect(Money.estNegatif(decompte.netAPayerHt)).toBe(true)
    expect(decompte.netAPayerHt).toEqual(euros('-1500'))
  })

  it('accepte une période négative, cas d’une reprise sur situation précédente', () => {
    const decompte = decompterSituation({
      montantPeriodeHt: euros('-5000'),
      retenueGarantieHt: Money.ZERO,
      avanceRembourseeHt: Money.ZERO,
      compteProrataHt: Money.ZERO,
    })
    expect(decompte.netAPayerHt).toEqual(euros('-5000'))
  })
})

describe('retenue suggérée', () => {
  it('calcule le taux demandé, arrondi au centime', () => {
    expect(retenueSuggeree(euros('100000'), '5')).toEqual(euros('5000'))
    expect(retenueSuggeree(euros('16947.53'), '5')).toEqual(euros('847.38'))
  })

  it('rend zéro pour un taux nul', () => {
    expect(retenueSuggeree(euros('100000'), '0')).toEqual(Money.ZERO)
  })

  it('refuse un taux hors bornes plutôt que de produire un chiffre absurde', () => {
    expect(() => retenueSuggeree(euros('1000'), '-1')).toThrow(RangeError)
    expect(() => retenueSuggeree(euros('1000'), '101')).toThrow(RangeError)
  })

  it('arrondit commercialement, comme partout ailleurs', () => {
    // 1 234,57 € × 5 % = 61,7285 € → 61,73 €
    expect(retenueSuggeree(euros('1234.57'), '5')).toEqual(euros('61.73'))
  })
})

describe('cumul des situations d’un lot', () => {
  it('additionne les périodes et chacune des déductions', () => {
    const cumul = cumulerSituations([
      ligne({ montantPeriodeHt: euros('50000'), retenueGarantieHt: euros('2500') }),
      ligne({ montantPeriodeHt: euros('30000'), retenueGarantieHt: euros('1500'), compteProrataHt: euros('600') }),
    ])
    expect(cumul.travauxRealisesHt).toEqual(euros('80000'))
    expect(cumul.retenueGarantieCumuleeHt).toEqual(euros('4000'))
    expect(cumul.compteProrataCumuleHt).toEqual(euros('600'))
    expect(cumul.netPayeCumuleHt).toEqual(euros('75400'))
  })

  it('rend des cumuls nuls quand aucune situation n’existe', () => {
    const cumul = cumulerSituations([])
    expect(cumul.travauxRealisesHt).toEqual(Money.ZERO)
    expect(cumul.retenueGarantieCumuleeHt).toEqual(Money.ZERO)
    expect(cumul.netPayeCumuleHt).toEqual(Money.ZERO)
  })

  it('la somme des nets de chaque situation égale le net cumulé', () => {
    // Propriété qui doit tenir : sinon un euro se perdrait entre deux écrans.
    const lignes = [
      ligne({ montantPeriodeHt: euros('50000'), retenueGarantieHt: euros('2500'), avanceRembourseeHt: euros('1000') }),
      ligne({ montantPeriodeHt: euros('30000'), retenueGarantieHt: euros('1500'), compteProrataHt: euros('600') }),
      ligne({ montantPeriodeHt: euros('20000.33'), retenueGarantieHt: euros('1000.02') }),
    ]
    const sommeDesNets = Money.somme(lignes.map((l) => decompterSituation(l).netAPayerHt))
    expect(cumulerSituations(lignes).netPayeCumuleHt).toEqual(sommeDesNets)
  })
})

describe('taux de retenue constaté', () => {
  it('rapporte la retenue cumulée au marché', () => {
    expect(tauxRetenueConstate(euros('5000'), euros('100000'))?.toFixed(2)).toBe('5.00')
  })

  it('rend null sur un marché nul, plutôt qu’une division maquillée', () => {
    expect(tauxRetenueConstate(euros('5000'), Money.ZERO)).toBeNull()
  })
})
