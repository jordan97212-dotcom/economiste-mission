import { describe, expect, it } from 'vitest'
import {
  apparierTrames,
  motsSignificatifs,
  ressemblance,
  synthetiserAppariement,
  SEUIL_CERTITUDE,
  SEUIL_PROPOSITION,
  type PosteAApparier,
  type TrameCandidate,
} from './appariement'

const GROS_OEUVRE = 'corps-02'
const PEINTURE = 'corps-14'

const poste = (
  posteId: string,
  designation: string,
  aDejaUnTexte = false,
): PosteAApparier => ({ posteId, designation, aDejaUnTexte })

const trame = (
  trameId: string,
  intitule: string,
  corpsEtatId: string | null = GROS_OEUVRE,
): TrameCandidate => ({ trameId, intitule, corpsEtatId })

describe('mots significatifs', () => {
  it('ignore accents et pluriels, pour que « voiles » rejoigne « voile »', () => {
    expect(motsSignificatifs('Voiles bétons')).toEqual(motsSignificatifs('voile beton'))
  })

  it('écarte les mots trop fréquents pour distinguer quoi que ce soit', () => {
    // Sans cela, « fourniture et pose de carrelage » ressemblerait à
    // « fourniture et pose de faïence ».
    expect([...motsSignificatifs('Fourniture et pose de carrelage')]).toEqual(['carrelage'])
  })

  it('garde les nombres : « 20 » distingue un voile de 20 d’un voile de 16', () => {
    expect(motsSignificatifs('Voile ép. 20 cm').has('20')).toBe(true)
  })

  it('rend un ensemble vide sur une désignation sans rien de significatif', () => {
    expect(motsSignificatifs('de la et des')).toEqual(new Set())
    expect(motsSignificatifs('')).toEqual(new Set())
  })
})

describe('ressemblance', () => {
  it('vaut 1 pour deux désignations identiques au pluriel près', () => {
    expect(ressemblance('Voile béton banché', 'Voiles bétons banchés')).toBe(1)
  })

  it('vaut 0 quand rien n’est commun', () => {
    expect(ressemblance('Voile béton banché', 'Peinture glycéro')).toBe(0)
  })

  it('vaut 0 quand une désignation ne porte aucun mot significatif', () => {
    expect(ressemblance('de la', 'Voile béton')).toBe(0)
  })

  it('est symétrique', () => {
    const a = 'Voile béton banché ép. 20 cm'
    const b = 'Voiles béton armé'
    expect(ressemblance(a, b)).toBe(ressemblance(b, a))
  })

  it('note plus haut la désignation la plus proche', () => {
    const cible = 'Carrelage grès cérame 30x30'
    expect(ressemblance(cible, 'Carrelage grès cérame')).toBeGreaterThan(
      ressemblance(cible, 'Faïence murale'),
    )
  })
})

describe('appariement', () => {
  const trames = [
    trame('t-voile', 'Voile béton armé'),
    trame('t-dalle', 'Dalle portée béton armé'),
    trame('t-peinture', 'Peinture glycéro', PEINTURE),
    trame('t-general', 'Généralités du lot', null),
  ]

  it('rapproche chaque ouvrage de la trame qui lui ressemble le plus', () => {
    const resultat = apparierTrames(
      [poste('p1', 'Voile béton banché ép. 20 cm'), poste('p2', 'Dalle portée béton armé')],
      trames,
      GROS_OEUVRE,
    )
    expect(resultat.map((a) => a.trameId)).toEqual(['t-voile', 't-dalle'])
  })

  it('n’utilise pas les trames d’un autre corps d’état', () => {
    // Une trame de peinture n'a rien à faire dans un lot de gros œuvre.
    const resultat = apparierTrames([poste('p1', 'Peinture glycéro')], trames, GROS_OEUVRE)
    expect(resultat[0]?.trameId).toBe(null)
    expect(resultat[0]?.motif).toBe('aucune_correspondance')
  })

  it('accepte les généralités, qui valent pour tous les corps d’état', () => {
    const resultat = apparierTrames([poste('p1', 'Généralités du lot')], trames, GROS_OEUVRE)
    expect(resultat[0]?.trameId).toBe('t-general')
  })

  it('laisse tel quel un ouvrage qui a déjà un texte', () => {
    // La génération complète le CCTP, elle ne le réécrit pas.
    const resultat = apparierTrames([poste('p1', 'Voile béton armé', true)], trames, GROS_OEUVRE)
    expect(resultat[0]?.trameId).toBe(null)
    expect(resultat[0]?.motif).toBe('texte_deja_present')
  })

  it('ne propose rien quand la ressemblance tient du hasard', () => {
    const resultat = apparierTrames(
      [poste('p1', 'Signalisation horizontale de parking')],
      trames,
      GROS_OEUVRE,
    )
    expect(resultat[0]?.motif).toBe('aucune_correspondance')
    expect(resultat[0]?.score).toBe(0)
  })

  it('distingue une correspondance franche d’une correspondance à vérifier', () => {
    const resultat = apparierTrames(
      [poste('p1', 'Voile béton armé'), poste('p2', 'Voile béton banché ép. 20 cm')],
      trames,
      GROS_OEUVRE,
    )
    expect(resultat[0]?.sur).toBe(true)
    expect(resultat[0]?.score).toBeGreaterThanOrEqual(SEUIL_CERTITUDE)
    expect(resultat[1]?.trameId).toBe('t-voile')
    expect(resultat[1]?.score).toBeGreaterThanOrEqual(SEUIL_PROPOSITION)
  })

  it('arrondit le score à deux décimales, pour un affichage lisible', () => {
    const resultat = apparierTrames([poste('p1', 'Voile béton banché ép. 20 cm')], trames, GROS_OEUVRE)
    const score = resultat[0]?.score ?? 0
    expect(Number(score.toFixed(2))).toBe(score)
  })

  it('rend une proposition par ouvrage, même sans aucune trame', () => {
    const resultat = apparierTrames([poste('p1', 'Voile béton')], [], GROS_OEUVRE)
    expect(resultat).toHaveLength(1)
    expect(resultat[0]?.motif).toBe('aucune_correspondance')
  })

  it('rend une liste vide quand le lot n’a aucun ouvrage', () => {
    expect(apparierTrames([], trames, GROS_OEUVRE)).toEqual([])
  })

  it('n’utilise que les généralités quand le lot n’a pas de corps d’état', () => {
    const resultat = apparierTrames([poste('p1', 'Voile béton armé')], trames, null)
    expect(resultat[0]?.trameId).toBe(null)
  })
})

describe('synthèse', () => {
  it('compte séparément les sûrs, les incertains, les absents et les déjà rédigés', () => {
    const trames = [trame('t-voile', 'Voile béton armé')]
    const resultat = apparierTrames(
      [
        poste('p1', 'Voile béton armé'),
        poste('p2', 'Voile béton banché ép. 20 cm'),
        poste('p3', 'Signalisation horizontale'),
        poste('p4', 'Voile béton armé', true),
      ],
      trames,
      GROS_OEUVRE,
    )

    expect(synthetiserAppariement(resultat)).toEqual({
      nbPostes: 4,
      nbSurs: 1,
      nbIncertains: 1,
      nbSansTrame: 1,
      nbDejaRediges: 1,
    })
  })

  it('compte zéro partout sur une liste vide', () => {
    expect(synthetiserAppariement([])).toEqual({
      nbPostes: 0,
      nbSurs: 0,
      nbIncertains: 0,
      nbSansTrame: 0,
      nbDejaRediges: 0,
    })
  })
})
