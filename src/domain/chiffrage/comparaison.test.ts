import { describe, expect, it } from 'vitest'
import {
  comparerVersions,
  estChiffrageFige,
  type ChiffrageFige,
  type LigneFigee,
} from './comparaison'

/**
 * Ce qui compte : que l'écart soit exact au centime, et surtout qu'il soit
 * *attribué* — une ligne apparue et une quantité doublée ne se traitent pas de
 * la même façon, même quand elles pèsent le même montant.
 */

const ligne = (
  posteId: string,
  designation: string,
  montantHt: string,
  extra: Partial<LigneFigee> = {},
): LigneFigee => ({
  posteId,
  code: null,
  designation,
  unite: 'M3',
  quantite: '10',
  prixUnitaireHtFinal: '1000000',
  montantHt,
  ...extra,
})

const fige = (montantTceHt: string, lignes: readonly LigneFigee[]): ChiffrageFige => ({
  version: 1,
  montantTceHt,
  lots: [
    {
      lotId: 'lot-02',
      numero: '02',
      intitule: 'Gros œuvre',
      montantEstimeHt: montantTceHt,
      lignes,
    },
  ],
})

describe('reconnaissance d’un instantané', () => {
  it('reconnaît un instantané valide', () => {
    expect(estChiffrageFige(fige('1000', []))).toBe(true)
  })

  it('refuse ce qui n’en est pas un', () => {
    expect(estChiffrageFige(null)).toBe(false)
    expect(estChiffrageFige({})).toBe(false)
    expect(estChiffrageFige({ version: 2, lots: [] })).toBe(false)
  })
})

describe('écart global', () => {
  it('calcule l’écart au centime, sans passer par un flottant', () => {
    const avant = fige('10000000', [ligne('p1', 'Voile béton', '10000000')])
    const apres = fige('10000001', [ligne('p1', 'Voile béton', '10000001')])
    expect(comparerVersions(avant, apres).ecartMontantHt).toBe('1')
  })

  it('rend un écart négatif quand le chiffrage baisse', () => {
    const avant = fige('10000000', [ligne('p1', 'Voile béton', '10000000')])
    const apres = fige('8000000', [ligne('p1', 'Voile béton', '8000000')])
    const resultat = comparerVersions(avant, apres)
    expect(resultat.ecartMontantHt).toBe('-2000000')
    expect(resultat.ecartPourcent).toBe('-20.00')
  })

  it('ne rend aucun pourcentage quand on part de zéro', () => {
    // Partir de zéro et arriver à cent mille n'est pas « plus l'infini pour cent ».
    const resultat = comparerVersions(fige('0', []), fige('10000000', [ligne('p1', 'Neuf', '10000000')]))
    expect(resultat.ecartPourcent).toBe(null)
    expect(resultat.ecartMontantHt).toBe('10000000')
  })

  it('rend un écart nul entre deux versions identiques', () => {
    const v = fige('10000000', [ligne('p1', 'Voile béton', '10000000')])
    const resultat = comparerVersions(v, v)
    expect(resultat.ecartMontantHt).toBe('0')
    expect(resultat.ecartPourcent).toBe('0.00')
    expect(resultat.synthese.nbInchangees).toBe(1)
  })
})

