import { describe, expect, it } from 'vitest'
import * as PU from '../money/prix-unitaire'
import { ecartPrixPourcent, preparerReinjection, type PosteChiffre } from './reinjection'

const pu = (valeur: string) => PU.depuisEuros(valeur)

const POSTES: PosteChiffre[] = [
  { posteId: 'p1', code: '02.01', designation: 'Voile béton', unite: 'M3', prixEstimeHt: pu('250') },
  { posteId: 'p2', code: '02.02', designation: 'Dalle pleine', unite: 'M2', prixEstimeHt: pu('95') },
]

describe('préparation de la réinjection', () => {
  it('verse le prix de l’offre retenue, pas celui de l’estimatif', () => {
    const { candidats } = preparerReinjection(
      POSTES,
      [{ posteId: 'p1', prixUnitaireHt: pu('268.40') }],
      [],
    )
    expect(candidats).toHaveLength(1)
    expect(candidats[0]?.prixReelHt).toEqual(pu('268.40'))
    expect(candidats[0]?.prixEstimeHt).toEqual(pu('250'))
  })

  it('écarte un poste que l’entreprise n’a pas chiffré, en le disant', () => {
    const { candidats, ecartes } = preparerReinjection(
      POSTES,
      [{ posteId: 'p1', prixUnitaireHt: pu('268.40') }],
      [],
    )
    expect(candidats.map((c) => c.posteId)).toEqual(['p1'])
    expect(ecartes).toEqual([
      { posteId: 'p2', designation: 'Dalle pleine', motif: 'non_chiffre_par_entreprise' },
    ])
  })

  it('écarte un prix nul plutôt que de polluer la base', () => {
    const { candidats, ecartes } = preparerReinjection(
      [POSTES[0]!],
      [{ posteId: 'p1', prixUnitaireHt: pu('0') }],
      [],
    )
    expect(candidats).toEqual([])
    expect(ecartes[0]?.motif).toBe('prix_nul')
  })

  it('écarte un poste sans unité : un prix sans unité n’est comparable à rien', () => {
    const { candidats, ecartes } = preparerReinjection(
      [{ posteId: 'p3', code: null, designation: 'Divers', unite: null, prixEstimeHt: null }],
      [{ posteId: 'p3', prixUnitaireHt: pu('100') }],
      [],
    )
    expect(candidats).toEqual([])
    expect(ecartes[0]?.motif).toBe('sans_unite')
  })

  it('signale une entrée déjà présente sans pour autant l’écarter', () => {
    // C'est à l'économiste de décider s'il verse un deuxième relevé : deux
    // prix pour un même ouvrage, c'est de la dispersion, pas un doublon.
    const { candidats } = preparerReinjection(
      POSTES,
      [
        { posteId: 'p1', prixUnitaireHt: pu('268.40') },
        { posteId: 'p2', prixUnitaireHt: pu('101') },
      ],
      [{ code: '02.01', designation: 'Autre libellé' }],
    )
    expect(candidats.find((c) => c.posteId === 'p1')?.dejaEnBase).toBe(true)
    expect(candidats.find((c) => c.posteId === 'p2')?.dejaEnBase).toBe(false)
  })

  it('repère un doublon par la désignation, accents et casse ignorés', () => {
    const { candidats } = preparerReinjection(
      POSTES,
      [{ posteId: 'p1', prixUnitaireHt: pu('268.40') }],
      [{ code: null, designation: 'VOILE BETON' }],
    )
    expect(candidats[0]?.dejaEnBase).toBe(true)
  })

  it('ne rend rien quand aucun poste n’est chiffré par l’entreprise', () => {
    const { candidats, ecartes } = preparerReinjection(POSTES, [], [])
    expect(candidats).toEqual([])
    expect(ecartes).toHaveLength(2)
  })
})

describe('écart entre prix réel et estimatif', () => {
  it('calcule l’écart en pourcentage', () => {
    const { candidats } = preparerReinjection(
      [POSTES[0]!],
      [{ posteId: 'p1', prixUnitaireHt: pu('275') }],
      [],
    )
    expect(ecartPrixPourcent(candidats[0]!)).toBe('10.00')
  })

  it('rend null sans estimatif, plutôt qu’un chiffre inventé', () => {
    const { candidats } = preparerReinjection(
      [{ posteId: 'p9', code: null, designation: 'Ouvrage', unite: 'U', prixEstimeHt: null }],
      [{ posteId: 'p9', prixUnitaireHt: pu('100') }],
      [],
    )
    expect(ecartPrixPourcent(candidats[0]!)).toBeNull()
  })
})
