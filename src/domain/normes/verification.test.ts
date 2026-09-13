import { describe, expect, it } from 'vitest'
import {
  DELAI_REVERIFICATION_MOIS,
  normesAAjouter,
  synthetiserNormes,
  verifierNormes,
  type NormeConnue,
  type TexteAVerifier,
} from './verification'

const AUJOURDHUI = new Date('2026-09-13')
const RECENT = new Date('2026-06-01')
const VIEUX = new Date('2024-01-15')

function norme(partiel: Partial<NormeConnue> & { reference: string }): NormeConnue {
  return {
    titre: null,
    statut: 'EN_VIGUEUR',
    dateEdition: null,
    dateVerification: RECENT,
    remplaceePar: null,
    ...partiel,
  }
}

function texte(contenu: string): TexteAVerifier[] {
  return [{ posteId: 'p1', repere: 'Lot 02 · 02.03.01 Béton armé', contenu }]
}

describe('contrôle des normes citées', () => {
  it('ne dit rien d’une norme en vigueur vérifiée récemment', () => {
    const anomalies = verifierNormes(
      texte('Conformément au NF DTU 21.'),
      [norme({ reference: 'NF DTU 21' })],
      AUJOURDHUI,
    )
    expect(anomalies).toEqual([])
  })

  it('bloque sur une norme annulée', () => {
    // Prescrire un document qui n'existe plus est une erreur, pas un détail.
    const [anomalie] = verifierNormes(
      texte('Selon le NF DTU 20.1.'),
      [norme({ reference: 'NF DTU 20.1', statut: 'ANNULEE' })],
      AUJOURDHUI,
    )
    expect(anomalie?.code).toBe('norme_annulee')
    expect(anomalie?.severite).toBe('bloquante')
  })

  it('avertit sur une norme remplacée et nomme le remplacement', () => {
    const [anomalie] = verifierNormes(
      texte('Selon le NF DTU 13.3.'),
      [norme({ reference: 'NF DTU 13.3', statut: 'REMPLACEE', remplaceePar: 'NF DTU 13.3 P1-1' })],
      AUJOURDHUI,
    )
    expect(anomalie?.code).toBe('norme_remplacee')
    expect(anomalie?.severite).toBe('avertissement')
    expect(anomalie?.remplacement).toBe('NF DTU 13.3 P1-1')
    expect(anomalie?.message).toContain('NF DTU 13.3 P1-1')
  })

  it('n’invente pas un remplacement quand la source n’en nomme aucun', () => {
    const [anomalie] = verifierNormes(
      texte('Selon le NF DTU 13.3.'),
      [norme({ reference: 'NF DTU 13.3', statut: 'REMPLACEE' })],
      AUJOURDHUI,
    )
    expect(anomalie?.remplacement).toBeNull()
    expect(anomalie?.message).toContain('sans que la référence de remplacement soit renseignée')
  })

  it('avertit sur une norme encore à l’état de projet', () => {
    const [anomalie] = verifierNormes(
      texte('Voir PR NF DTU 67.1.'),
      [norme({ reference: 'NF DTU 67.1', statut: 'PROJET' })],
      AUJOURDHUI,
    )
    expect(anomalie?.code).toBe('norme_projet')
  })

  it('signale une norme citée mais absente du référentiel', () => {
    const [anomalie] = verifierNormes(texte('Selon le NF DTU 26.1.'), [], AUJOURDHUI)
    expect(anomalie?.code).toBe('norme_inconnue')
    expect(anomalie?.severite).toBe('avertissement')
  })

  it('signale un statut vérifié il y a trop longtemps', () => {
    const [anomalie] = verifierNormes(
      texte('Selon le NF DTU 21.'),
      [norme({ reference: 'NF DTU 21', dateVerification: VIEUX })],
      AUJOURDHUI,
    )
    expect(anomalie?.code).toBe('statut_ancien')
    expect(anomalie?.message).toContain('15 janvier 2024')
  })

  it('signale une norme en vigueur sans aucune date de vérification', () => {
    const [anomalie] = verifierNormes(
      texte('Selon le NF DTU 21.'),
      [norme({ reference: 'NF DTU 21', dateVerification: null })],
      AUJOURDHUI,
    )
    expect(anomalie?.code).toBe('statut_ancien')
    expect(anomalie?.message).toContain('sans date de vérification')
  })

  it('accepte un statut vérifié juste avant le délai, refuse juste après', () => {
    const limite = new Date(AUJOURDHUI)
    limite.setMonth(limite.getMonth() - DELAI_REVERIFICATION_MOIS)
    const veille = new Date(limite)
    veille.setMonth(veille.getMonth() + 1)

    const aLaLimite = verifierNormes(
      texte('NF DTU 21'),
      [norme({ reference: 'NF DTU 21', dateVerification: limite })],
      AUJOURDHUI,
    )
    const enDeca = verifierNormes(
      texte('NF DTU 21'),
      [norme({ reference: 'NF DTU 21', dateVerification: veille })],
      AUJOURDHUI,
    )
    expect(aLaLimite).toHaveLength(1)
    expect(enDeca).toEqual([])
  })

  it('rattache l’anomalie à l’ouvrage, pour pouvoir y aller', () => {
    const [anomalie] = verifierNormes(
      texte('Selon le NF DTU 20.1.'),
      [norme({ reference: 'NF DTU 20.1', statut: 'ANNULEE' })],
      AUJOURDHUI,
    )
    expect(anomalie?.posteId).toBe('p1')
    expect(anomalie?.repere).toBe('Lot 02 · 02.03.01 Béton armé')
  })

  it('relève la même norme dans chacun des textes qui la citent', () => {
    const textes: TexteAVerifier[] = [
      { posteId: 'p1', repere: 'A', contenu: 'NF DTU 20.1' },
      { posteId: 'p2', repere: 'B', contenu: 'NF DTU 20.1' },
    ]
    const anomalies = verifierNormes(
      textes,
      [norme({ reference: 'NF DTU 20.1', statut: 'ANNULEE' })],
      AUJOURDHUI,
    )
    expect(anomalies.map((a) => a.posteId)).toEqual(['p1', 'p2'])
  })

  it('ne dit rien d’un texte qui ne cite aucune norme', () => {
    expect(verifierNormes(texte('Carrelage grès cérame.'), [], AUJOURDHUI)).toEqual([])
  })
})

