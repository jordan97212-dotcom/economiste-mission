import { describe, expect, it } from 'vitest'
import { difference } from './service'

describe('différence journalisée', () => {
  it('ne retient que les champs réellement modifiés', () => {
    const ecart = difference(
      { designation: 'Béton', quantite: '10', unite: 'M3' },
      { designation: 'Béton armé', quantite: '10', unite: 'M3' },
    )
    expect(ecart).toEqual({
      avant: { designation: 'Béton' },
      apres: { designation: 'Béton armé' },
    })
  })

  it('rend null quand rien n’a bougé', () => {
    expect(difference({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBeNull()
  })

  it('ignore les valeurs recalculées par le domaine', () => {
    const ecart = difference(
      { prixUnitaireHtBase: 100n, prixUnitaireHtFinal: 125n, montantHt: 1250n },
      { prixUnitaireHtBase: 100n, prixUnitaireHtFinal: 150n, montantHt: 1500n },
    )
    expect(ecart).toBeNull()
  })

  it('journalise le prix saisi, qui est une intention', () => {
    const ecart = difference(
      { prixUnitaireHtBase: 2_854_300n, montantHt: 1n },
      { prixUnitaireHtBase: 3_000_000n, montantHt: 2n },
    )
    expect(ecart?.apres).toEqual({ prixUnitaireHtBase: '3000000' })
  })

  it('ignore les horodatages techniques et le propriétaire', () => {
    expect(
      difference(
        { ownerId: 'a', creeLe: new Date(0), modifieLe: new Date(0), designation: 'x' },
        { ownerId: 'b', creeLe: new Date(1), modifieLe: new Date(1), designation: 'x' },
      ),
    ).toBeNull()
  })

  it('convertit les entiers longs en chaînes lisibles', () => {
    const ecart = difference({ honorairesMissionHt: 4_850_000n }, { honorairesMissionHt: 5_000_000n })
    expect(ecart?.avant.honorairesMissionHt).toBe('4850000')
    expect(ecart?.apres.honorairesMissionHt).toBe('5000000')
  })

  it('traite l’apparition et la disparition d’une valeur', () => {
    const apparition = difference({ code: null }, { code: '02.03.01' })
    expect(apparition?.avant.code).toBeNull()
    expect(apparition?.apres.code).toBe('02.03.01')

    const disparition = difference({ code: '02.03.01' }, { code: null })
    expect(disparition?.apres.code).toBeNull()
  })

  it('compare des décimaux par leur écriture, pas par leur objet', () => {
    const decimal = (valeur: string) => ({ toString: () => valeur })
    expect(difference({ quantite: decimal('47.5') }, { quantite: decimal('47.5') })).toBeNull()
    expect(difference({ quantite: decimal('47.5') }, { quantite: decimal('48') })?.apres).toEqual({
      quantite: '48',
    })
  })
})
