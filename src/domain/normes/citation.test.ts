import { describe, expect, it } from 'vitest'
import { canoniserReference, detecterCitations } from './citation'

const references = (texte: string) => detecterCitations(texte).map((c) => c.reference)

describe('détection des normes citées', () => {
  it('lit un NF DTU', () => {
    expect(references('Conformément au NF DTU 20.1.')).toEqual(['NF DTU 20.1'])
  })

  it('rassemble les écritures d’un même DTU', () => {
    // L'économiste écrit tantôt l'un, tantôt l'autre : c'est la même norme.
    expect(references('NF DTU 20.1, NF-DTU 20.1, DTU 20-1')).toEqual(['NF DTU 20.1'])
  })

  it('retient la partie d’un DTU, qui est une référence distincte', () => {
    expect(references('NF DTU 13.3 P1-1 et NF DTU 13.3 P2')).toEqual([
      'NF DTU 13.3 P1-1',
      'NF DTU 13.3 P2',
    ])
  })

  it('lit les normes européennes, ISO comprises', () => {
    expect(references('NF EN 1992-1-1 puis NF EN ISO 9001')).toEqual([
      'NF EN 1992-1-1',
      'NF EN ISO 9001',
    ])
  })

  it('lit une norme béton avec son complément national', () => {
    expect(references('bétons conformes à la NF EN 206/CN')).toEqual(['NF EN 206/CN'])
  })

  it('lit les normes nationales à lettre', () => {
    expect(references('NF P 18-201, NF C 15-100, NF A 35-080-1')).toEqual([
      'NF P 18-201',
      'NF C 15-100',
      'NF A 35-080-1',
    ])
  })

  it('lit les Eurocodes, avec ou sans partie', () => {
    expect(references('Eurocode 2 et Eurocode 8-1')).toEqual(['Eurocode 2', 'Eurocode 8-1'])
  })

  it('ne rend qu’une fois une norme citée plusieurs fois', () => {
    expect(references('NF DTU 21. Voir NF DTU 21. Encore NF DTU 21.')).toEqual(['NF DTU 21'])
  })

  it('garde l’ordre d’apparition et la position, pour pointer la ligne', () => {
    const citations = detecterCitations('Début. NF DTU 26.1 puis NF EN 998-1.')
    expect(citations.map((c) => c.reference)).toEqual(['NF DTU 26.1', 'NF EN 998-1'])
    expect(citations[0]!.position).toBeLessThan(citations[1]!.position)
  })

  it('conserve l’écriture d’origine, pour la montrer telle qu’elle est écrite', () => {
    expect(detecterCitations('selon le DTU 20-1 en vigueur')[0]!.tel_quel).toBe('DTU 20-1')
  })

  it('classe chaque citation dans sa famille', () => {
    const familles = detecterCitations('NF DTU 21, NF EN 1992-1-1, NF EN ISO 9001, NF P 18-201, Eurocode 2')
      .map((c) => c.famille)
    expect(familles).toEqual(['NF_DTU', 'NF_EN', 'NF_EN_ISO', 'NF_NATIONALE', 'EUROCODE'])
  })

  it('ne trouve rien dans un texte qui ne cite rien', () => {
    expect(references('Fourniture et pose de carrelage grès cérame.')).toEqual([])
    expect(references('')).toEqual([])
  })

  it('ne confond pas un mot ordinaire avec une norme', () => {
    // « enduit » contient « n » et « du », « dtu » doit rester un mot entier.
    expect(references('Enduit monocouche. Conduit de fumée. Produit 21.')).toEqual([])
  })

  it('tolère la casse, les espaces et leur absence', () => {
    // Mieux vaut reconnaître une frappe serrée que laisser une norme citée
    // échapper au contrôle : c'est tout l'intérêt du dispositif.
    expect(references('nf   dtu  20.1')).toEqual(['NF DTU 20.1'])
    expect(references('NFDTU20.1')).toEqual(['NF DTU 20.1'])
  })
})

describe('écriture canonique d’une référence saisie', () => {
  it('ramène une saisie à la forme des citations', () => {
    expect(canoniserReference('dtu 20-1')).toBe('NF DTU 20.1')
    expect(canoniserReference('nf en iso 9001')).toBe('NF EN ISO 9001')
  })

  it('rend une saisie illisible telle quelle, sans la deviner', () => {
    // On ne fabrique pas une référence : elle sera signalée comme inconnue.
    expect(canoniserReference('Guide CSTB 3567')).toBe('GUIDE CSTB 3567')
  })
})
