import { describe, expect, it } from 'vitest'
import { dec } from '../money/decimal.js'
import * as Money from '../money/money.js'
import * as PU from '../money/prix-unitaire.js'
import { resoudreCoefficient, COEFFICIENT_MAX } from './coefficient.js'
import {
  calculerOuvrage,
  totaliserArbre,
  totalLot,
  totalTce,
  ratioEuroParM2,
  recapituler,
  type NoeudChiffrage,
} from './calcul.js'

const COEF_MISSION = '1.2500'

describe('cascade du coefficient local', () => {
  it('hérite de la mission quand ni le lot ni la ligne ne surchargent', () => {
    const r = resoudreCoefficient({ mission: COEF_MISSION })
    expect(r.valeur.toString()).toBe('1.25')
    expect(r.origine).toBe('mission')
  })

  it('le lot l’emporte sur la mission', () => {
    const r = resoudreCoefficient({ mission: COEF_MISSION, lot: '1.3000' })
    expect(r.valeur.toString()).toBe('1.3')
    expect(r.origine).toBe('lot')
  })

  it('la ligne l’emporte sur le lot et sur la mission', () => {
    const r = resoudreCoefficient({ mission: COEF_MISSION, lot: '1.3000', ligne: '1.1000' })
    expect(r.valeur.toString()).toBe('1.1')
    expect(r.origine).toBe('ligne')
  })

  it('null et undefined signifient tous deux hériter', () => {
    expect(resoudreCoefficient({ mission: COEF_MISSION, lot: null }).origine).toBe('mission')
    expect(resoudreCoefficient({ mission: COEF_MISSION, lot: undefined }).origine).toBe('mission')
    expect(resoudreCoefficient({ mission: COEF_MISSION, lot: '1.3', ligne: null }).origine).toBe('lot')
  })

  it('refuse un coefficient nul, négatif ou hors plafond', () => {
    expect(() => resoudreCoefficient({ mission: '0' })).toThrow(RangeError)
    expect(() => resoudreCoefficient({ mission: '-1' })).toThrow(RangeError)
    expect(() => resoudreCoefficient({ mission: '1', ligne: String(COEFFICIENT_MAX + 1) })).toThrow(RangeError)
  })
})

