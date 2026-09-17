/**
 * Lecture d'un répertoire d'entreprises venu d'ailleurs.
 *
 * Ce qui compte : qu'aucune ligne ne disparaisse en silence, et qu'une valeur
 * douteuse soit signalée sans être corrigée d'autorité — c'est le fichier de
 * l'économiste, pas le nôtre.
 */
import { describe, expect, it } from 'vitest'
import {
  analyserLignes,
  clefComparaison,
  decouperCorpsEtat,
  devinerMappage,
  emailPlausible,
  siretValide,
  type MappageEntreprise,
} from './import'

describe('reconnaissance des colonnes', () => {
  it('reconnaît un en-tête ordinaire', () => {
    const mappage = devinerMappage([
      'Raison sociale',
      'SIRET',
      'Contact',
      'E-mail',
      'Téléphone',
      'Corps d’état',
      'Zone',
      'Notes',
    ])
    expect(mappage).toEqual({
      raisonSociale: 0,
      siret: 1,
      contactNom: 2,
      email: 3,
      telephone: 4,
      corpsEtatQualifies: 5,
      zoneIntervention: 6,
      historiqueNotes: 7,
    })
  })

  it('accepte les intitulés sans accent et en majuscules', () => {
    const mappage = devinerMappage(['ENTREPRISE', 'SIRET', 'COURRIEL', 'TEL'])
    expect(mappage.raisonSociale).toBe(0)
    expect(mappage.email).toBe(2)
    expect(mappage.telephone).toBe(3)
  })

  it('ne devine rien d’un en-tête vide, plutôt que d’inventer', () => {
    expect(devinerMappage(['', '', ''])).toEqual({})
  })

  it('n’attribue pas deux fois la même colonne', () => {
    const mappage = devinerMappage(['Nom', 'Nom du contact'])
    expect(mappage.raisonSociale).toBe(0)
    expect(mappage.contactNom).toBe(1)
  })
})

describe('SIRET', () => {
  it('accepte un SIRET dont la clé tombe juste', () => {
    // SIRET du siège de Google France, souvent cité comme exemple valide.
    expect(siretValide('73282932000074')).toBe(true)
  })

  it('refuse un chiffre modifié', () => {
    expect(siretValide('73282932000075')).toBe(false)
  })

  it('refuse ce qui n’a pas quatorze chiffres', () => {
    expect(siretValide('732829320')).toBe(false)
    expect(siretValide('732829320000741')).toBe(false)
  })

  it('accepte les SIRET de La Poste, qui échappent à la règle', () => {
    // Exception documentée par l'INSEE : les refuser serait refuser des SIRET
    // parfaitement valides.
    expect(siretValide('35600000000048')).toBe(true)
  })

  it('ignore l’habillage : espaces, points', () => {
    expect(siretValide('732 829 320 00074')).toBe(true)
  })
})

describe('courriel', () => {
  it('accepte une adresse ordinaire', () => {
    expect(emailPlausible('contact@maconnerie-creole.fr')).toBe(true)
  })

  it('refuse ce qui n’en est manifestement pas une', () => {
    expect(emailPlausible('Jean Dupont')).toBe(false)
    expect(emailPlausible('contact@')).toBe(false)
    expect(emailPlausible('contact@domaine')).toBe(false)
  })
})

describe('corps d’état', () => {
  it('sépare une cellule groupée', () => {
    expect(decouperCorpsEtat('Gros œuvre, Maçonnerie / VRD')).toEqual([
      'Gros œuvre',
      'Maçonnerie',
      'VRD',
    ])
  })

  it('ne rend rien d’une cellule vide', () => {
    expect(decouperCorpsEtat('  ')).toEqual([])
  })
})

describe('comparaison des raisons sociales', () => {
  it('ignore casse, accents et espaces multiples', () => {
    expect(clefComparaison('Maçonnerie Créole')).toBe(clefComparaison('MACONNERIE  CREOLE'))
  })

  it('ramène la ponctuation à un espace', () => {
    expect(clefComparaison('Dupont & Fils')).toBe('DUPONT FILS')
    expect(clefComparaison('S.A.R.L. Béton')).toBe('S A R L BETON')
  })

  it('distingue deux entreprises réellement différentes', () => {
    expect(clefComparaison('Dupont')).not.toBe(clefComparaison('Dupond'))
  })
})

