import { describe, expect, it } from 'vitest'
import { resumerChangement, valeurLisible } from './lisibilite'

describe('lecture d’une valeur du journal', () => {
  it('rend les centimes en euros', () => {
    expect(valeurLisible('honorairesMissionHt', '4850000')).toBe('48500,00 €')
    expect(valeurLisible('budgetPrevisionnelHt', '320000000')).toBe('3200000,00 €')
  })

  it('rend le prix de base à son échelle propre, en dix-millièmes', () => {
    expect(valeurLisible('prixUnitaireHtBase', '2854300')).toBe('285,4300 €')
  })

  it('ne perd aucun chiffre sur un montant hors de portée du flottant', () => {
    // 90 071 992 547 409,93 € : au-delà de ce qu'un nombre JavaScript sait tenir.
    expect(valeurLisible('honorairesMissionHt', '9007199254740993')).toBe('90071992547409,93 €')
  })

  it('garde le signe des montants négatifs', () => {
    expect(valeurLisible('montantSupprimeHt', '-125050')).toBe('-1250,50 €')
  })

  it('complète les décimales manquantes', () => {
    expect(valeurLisible('honorairesMissionHt', '5')).toBe('0,05 €')
    expect(valeurLisible('prixUnitaireHtBase', '7')).toBe('0,0007 €')
  })

  it('écrit les décimaux à la française', () => {
    expect(valeurLisible('quantite', '47.5')).toBe('47,5')
  })

  it('laisse un code d’ouvrage intact', () => {
    // Le code n'est pas un nombre : « 13,03,01 » ne veut rien dire.
    expect(valeurLisible('code', '13.03.01')).toBe('13.03.01')
    expect(valeurLisible('designation', 'Dalle ép. 20 cm')).toBe('Dalle ép. 20 cm')
  })

  it('signale l’absence de valeur plutôt que d’afficher un zéro', () => {
    expect(valeurLisible('quantite', null)).toBe('—')
    expect(valeurLisible('quantite', undefined)).toBe('—')
    expect(valeurLisible('code', '')).toBe('—')
  })

  it('n’applique pas l’échelle monétaire à un texte', () => {
    expect(valeurLisible('honorairesMissionHt', 'non renseigné')).toBe('non renseigné')
  })
})

describe('résumé d’un changement', () => {
  it('montre le passage d’une valeur à l’autre', () => {
    expect(
      resumerChangement({ quantite: '47.5' }, { quantite: '52' }),
    ).toBe('quantité : 47,5 → 52')
  })

  it('à la création, ne montre que la valeur posée', () => {
    expect(resumerChangement({}, { code: '02.03.01', unite: 'M3' })).toBe(
      'code : 02.03.01 · unité : M3',
    )
  })

  it('à la suppression, ne montre que la valeur perdue', () => {
    expect(resumerChangement({ montantSupprimeHt: '1694753' }, {})).toBe(
      'montant supprimé : 16947,53 €',
    )
  })

  it('s’arrête à cinq champs pour rester lisible', () => {
    const beaucoup = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }
    expect(resumerChangement({}, beaucoup).split(' · ')).toHaveLength(5)
  })

  it('rend un tiret quand rien n’est décrit', () => {
    expect(resumerChangement(null, null)).toBe('—')
  })
})