describe('calcul d’une ligne de DPGF', () => {
  // Poste 02.03.01 — Béton armé pour voiles, exemple de référence du document
  // d'architecture. C'est le cas qui justifie la règle d'arrondi retenue.
  const betonVoiles = {
    quantite: '47.500',
    prixUnitaireHtBase: PU.depuisEuros('285.43'),
    coefficient: { mission: COEF_MISSION },
  }

  it('arrondit le prix unitaire à deux décimales puis multiplie', () => {
    const r = calculerOuvrage({ ...betonVoiles, precisionPu: 2 })
    expect(PU.versEuros(r.prixUnitaireHtFinal).toString()).toBe('356.79')
    expect(r.montantHt).toBe(1_694_753n)
    expect(Money.formater(r.montantHt)).toBe('16\u202F947,53\u202F€')
  })

  it('donne un montant différent à quatre décimales, ce qui justifie le réglage', () => {
    const r = calculerOuvrage({ ...betonVoiles, precisionPu: 4 })
    expect(PU.versEuros(r.prixUnitaireHtFinal).toString()).toBe('356.7875')
    expect(r.montantHt).toBe(1_694_741n)
  })

  it('l’écart entre les deux précisions est bien de douze centimes', () => {
    const deux = calculerOuvrage({ ...betonVoiles, precisionPu: 2 }).montantHt
    const quatre = calculerOuvrage({ ...betonVoiles, precisionPu: 4 }).montantHt
    expect(Money.soustraire(deux, quatre)).toBe(12n)
  })

  it('un coefficient neutre ne bouge pas le prix d’un centime', () => {
    const r = calculerOuvrage({
      quantite: '3',
      prixUnitaireHtBase: PU.depuisEuros('19.99'),
      coefficient: { mission: '1.0000' },
      precisionPu: 2,
    })
    expect(PU.versEuros(r.prixUnitaireHtFinal).toString()).toBe('19.99')
    expect(r.montantHt).toBe(5_997n)
  })

  it('remonte l’origine du coefficient appliqué', () => {
    const r = calculerOuvrage({
      quantite: '1',
      prixUnitaireHtBase: PU.depuisEuros('100'),
      coefficient: { mission: '1.25', lot: '1.30', ligne: '1.10' },
      precisionPu: 2,
    })
    expect(r.coefficient.origine).toBe('ligne')
    expect(r.montantHt).toBe(11_000n)
  })

  it('traite la quantité nulle, le prix nul et le prix absent', () => {
    const quantiteNulle = calculerOuvrage({
      quantite: '0',
      prixUnitaireHtBase: PU.depuisEuros('285.43'),
      coefficient: { mission: COEF_MISSION },
      precisionPu: 2,
    })
    expect(quantiteNulle.montantHt).toBe(Money.ZERO)
    expect(PU.versEuros(quantiteNulle.prixUnitaireHtFinal).toString()).toBe('356.79')

    const prixNul = calculerOuvrage({
      quantite: '10',
      prixUnitaireHtBase: PU.depuisEuros('0'),
      coefficient: { mission: COEF_MISSION },
      precisionPu: 2,
    })
    expect(prixNul.montantHt).toBe(Money.ZERO)

    const prixAbsent = calculerOuvrage({
      quantite: '10',
      coefficient: { mission: COEF_MISSION },
      precisionPu: 2,
    })
    expect(prixAbsent.prixUnitaireHtFinal).toBe(PU.PU_ZERO)
    expect(prixAbsent.montantHt).toBe(Money.ZERO)
  })

  it('traite la quantité absente sans produire de montant', () => {
    const r = calculerOuvrage({
      prixUnitaireHtBase: PU.depuisEuros('285.43'),
      coefficient: { mission: COEF_MISSION },
      precisionPu: 2,
    })
    expect(r.montantHt).toBe(Money.ZERO)
    expect(PU.versEuros(r.prixUnitaireHtFinal).toString()).toBe('356.79')
  })

  it('refuse une quantité négative', () => {
    expect(() =>
      calculerOuvrage({
        quantite: '-1',
        prixUnitaireHtBase: PU.depuisEuros('10'),
        coefficient: { mission: '1' },
        precisionPu: 2,
      }),
    ).toThrow(RangeError)
  })

  it('refuse une précision hors plage', () => {
    expect(() =>
      calculerOuvrage({
        quantite: '1',
        prixUnitaireHtBase: PU.depuisEuros('10'),
        coefficient: { mission: '1' },
        precisionPu: 1,
      }),
    ).toThrow(RangeError)
  })

  it('arrondit le montant au centime, à l’équidistance en s’éloignant de zéro', () => {
    // 0,5 x 0,01 = 0,005 -> 0,01
    const r = calculerOuvrage({
      quantite: '0.5',
      prixUnitaireHtBase: PU.depuisEuros('0.01'),
      coefficient: { mission: '1' },
      precisionPu: 2,
    })
    expect(r.montantHt).toBe(1n)
  })

  it('tient une quantité forte sur un prix unitaire à quatre décimales', () => {
    const r = calculerOuvrage({
      quantite: '125000',
      prixUnitaireHtBase: PU.depuisEuros('0.0325'),
      coefficient: { mission: '1.2500' },
      precisionPu: 4,
    })
    // 0,0325 x 1,25 = 0,040625 -> 0,0406 ; 125 000 x 0,0406 = 5 075,00
    expect(PU.versEuros(r.prixUnitaireHtFinal).toString()).toBe('0.0406')
    expect(r.montantHt).toBe(507_500n)
  })
})

