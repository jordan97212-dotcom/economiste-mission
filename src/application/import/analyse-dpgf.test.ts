import { describe, expect, it } from 'vitest'
import { analyserDpgf, devinerMappageDpgf } from './analyse-dpgf'
import * as PU from '../../domain/money/prix-unitaire'

describe('reconnaissance des colonnes d’un DPGF', () => {
  it('reconnaît un en-tête classique', () => {
    const mappage = devinerMappageDpgf([
      'N°',
      'Désignation des ouvrages',
      'Unité',
      'Quantité',
      'Prix unitaire HT',
      'Montant HT',
    ])
    expect(mappage).toEqual({
      code: 0,
      designation: 1,
      unite: 2,
      quantite: 3,
      prixUnitaireHt: 4,
    })
  })

  it('reconnaît les abréviations courantes', () => {
    const mappage = devinerMappageDpgf(['Code', 'Libellé', 'U', 'Qté', 'P.U. HT'])
    expect(mappage.designation).toBe(1)
    expect(mappage.unite).toBe(2)
    expect(mappage.quantite).toBe(3)
    expect(mappage.prixUnitaireHt).toBe(4)
  })

  it('laisse vides les colonnes qu’il ne comprend pas', () => {
    const mappage = devinerMappageDpgf(['Colonne A', 'Colonne B'])
    expect(Object.keys(mappage)).toHaveLength(0)
  })
})

const MAPPAGE = { code: 0, designation: 1, unite: 2, quantite: 3, prixUnitaireHt: 4 }

describe('analyse d’un DPGF', () => {
  it('traite comme sous-lot une ligne sans quantité ni prix', () => {
    const apercu = analyserDpgf(
      [
        ['02.01', 'TERRASSEMENTS', '', '', ''],
        ['02.01.01', 'Fouilles en pleine masse', 'm3', '1 250,500', '38,20'],
      ],
      MAPPAGE,
    )

    expect(apercu.nbSousLots).toBe(1)
    expect(apercu.nbOuvrages).toBe(1)
    expect(apercu.lignes[0]?.type).toBe('SOUS_LOT')
    expect(apercu.lignes[1]?.type).toBe('OUVRAGE')
    expect(apercu.lignes[1]?.quantite).toBe('1250.5')
  })

  it('convertit le prix vers l’échelle de stockage, à la précision de la mission', () => {
    const apercu = analyserDpgf([['', 'Béton armé', 'm3', '47,5', '285,43']], MAPPAGE, {
      precisionPu: 2,
    })
    expect(apercu.lignes[0]?.prixUnitaireHt).toBe(PU.depuisEuros('285.43', 2).toString())
  })

  it('signale une quantité illisible sans deviner', () => {
    const apercu = analyserDpgf([['', 'Poste douteux', 'm2', 'à définir', '10']], MAPPAGE)
    expect(apercu.lignes).toHaveLength(0)
    expect(apercu.anomalies[0]?.severite).toBe('bloquante')
    expect(apercu.anomalies[0]?.message).toContain('Quantité illisible')
  })

  it('signale un prix illisible sans deviner', () => {
    const apercu = analyserDpgf([['', 'Poste douteux', 'm2', '10', 'sur devis']], MAPPAGE)
    expect(apercu.lignes).toHaveLength(0)
    expect(apercu.anomalies[0]?.message).toContain('Prix unitaire illisible')
  })

  it('avertit sans bloquer sur une unité inconnue', () => {
    const apercu = analyserDpgf([['', 'Gravats', 'benne', '3', '120']], MAPPAGE)
    expect(apercu.lignes).toHaveLength(1)
    expect(apercu.lignes[0]?.unite).toBeNull()
    expect(apercu.anomalies[0]?.severite).toBe('avertissement')
  })

  it('avertit sur une quantité nulle et sur un prix à zéro', () => {
    const apercu = analyserDpgf(
      [
        ['', 'Poste à quantité nulle', 'm2', '0', '25'],
        ['', 'Poste à prix nul', 'm2', '10', '0'],
      ],
      MAPPAGE,
    )
    expect(apercu.lignes).toHaveLength(2)
    const messages = apercu.anomalies.map((a) => a.message)
    expect(messages).toContain('Quantité nulle.')
    expect(messages).toContain('Prix unitaire à zéro.')
    expect(apercu.anomalies.every((a) => a.severite === 'avertissement')).toBe(true)
  })

  it('bloque une ligne chiffrée sans désignation', () => {
    const apercu = analyserDpgf([['02.01.01', '', 'm2', '10', '25']], MAPPAGE)
    expect(apercu.lignes).toHaveLength(0)
    expect(apercu.anomalies[0]?.message).toContain('sans désignation')
  })

  it('ignore les lignes entièrement vides', () => {
    const apercu = analyserDpgf([['', '', '', '', ''], ['', 'Un poste', 'u', '1', '5']], MAPPAGE)
    expect(apercu.lignes).toHaveLength(1)
    expect(apercu.anomalies).toHaveLength(0)
  })

  it('numérote les lignes d’après leur position dans le fichier', () => {
    const apercu = analyserDpgf([['', 'Premier', 'u', '1', '5']], MAPPAGE, { premiereLigne: 12 })
    expect(apercu.lignes[0]?.ligne).toBe(12)
  })

  it('refuse d’analyser sans colonne de désignation', () => {
    expect(() => analyserDpgf([['a']], { quantite: 0 })).toThrow(/désignation/)
  })
})
