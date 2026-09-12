import { describe, expect, it } from 'vitest'
import {
  analyserTexte,
  creerTexte,
  estTexteStructure,
  estVide,
  listerVariables,
  reconstruireTexte,
  resoudreVariables,
  unitesCitees,
} from './structure'

describe('analyse du texte structuré', () => {
  it('regroupe les lignes consécutives en un seul paragraphe', () => {
    const blocs = analyserTexte('Première ligne\nsuite de la phrase.\n\nAutre paragraphe.')
    expect(blocs).toEqual([
      { type: 'paragraphe', texte: 'Première ligne suite de la phrase.' },
      { type: 'paragraphe', texte: 'Autre paragraphe.' },
    ])
  })

  it('reconnaît les sous-titres et les puces', () => {
    const blocs = analyserTexte('## Origine des matériaux\n- béton conforme\n- acier certifié')
    expect(blocs).toEqual([
      { type: 'titre', texte: 'Origine des matériaux' },
      { type: 'puce', texte: 'béton conforme' },
      { type: 'puce', texte: 'acier certifié' },
    ])
  })

  it('accepte les variantes de puce', () => {
    expect(analyserTexte('• un\n* deux\n- trois').every((b) => b.type === 'puce')).toBe(true)
  })

  it('ignore les lignes vides et les espaces superflus', () => {
    expect(analyserTexte('\n\n   \n')).toEqual([])
    expect(estVide('   \n  ')).toBe(true)
    expect(estVide('a')).toBe(false)
  })

  it('supporte les fins de ligne Windows', () => {
    expect(analyserTexte('Un\r\n\r\nDeux')).toHaveLength(2)
  })

  it('fait un aller-retour stable', () => {
    const source = '## Titre\n\nUn paragraphe.\n\n- une puce'
    expect(reconstruireTexte(analyserTexte(source))).toBe(source)
  })
})

describe('enveloppe de stockage', () => {
  it('reconnaît un texte structuré et refuse le reste', () => {
    expect(estTexteStructure(creerTexte('bonjour'))).toBe(true)
    expect(estTexteStructure({ format: 'autre', contenu: 'x' })).toBe(false)
    expect(estTexteStructure({ contenu: 'x' })).toBe(false)
    expect(estTexteStructure(null)).toBe(false)
    expect(estTexteStructure('bonjour')).toBe(false)
  })

  it('mémorise la désignation au moment de l’écriture', () => {
    expect(creerTexte('texte', 'Béton armé').designationSource).toBe('Béton armé')
    expect(creerTexte('texte').designationSource).toBeNull()
  })
})

describe('variables de mission', () => {
  const variables = { nom_operation: 'Les Flamboyants', maitre_ouvrage: 'SIMAR' }

  it('remplace les variables connues', () => {
    const resultat = resoudreVariables(
      'Opération {{nom_operation}} pour {{maitre_ouvrage}}.',
      variables,
    )
    expect(resultat.texte).toBe('Opération Les Flamboyants pour SIMAR.')
    expect(resultat.manquantes).toEqual([])
  })

  it('tolère les espaces dans les accolades', () => {
    expect(resoudreVariables('{{ nom_operation }}', variables).texte).toBe('Les Flamboyants')
  })

  it('laisse la marque visible et signale une variable absente', () => {
    const resultat = resoudreVariables('Montant : {{montant_travaux_ht}}.', variables)
    expect(resultat.texte).toBe('Montant : {{montant_travaux_ht}}.')
    expect(resultat.manquantes).toEqual(['montant_travaux_ht'])
  })

  it('traite une valeur vide comme absente', () => {
    const resultat = resoudreVariables('{{maitre_oeuvre}}', { maitre_oeuvre: '' })
    expect(resultat.manquantes).toEqual(['maitre_oeuvre'])
  })

  it('liste les variables sans les résoudre', () => {
    expect(listerVariables('{{a}} et {{b}} et encore {{a}}')).toEqual(['a', 'b'])
  })
})

describe('unités citées dans un texte', () => {
  it('repère les unités courantes', () => {
    expect(unitesCitees('Béton coulé, mesuré en m3.')).toEqual(['M3'])
    expect(unitesCitees('Surface en m² relevée au sol.')).toEqual(['M2'])
    expect(unitesCitees('Longueur en ml.')).toEqual(['ML'])
    expect(unitesCitees('Prestation au forfait.')).toEqual(['FORFAIT'])
  })

  it('ne confond pas un mot contenant une abréviation', () => {
    expect(unitesCitees('Le mlange nest pas une unite')).toEqual([])
  })

  it('rend une liste vide quand aucune unité n’est citée', () => {
    expect(unitesCitees('Texte sans mesure.')).toEqual([])
  })
})