describe('totaux', () => {
  it('le total d’un lot est la somme exacte des lignes', () => {
    const montants = ['0.10', '0.20', '0.30'].map((e) => Money.depuisEuros(e))
    expect(totalLot(montants)).toBe(60n)
  })

  it('le total tous corps d’état est la somme exacte des lots', () => {
    const lots = ['12500.55', '48200.10', '3.35'].map((e) => Money.depuisEuros(e))
    expect(totalTce(lots)).toBe(6_070_400n)
    expect(Money.formater(totalTce(lots))).toBe('60\u202F704,00\u202F€')
  })

  it('ne ré-arrondit pas les totaux, sinon cinq cents lignes dériveraient', () => {
    const lignes = Array.from({ length: 500 }, () =>
      calculerOuvrage({
        quantite: '1',
        prixUnitaireHtBase: PU.depuisEuros('0.014'),
        coefficient: { mission: '1' },
        precisionPu: 4,
      }),
    )
    // Chaque ligne vaut 0,014 € arrondi au centime, soit 0,01 €.
    expect(lignes[0]?.montantHt).toBe(1n)
    expect(totalLot(lignes.map((l) => l.montantHt))).toBe(500n)
  })

  it('totalise un arbre lot, sous-lot, ouvrage', () => {
    const arbre: NoeudChiffrage[] = [
      { type: 'OUVRAGE', montantHt: Money.depuisEuros('100') },
      {
        type: 'SOUS_LOT',
        enfants: [
          { type: 'OUVRAGE', montantHt: Money.depuisEuros('50.25') },
          {
            type: 'SOUS_LOT',
            enfants: [{ type: 'OUVRAGE', montantHt: Money.depuisEuros('9.75') }],
          },
        ],
      },
    ]
    expect(totaliserArbre(arbre)).toBe(16_000n)
  })

  it('totalise un arbre vide à zéro', () => {
    expect(totaliserArbre([])).toBe(Money.ZERO)
    expect(totaliserArbre([{ type: 'SOUS_LOT', enfants: [] }])).toBe(Money.ZERO)
  })
})

describe('ratio euro par mètre carré', () => {
  it('calcule le ratio à deux décimales', () => {
    expect(ratioEuroParM2(Money.depuisEuros('1250000'), '850.50')?.toString()).toBe('1469.72')
  })

  it('retourne null plutôt qu’un chiffre faux quand la surface manque', () => {
    expect(ratioEuroParM2(Money.depuisEuros('1250000'), null)).toBeNull()
    expect(ratioEuroParM2(Money.depuisEuros('1250000'), undefined)).toBeNull()
    expect(ratioEuroParM2(Money.depuisEuros('1250000'), '0')).toBeNull()
    expect(ratioEuroParM2(Money.depuisEuros('1250000'), '-10')).toBeNull()
  })
})

describe('récapitulatif de chiffrage', () => {
  const lots = [
    { lotId: 'a', numero: '02', intitule: 'Gros œuvre — Maçonnerie', montantHt: Money.depuisEuros('400000') },
    { lotId: 'b', numero: '13', intitule: 'Climatisation', montantHt: Money.depuisEuros('100000') },
  ]

  it('donne le total, la part de chaque lot et le ratio', () => {
    const r = recapituler(lots, '500')
    expect(r.totalTceHt).toBe(50_000_000n)
    expect(r.lots[0]?.partPourcent?.toString()).toBe('80')
    expect(r.lots[1]?.partPourcent?.toString()).toBe('20')
    expect(r.ratioEuroParM2?.toString()).toBe('1000')
  })

  it('ne calcule pas de part quand le total est nul', () => {
    const r = recapituler([{ lotId: 'a', numero: '02', intitule: 'Vide', montantHt: Money.ZERO }], '500')
    expect(r.lots[0]?.partPourcent).toBeNull()
    expect(r.ratioEuroParM2?.toString()).toBe('0')
  })

  it('accepte une surface décimale exacte', () => {
    expect(recapituler(lots, dec('1234.56')).ratioEuroParM2?.toString()).toBe('405')
  })
})