describe('conversion des lignes', () => {
  const MAPPAGE: MappageEntreprise = {
    raisonSociale: 0,
    siret: 1,
    email: 2,
    corpsEtatQualifies: 3,
  }

  it('lit une ligne complète', () => {
    const resultat = analyserLignes(
      [['Maçonnerie Créole', '732 829 320 00074', 'contact@mc.fr', 'Gros œuvre, VRD']],
      MAPPAGE,
    )
    const entreprise = resultat.entreprises[0]
    expect(entreprise?.raisonSociale).toBe('Maçonnerie Créole')
    // Reconnu, donc rangé sous sa forme canonique.
    expect(entreprise?.siret).toBe('73282932000074')
    expect(entreprise?.corpsEtatQualifies).toEqual(['Gros œuvre', 'VRD'])
    expect(resultat.anomalies).toHaveLength(0)
  })

  it('écarte une ligne sans raison sociale, et le dit', () => {
    const resultat = analyserLignes([['', '73282932000074', '', '']], MAPPAGE)
    expect(resultat.entreprises).toHaveLength(0)
    expect(resultat.lignesRejetees).toBe(1)
    expect(resultat.anomalies[0]?.code).toBe('ligne_sans_nom')
    expect(resultat.anomalies[0]?.ligne).toBe(2)
  })

  it('signale un SIRET trop court sans le jeter', () => {
    const resultat = analyserLignes([['Dupont', '7328293', '', '']], MAPPAGE)
    expect(resultat.anomalies[0]?.code).toBe('siret_longueur')
    // La valeur d'origine reste : c'est à l'économiste de trancher.
    expect(resultat.entreprises[0]?.siret).toBe('7328293')
  })

  it('signale une clé de contrôle fausse sans la corriger', () => {
    const resultat = analyserLignes([['Dupont', '73282932000075', '', '']], MAPPAGE)
    expect(resultat.anomalies[0]?.code).toBe('siret_cle')
    expect(resultat.entreprises[0]?.siret).toBe('73282932000075')
  })

  it('signale un courriel improbable, en gardant la valeur', () => {
    const resultat = analyserLignes([['Dupont', '', 'Jean Dupont', '']], MAPPAGE)
    expect(resultat.anomalies[0]?.code).toBe('email_improbable')
    expect(resultat.entreprises[0]?.email).toBe('Jean Dupont')
  })

  it('repère un doublon par le SIRET, quelle que soit la graphie du nom', () => {
    const resultat = analyserLignes(
      [
        ['Maçonnerie Créole', '73282932000074', '', ''],
        ['MACONNERIE CREOLE SARL', '732 829 320 00074', '', ''],
      ],
      MAPPAGE,
    )
    expect(resultat.entreprises[1]?.doublonDansLeFichier).toBe(true)
    expect(resultat.anomalies[0]?.code).toBe('doublon_dans_le_fichier')
    expect(resultat.anomalies[0]?.message).toContain('ligne 2')
  })

  it('repère un doublon par le nom quand il n’y a pas de SIRET', () => {
    const resultat = analyserLignes(
      [
        ['Maçonnerie Créole', '', '', ''],
        ['maconnerie  creole', '', '', ''],
      ],
      MAPPAGE,
    )
    expect(resultat.entreprises[1]?.doublonDansLeFichier).toBe(true)
  })

  it('ne confond pas deux entreprises de même nom mais de SIRET différents', () => {
    const resultat = analyserLignes(
      [
        ['Dupont', '73282932000074', '', ''],
        ['Dupont', '35600000000048', '', ''],
      ],
      MAPPAGE,
    )
    expect(resultat.entreprises[1]?.doublonDansLeFichier).toBe(false)
  })

  it('numérote les lignes comme le tableur les montre', () => {
    const resultat = analyserLignes([['A', '', '', ''], ['', '', '', '']], MAPPAGE, 2)
    // Ligne 1 = l'en-tête, la première donnée est en ligne 2.
    expect(resultat.entreprises[0]?.ligne).toBe(2)
    expect(resultat.anomalies[0]?.ligne).toBe(3)
  })

  it('se contente de la raison sociale quand le reste manque', () => {
    const resultat = analyserLignes([['Dupont']], { raisonSociale: 0 })
    expect(resultat.entreprises[0]).toMatchObject({
      raisonSociale: 'Dupont',
      siret: null,
      email: null,
      corpsEtatQualifies: [],
    })
    expect(resultat.anomalies).toHaveLength(0)
  })
})