describe('synthèse', () => {
  it('compte les normes distinctes citées et les anomalies par sévérité', () => {
    const textes: TexteAVerifier[] = [
      { posteId: 'p1', repere: 'A', contenu: 'NF DTU 20.1 et NF DTU 21' },
      { posteId: 'p2', repere: 'B', contenu: 'NF DTU 21' },
    ]
    const referentiel = [
      norme({ reference: 'NF DTU 20.1', statut: 'ANNULEE' }),
      norme({ reference: 'NF DTU 21' }),
    ]
    const anomalies = verifierNormes(textes, referentiel, AUJOURDHUI)
    const synthese = synthetiserNormes(textes, anomalies)

    expect(synthese.citees).toBe(2)
    expect(synthese.bloquantes).toBe(1)
    expect(synthese.avertissements).toBe(0)
    expect(synthese.aRevoir).toEqual(['NF DTU 20.1'])
  })
})

describe('amorçage du référentiel depuis les textes existants', () => {
  it('rend les normes citées qui manquent au référentiel, sans doublon', () => {
    const textes: TexteAVerifier[] = [
      { posteId: 'p1', repere: 'A', contenu: 'NF DTU 20.1, NF EN 206/CN' },
      { posteId: 'p2', repere: 'B', contenu: 'NF DTU 20.1, NF DTU 26.1' },
    ]
    const manquantes = normesAAjouter(textes, [norme({ reference: 'NF EN 206/CN' })])
    expect(manquantes.map((c) => c.reference)).toEqual(['NF DTU 20.1', 'NF DTU 26.1'])
  })

  it('ne rend rien quand le référentiel couvre déjà tout', () => {
    expect(
      normesAAjouter(
        [{ posteId: 'p1', repere: 'A', contenu: 'NF DTU 21' }],
        [norme({ reference: 'NF DTU 21' })],
      ),
    ).toEqual([])
  })
})
