import { describe, expect, it } from 'vitest'
import { synthetiser, verifierCoherence, type LotVerif, type PosteVerif } from './verification'

function ouvrage(partiel: Partial<PosteVerif> & { id: string }): PosteVerif {
  return {
    type: 'OUVRAGE',
    code: null,
    designation: 'Un ouvrage',
    unite: 'M3',
    quantite: '10',
    prixUnitaireHtFinal: '3567900',
    texteCctp: 'Description de la prestation.',
    designationSource: null,
    ...partiel,
  }
}

function lot(postes: PosteVerif[], partiel: Partial<LotVerif> = {}): LotVerif[] {
  return [{ id: 'lot1', numero: '02', intitule: 'Gros œuvre', postes, ...partiel }]
}

const codes = (lots: LotVerif[]) => verifierCoherence(lots).map((a) => a.code)

describe('contrôle de cohérence', () => {
  it('ne signale rien sur un lot complet', () => {
    expect(verifierCoherence(lot([ouvrage({ id: 'p1' })]))).toEqual([])
  })

  it('signale un ouvrage du DPGF sans texte de CCTP', () => {
    const anomalies = verifierCoherence(lot([ouvrage({ id: 'p1', texteCctp: null })]))
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]?.code).toBe('ouvrage_sans_texte')
    expect(anomalies[0]?.severite).toBe('bloquante')
    expect(anomalies[0]?.posteId).toBe('p1')
  })

  it('traite un texte vide comme un texte absent', () => {
    expect(codes(lot([ouvrage({ id: 'p1', texteCctp: '   ' })]))).toContain('ouvrage_sans_texte')
  })

  it('n’exige pas de texte sur un chapitre', () => {
    const anomalies = verifierCoherence(
      lot([
        { ...ouvrage({ id: 'sl1' }), type: 'SOUS_LOT', texteCctp: null, unite: null, quantite: null, prixUnitaireHtFinal: null },
        ouvrage({ id: 'p1' }),
      ]),
    )
    expect(anomalies.map((a) => a.code)).not.toContain('ouvrage_sans_texte')
  })

  it('signale un article décrit mais non chiffré', () => {
    const anomalies = verifierCoherence(
      lot([
        ouvrage({ id: 'p1' }),
        ouvrage({ id: 'p2', quantite: null, prixUnitaireHtFinal: null }),
      ]),
    )
    const article = anomalies.find((a) => a.code === 'article_sans_ligne_chiffree')
    expect(article?.severite).toBe('avertissement')
    expect(article?.posteId).toBe('p2')
  })

  it('signale une désignation modifiée depuis l’écriture du texte', () => {
    const anomalies = verifierCoherence(
      lot([
        ouvrage({
          id: 'p1',
          designation: 'Béton armé pour voiles',
          designationSource: 'Béton banché',
        }),
      ]),
    )
    const divergence = anomalies.find((a) => a.code === 'designation_divergente')
    expect(divergence?.severite).toBe('avertissement')
    expect(divergence?.message).toContain('Béton banché')
  })

  it('ne signale rien quand la désignation n’a pas bougé', () => {
    expect(
      codes(lot([ouvrage({ id: 'p1', designation: 'Identique', designationSource: 'Identique' })])),
    ).toEqual([])
  })

  it('signale une unité citée au texte qui contredit le DPGF', () => {
    const anomalies = verifierCoherence(
      lot([ouvrage({ id: 'p1', unite: 'M2', texteCctp: 'Béton mesuré en m3 en place.' })]),
    )
    const incoherence = anomalies.find((a) => a.code === 'unite_incoherente')
    expect(incoherence?.message).toContain('M3')
    expect(incoherence?.severite).toBe('avertissement')
  })

  it('ne signale rien quand le texte cite la bonne unité', () => {
    expect(
      codes(lot([ouvrage({ id: 'p1', unite: 'M3', texteCctp: 'Volume en m3 en place.' })])),
    ).toEqual([])
  })

  it('signale une quantité nulle et un prix à zéro', () => {
    const resultat = codes(
      lot([ouvrage({ id: 'p1', quantite: '0' }), ouvrage({ id: 'p2', prixUnitaireHtFinal: '0' })]),
    )
    expect(resultat).toContain('quantite_nulle')
    expect(resultat).toContain('prix_nul')
  })

  it('signale un ouvrage sans unité', () => {
    expect(codes(lot([ouvrage({ id: 'p1', unite: null })]))).toContain('unite_absente')
  })

  it('signale un lot déclaré mais vide', () => {
    const anomalies = verifierCoherence(lot([]))
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]?.code).toBe('lot_vide')
    expect(anomalies[0]?.severite).toBe('bloquante')
  })

  it('signale un lot qui ne contient que des chapitres', () => {
    const anomalies = verifierCoherence(
      lot([
        {
          ...ouvrage({ id: 'sl1' }),
          type: 'SOUS_LOT',
          texteCctp: null,
          unite: null,
          quantite: null,
          prixUnitaireHtFinal: null,
        },
      ]),
    )
    expect(anomalies.map((a) => a.code)).toContain('lot_vide')
  })

  it('signale une mission sans aucun lot', () => {
    const anomalies = verifierCoherence([])
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]?.code).toBe('mission_sans_lot')
  })

  it('porte un repère lisible vers la ligne concernée', () => {
    const anomalies = verifierCoherence(
      lot([ouvrage({ id: 'p1', code: '02.03.01', designation: 'Béton armé', texteCctp: null })]),
    )
    expect(anomalies[0]?.repere).toBe('Lot 02 — 02.03.01 · Béton armé')
  })
})

describe('synthèse', () => {
  it('bloque l’export dès une anomalie bloquante', () => {
    const synthese = synthetiser(verifierCoherence(lot([ouvrage({ id: 'p1', texteCctp: null })])))
    expect(synthese.nbBloquantes).toBe(1)
    expect(synthese.exportPossible).toBe(false)
  })

  it('laisse passer l’export avec des avertissements seuls', () => {
    const synthese = synthetiser(verifierCoherence(lot([ouvrage({ id: 'p1', quantite: '0' })])))
    expect(synthese.nbBloquantes).toBe(0)
    expect(synthese.nbAvertissements).toBe(1)
    expect(synthese.exportPossible).toBe(true)
  })

  it('rend une synthèse vide sur un chiffrage propre', () => {
    const synthese = synthetiser(verifierCoherence(lot([ouvrage({ id: 'p1' })])))
    expect(synthese.exportPossible).toBe(true)
    expect(synthese.anomalies).toHaveLength(0)
  })
})
