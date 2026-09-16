import { describe, expect, it } from 'vitest'
import {
  devinerMappageCollage,
  mappagePositionnel,
  type ColonneCollable,
} from './mappage-collage'

/**
 * Le défaut d'origine : un tableur dont le prix précède la quantité versait le
 * prix dans la quantité, sans rien signaler. Ces tests vérifient d'abord que la
 * proposition ne se prétend jamais certaine sur un couple de nombres — parce que
 * c'est cette fausse assurance qui faussait les montants.
 */

const nature = (m: ReturnType<typeof devinerMappageCollage>): (ColonneCollable | null)[] =>
  m.colonnes.map((c) => c.colonne)

const certitudes = (m: ReturnType<typeof devinerMappageCollage>): boolean[] =>
  m.colonnes.map((c) => c.certain)

describe('correspondance par en-tête', () => {
  const avecEntete = [
    ['Code', 'Désignation', 'Unité', 'Prix unitaire HT', 'Quantité'],
    ['02.01', 'Voile béton banché ép. 20 cm', 'm3', '268,40', '47,5'],
    ['02.02', 'Dalle portée béton armé', 'm2', '92,15', '310'],
  ]

  it('reconnaît un en-tête et ne le colle pas', () => {
    const mappage = devinerMappageCollage(avecEntete, 'code')
    expect(mappage.enteteDetectee).toBe(true)
  })

  it('suit l’ordre de l’en-tête, prix avant quantité compris', () => {
    const mappage = devinerMappageCollage(avecEntete, 'code')
    expect(nature(mappage)).toEqual([
      'code',
      'designation',
      'unite',
      'prixUnitaireHtBase',
      'quantite',
    ])
  })

  it('tient un en-tête pour une source certaine', () => {
    // Un en-tête nomme la colonne : c'est la seule certitude possible sur un
    // couple quantité / prix.
    expect(certitudes(devinerMappageCollage(avecEntete, 'code'))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ])
  })

  it('reconnaît la colonne de coefficient, absente d’un DPGF importé', () => {
    const mappage = devinerMappageCollage(
      [
        ['Désignation', 'Unité', 'Coefficient'],
        ['Voile béton banché', 'm3', '1,25'],
      ],
      'designation',
    )
    expect(nature(mappage)).toEqual(['designation', 'unite', 'coefficientApplique'])
  })

  it('ne prend pas une ligne de données pour un en-tête', () => {
    const mappage = devinerMappageCollage(
      [
        ['02.01', 'Voile béton banché ép. 20 cm', 'm3', '47,5', '268,40'],
        ['02.02', 'Dalle portée béton armé', 'm2', '310', '92,15'],
      ],
      'code',
    )
    expect(mappage.enteteDetectee).toBe(false)
  })
})