describe('état des lignes', () => {
  it('distingue une ligne apparue d’une ligne modifiée', () => {
    const avant = fige('10000000', [ligne('p1', 'Voile béton', '10000000')])
    const apres = fige('15000000', [
      ligne('p1', 'Voile béton', '10000000'),
      ligne('p2', 'Dalle portée', '5000000'),
    ])
    const { synthese } = comparerVersions(avant, apres)
    expect(synthese.nbApparues).toBe(1)
    expect(synthese.nbModifiees).toBe(0)
    expect(synthese.nbInchangees).toBe(1)
  })

  it('attribue l’écart à l’apparition, pas à une modification', () => {
    // C'est tout l'intérêt : savoir si l'argent vient de lignes nouvelles ou de
    // lignes qui ont grossi.
    const avant = fige('10000000', [ligne('p1', 'Voile béton', '10000000')])
    const apres = fige('15000000', [
      ligne('p1', 'Voile béton', '10000000'),
      ligne('p2', 'Dalle portée', '5000000'),
    ])
    const { synthese } = comparerVersions(avant, apres)
    expect(synthese.ecartParApparitionHt).toBe('5000000')
    expect(synthese.ecartParModificationHt).toBe('0')
  })

  it('attribue l’écart à la modification quand une quantité change', () => {
    const avant = fige('10000000', [ligne('p1', 'Voile béton', '10000000', { quantite: '10' })])
    const apres = fige('20000000', [ligne('p1', 'Voile béton', '20000000', { quantite: '20' })])
    const { synthese, lots } = comparerVersions(avant, apres)
    expect(synthese.ecartParModificationHt).toBe('10000000')
    expect(synthese.ecartParApparitionHt).toBe('0')
    expect(lots[0]?.lignes[0]?.champsModifies).toEqual(['quantite'])
  })

  it('compte une ligne disparue et lui donne un écart négatif', () => {
    const avant = fige('15000000', [
      ligne('p1', 'Voile béton', '10000000'),
      ligne('p2', 'Dalle portée', '5000000'),
    ])
    const apres = fige('10000000', [ligne('p1', 'Voile béton', '10000000')])
    const { synthese, lots } = comparerVersions(avant, apres)
    expect(synthese.nbDisparues).toBe(1)
    const disparue = lots[0]?.lignes.find((l) => l.etat === 'disparue')
    expect(disparue?.designation).toBe('Dalle portée')
    expect(disparue?.ecartMontantHt).toBe('-5000000')
  })

  it('nomme les champs modifiés, pas seulement le montant', () => {
    const avant = fige('10000000', [
      ligne('p1', 'Voile béton', '10000000', { quantite: '10', prixUnitaireHtFinal: '1000000', unite: 'M3' }),
    ])
    const apres = fige('12000000', [
      ligne('p1', 'Voile béton banché', '12000000', { quantite: '10', prixUnitaireHtFinal: '1200000', unite: 'M2' }),
    ])
    expect(comparerVersions(avant, apres).lots[0]?.lignes[0]?.champsModifies).toEqual([
      'designation',
      'unite',
      'prixUnitaire',
    ])
  })

  it('tient pour inchangée une ligne dont seul le format du nombre a bougé', () => {
    // « 10 » et « 10.000 » sont la même quantité.
    const avant = fige('10000000', [ligne('p1', 'Voile béton', '10000000', { quantite: '10' })])
    const apres = fige('10000000', [ligne('p1', 'Voile béton', '10000000', { quantite: '10.000' })])
    expect(comparerVersions(avant, apres).synthese.nbInchangees).toBe(1)
  })
})

describe('appariement des lignes', () => {
  it('apparie par identifiant, même si la désignation a changé', () => {
    const avant = fige('10000000', [ligne('p1', 'Voile béton', '10000000')])
    const apres = fige('10000000', [ligne('p1', 'Voile béton banché ép. 20', '10000000')])
    const { synthese } = comparerVersions(avant, apres)
    expect(synthese.nbApparues).toBe(0)
    expect(synthese.nbDisparues).toBe(0)
    expect(synthese.nbModifiees).toBe(1)
  })

  it('retombe sur le code quand la ligne a été supprimée puis recréée', () => {
    // Sans ce repli, la ligne compterait pour une disparition et une apparition,
    // ce qui doublerait faussement l'écart attribué aux mouvements de lignes.
    const avant = fige('10000000', [ligne('ancien-id', 'Voile béton', '10000000', { code: '02.01' })])
    const apres = fige('12000000', [ligne('nouvel-id', 'Voile béton', '12000000', { code: '02.01' })])
    const { synthese } = comparerVersions(avant, apres)
    expect(synthese.nbModifiees).toBe(1)
    expect(synthese.nbApparues).toBe(0)
    expect(synthese.ecartParApparitionHt).toBe('0')
  })

  it('retombe sur la désignation quand il n’y a ni identifiant stable ni code', () => {
    const avant = fige('10000000', [ligne('ancien-id', 'Voile béton banché', '10000000')])
    const apres = fige('12000000', [ligne('nouvel-id', 'VOILE BÉTON BANCHÉ', '12000000')])
    expect(comparerVersions(avant, apres).synthese.nbModifiees).toBe(1)
  })

  it('n’apparie pas deux lignes quand le code est en double', () => {
    // Apparier au hasard inventerait une modification sur la mauvaise ligne.
    const avant = fige('20000000', [
      ligne('a1', 'Premier', '10000000', { code: '02.01' }),
      ligne('a2', 'Second', '10000000', { code: '02.01' }),
    ])
    const apres = fige('20000000', [
      ligne('b1', 'Premier bis', '10000000', { code: '02.01' }),
      ligne('b2', 'Second bis', '10000000', { code: '02.01' }),
    ])
    const { synthese } = comparerVersions(avant, apres)
    expect(synthese.nbApparues).toBe(2)
    expect(synthese.nbDisparues).toBe(2)
  })
})

