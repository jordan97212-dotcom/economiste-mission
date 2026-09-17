/**
 * Ce brouillon part chez une entreprise : ce qu'il annonce engage l'économiste.
 * Les cas ci-dessous sont ceux où un message partirait faux sans rien dire —
 * adresse absente, lien manquant, message tronqué par la messagerie.
 */
import { describe, expect, it } from 'vitest'
import {
  adressePlausible,
  dateEnToutesLettres,
  LONGUEUR_MAX_ADRESSE,
  preparerBrouillon,
  type EntreeBrouillon,
} from './courriel'

const entree = (champs: Partial<EntreeBrouillon> = {}): EntreeBrouillon => ({
  destinataires: ['contact@maconnerie-creole.mq'],
  operation: 'Groupe scolaire du Lorrain',
  lotNumero: '02',
  lotIntitule: 'Gros œuvre — Maçonnerie',
  dateLimiteRemise: new Date('2026-09-15T00:00:00Z'),
  lienDossier: 'https://exemple.test/dce/abc123',
  signature: 'Économiste 972',
  ...champs,
})

describe('objet et corps', () => {
  it('porte le lot et l’opération dans l’objet', () => {
    // C'est ce que l'entreprise voit dans sa liste : il doit suffire à situer
    // l'affaire sans ouvrir le message.
    const { objet } = preparerBrouillon(entree())
    expect(objet).toBe('Consultation — Lot 02 Gros œuvre — Maçonnerie — Groupe scolaire du Lorrain')
  })

  it('annonce le lien et la date de remise', () => {
    const { corps } = preparerBrouillon(entree())
    expect(corps).toContain('https://exemple.test/dce/abc123')
    expect(corps).toContain('15 septembre 2026')
    expect(corps).toContain('Économiste 972')
  })

  it('annonce la pièce jointe quand il n’y a pas de lien', () => {
    // Le message ne doit jamais renvoyer nulle part.
    const { corps } = preparerBrouillon(entree({ lienDossier: null }))
    expect(corps).toContain('joint au présent message')
    expect(corps).not.toContain('télécharger')
  })

  it('tait la date de remise quand elle n’est pas fixée', () => {
    const { corps } = preparerBrouillon(entree({ dateLimiteRemise: null }))
    expect(corps).not.toContain('attendues pour')
  })
})

describe('adresse mailto', () => {
  it('encode les retours à la ligne et les accents', () => {
    const { adresse } = preparerBrouillon(entree())
    expect(adresse.startsWith('mailto:contact%40maconnerie-creole.mq?subject=')).toBe(true)
    expect(adresse).toContain('%0A')
    expect(adresse).not.toContain('\n')
    expect(adresse).not.toContain('œ')
  })

  it('sépare plusieurs destinataires par une virgule', () => {
    const { adresse } = preparerBrouillon(entree({ destinataires: ['a@b.fr', 'c@d.fr'] }))
    expect(adresse.startsWith('mailto:a%40b.fr,c%40d.fr?')).toBe(true)
  })
})

describe('anomalies', () => {
  it('signale l’absence d’adresse plutôt que d’ouvrir un message vide', () => {
    const { anomalies } = preparerBrouillon(entree({ destinataires: [] }))
    expect(anomalies.some((a) => a.includes('Aucune adresse'))).toBe(true)
  })

  it('signale une adresse qui n’en est pas une', () => {
    // Un `mailto:` avec une adresse fautive échoue sans le dire.
    const { anomalies } = preparerBrouillon(entree({ destinataires: ['contact chez batisud'] }))
    expect(anomalies.some((a) => a.includes('contact chez batisud'))).toBe(true)
  })

  it('rappelle de joindre le dossier quand il n’y a pas de lien', () => {
    const { anomalies } = preparerBrouillon(entree({ lienDossier: null }))
    expect(anomalies.some((a) => a.includes('joindre le dossier'))).toBe(true)
  })

  it('prévient quand le message dépasse ce qu’une messagerie accepte', () => {
    // Tronqué, il partirait coupé au milieu d'une phrase sans un mot d'alerte.
    const { anomalies, adresse } = preparerBrouillon(
      entree({ operation: 'Opération '.repeat(300) }),
    )
    expect(adresse.length).toBeGreaterThan(LONGUEUR_MAX_ADRESSE)
    expect(anomalies.some((a) => a.includes('trop long'))).toBe(true)
  })

  it('ne signale rien quand tout est en ordre', () => {
    expect(preparerBrouillon(entree()).anomalies).toEqual([])
  })
})

describe('adresse plausible', () => {
  it.each([
    ['contact@batisud.mq', true],
    ['s.marin@antilles-structures.fr', true],
    ['contact chez batisud', false],
    ['@batisud.mq', false],
    ['contact@batisud', false],
    ['a@b@c.fr', false],
    ['contact@.mq', false],
  ])('%s', (valeur, attendu) => {
    expect(adressePlausible(valeur as string)).toBe(attendu)
  })
})

describe('date en toutes lettres', () => {
  it('écrit le mois en clair', () => {
    // « 09/12 » se lit différemment des deux côtés de l'Atlantique.
    expect(dateEnToutesLettres(new Date('2026-12-09T00:00:00Z'))).toBe('9 décembre 2026')
  })
})