describe('correspondance par contenu, sans en-tête', () => {
  const sansEntete = [
    ['02.01', 'Voile béton banché ép. 20 cm', 'm3', '47,5', '268,40'],
    ['02.02', 'Dalle portée béton armé ép. 18', 'm2', '310', '92,15'],
    ['02.03', 'Longrine béton armé section courante', 'ml', '128', '76,90'],
  ]

  it('reconnaît l’unité, la désignation et le code sans hésiter', () => {
    const mappage = devinerMappageCollage(sansEntete, 'code')
    expect(nature(mappage).slice(0, 3)).toEqual(['code', 'designation', 'unite'])
    expect(certitudes(mappage).slice(0, 3)).toEqual([true, true, true])
  })

  it('ne se déclare jamais certain en départageant deux colonnes de nombres', () => {
    const mappage = devinerMappageCollage(sansEntete, 'code')
    expect(certitudes(mappage).slice(3)).toEqual([false, false])
  })

  it('devine le prix sur la colonne à deux décimales', () => {
    const mappage = devinerMappageCollage(sansEntete, 'code')
    expect(nature(mappage).slice(3)).toEqual(['quantite', 'prixUnitaireHtBase'])
  })

  it('devine encore juste quand le prix précède la quantité', () => {
    // Le cas qui faussait les montants en silence.
    const inverse = sansEntete.map(([code, designation, unite, quantite, prix]) => [
      code as string,
      designation as string,
      unite as string,
      prix as string,
      quantite as string,
    ])
    const mappage = devinerMappageCollage(inverse, 'code')
    expect(nature(mappage).slice(3)).toEqual(['prixUnitaireHtBase', 'quantite'])
  })

  it('ne prend pas une colonne de codes pour une colonne de coefficients', () => {
    // « 02.01 » se lit aussi comme le nombre 2,01, et tombait alors pile dans
    // la plage d'un coefficient. En français la décimale s'écrit avec une
    // virgule : un point sépare un code.
    const mappage = devinerMappageCollage(
      [
        ['02.01', 'Voile béton banché ép. 20 cm', 'm3', '47,5', '268,40'],
        ['02.02', 'Dalle portée béton armé ép. 18', 'm2', '310', '92,15'],
      ],
      'code',
    )
    expect(mappage.colonnes[0]?.colonne).toBe('code')
  })

  it('lit bien un vrai coefficient, écrit avec une virgule', () => {
    const mappage = devinerMappageCollage(
      [
        ['Voile béton banché ép. 20 cm', 'm3', '47,5', '268,40', '1,25'],
        ['Dalle portée béton armé ép. 18', 'm2', '310', '92,15', '1,15'],
        ['Longrine béton armé section', 'ml', '128', '76,90', '1,20'],
      ],
      'designation',
    )
    expect(mappage.colonnes[4]?.colonne).toBe('coefficientApplique')
  })

  it('n’attribue jamais deux fois le même champ', () => {
    const mappage = devinerMappageCollage(sansEntete, 'code')
    const attribues = nature(mappage).filter((c): c is ColonneCollable => c !== null)
    expect(new Set(attribues).size).toBe(attribues.length)
  })
})

describe('cas limites', () => {
  it('rend une proposition vide sur un collage vide', () => {
    expect(devinerMappageCollage([], 'designation')).toEqual({
      colonnes: [],
      enteteDetectee: false,
    })
  })

  it('accepte une seule colonne de texte', () => {
    const mappage = devinerMappageCollage(
      [['Voile béton banché ép. 20 cm'], ['Dalle portée béton armé ép. 18']],
      'designation',
    )
    expect(nature(mappage)).toEqual(['designation'])
  })

  it('accepte une seule colonne de nombres, sans la dire certaine', () => {
    const mappage = devinerMappageCollage([['47,5'], ['310'], ['128']], 'quantite')
    expect(mappage.colonnes[0]?.certain).toBe(false)
  })

  it('tolère des lignes de largeurs inégales', () => {
    const mappage = devinerMappageCollage(
      [
        ['02.01', 'Voile béton banché ép. 20 cm', 'm3'],
        ['02.02', 'Dalle portée béton armé ép. 18'],
      ],
      'code',
    )
    expect(mappage.colonnes).toHaveLength(3)
  })

  it('ne propose rien pour une colonne dont il ne sait rien dire', () => {
    // Des cellules vides ne doivent pas se voir attribuer un champ au hasard.
    const mappage = devinerMappageCollage(
      [
        ['Voile béton banché ép. 20 cm', '', 'm3'],
        ['Dalle portée béton armé ép. 18', '', 'm2'],
      ],
      'designation',
    )
    expect(mappage.colonnes[1]?.colonne).toBe(null)
  })
})

describe('repli positionnel', () => {
  it('reprend l’ordre de la grille à partir de la colonne de départ', () => {
    expect(mappagePositionnel('unite', 3).map((c) => c.colonne)).toEqual([
      'unite',
      'quantite',
      'prixUnitaireHtBase',
    ])
  })

  it('s’arrête au bout de la grille plutôt que de boucler', () => {
    expect(mappagePositionnel('coefficientApplique', 3).map((c) => c.colonne)).toEqual([
      'coefficientApplique',
      null,
      null,
    ])
  })

  it('ne présente jamais un repli positionnel comme certain', () => {
    expect(mappagePositionnel('code', 4).every((c) => !c.certain)).toBe(true)
  })
})