describe('lots', () => {
  const avecDeuxLots: ChiffrageFige = {
    version: 1,
    montantTceHt: '15000000',
    lots: [
      { lotId: 'l2', numero: '02', intitule: 'Gros œuvre', montantEstimeHt: '10000000', lignes: [ligne('p1', 'Voile', '10000000')] },
      { lotId: 'l6', numero: '06', intitule: 'Menuiseries', montantEstimeHt: '5000000', lignes: [ligne('p2', 'Fenêtre', '5000000')] },
    ],
  }

  it('signale un lot apparu et un lot disparu', () => {
    const apres: ChiffrageFige = {
      version: 1,
      montantTceHt: '13000000',
      lots: [
        { lotId: 'l2', numero: '02', intitule: 'Gros œuvre', montantEstimeHt: '10000000', lignes: [ligne('p1', 'Voile', '10000000')] },
        { lotId: 'l14', numero: '14', intitule: 'Peinture', montantEstimeHt: '3000000', lignes: [ligne('p3', 'Peinture', '3000000')] },
      ],
    }
    const etats = Object.fromEntries(
      comparerVersions(avecDeuxLots, apres).lots.map((l) => [l.numero, l.etat]),
    )
    expect(etats).toEqual({ '02': 'inchange', '06': 'disparu', '14': 'apparu' })
  })

  it('range les lots par numéro, dans l’ordre du bordereau', () => {
    const apres: ChiffrageFige = {
      version: 1,
      montantTceHt: '15000000',
      lots: [...avecDeuxLots.lots].reverse(),
    }
    expect(comparerVersions(avecDeuxLots, apres).lots.map((l) => l.numero)).toEqual(['02', '06'])
  })

  it('donne l’écart de chaque lot, en euros et en pourcentage', () => {
    const apres: ChiffrageFige = {
      version: 1,
      montantTceHt: '17000000',
      lots: [
        { lotId: 'l2', numero: '02', intitule: 'Gros œuvre', montantEstimeHt: '12000000', lignes: [ligne('p1', 'Voile', '12000000')] },
        { lotId: 'l6', numero: '06', intitule: 'Menuiseries', montantEstimeHt: '5000000', lignes: [ligne('p2', 'Fenêtre', '5000000')] },
      ],
    }
    const lot = comparerVersions(avecDeuxLots, apres).lots[0]
    expect(lot?.ecartMontantHt).toBe('2000000')
    expect(lot?.ecartPourcent).toBe('20.00')
  })
})

describe('cas limites', () => {
  it('compare deux chiffrages vides sans broncher', () => {
    const vide: ChiffrageFige = { version: 1, montantTceHt: '0', lots: [] }
    const resultat = comparerVersions(vide, vide)
    expect(resultat.ecartMontantHt).toBe('0')
    expect(resultat.lots).toEqual([])
  })

  it('traite un lot vidé de toutes ses lignes', () => {
    const avant = fige('10000000', [ligne('p1', 'Voile', '10000000')])
    const apres = fige('0', [])
    const resultat = comparerVersions(avant, apres)
    expect(resultat.synthese.nbDisparues).toBe(1)
    expect(resultat.ecartMontantHt).toBe('-10000000')
  })

  it('accepte une ligne sans quantité ni prix', () => {
    const creuse = ligne('p1', 'Sous-total', '0', { quantite: null, prixUnitaireHtFinal: null })
    const resultat = comparerVersions(fige('0', [creuse]), fige('0', [creuse]))
    expect(resultat.synthese.nbInchangees).toBe(1)
  })
})
