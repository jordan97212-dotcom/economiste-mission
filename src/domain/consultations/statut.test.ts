/**
 * Le suivi de consultation est ce que l'économiste regarde pour décider d'une
 * relance. Les cas ci-dessous sont ceux où un statut rangé en base se mettait à
 * mentir : la veille de la remise, le jour même, et après le retrait d'une offre.
 */
import { describe, expect, it } from 'vitest'
import { joursAvantRemise, statutDe, type FaitsConsultation } from './statut'

const LE_15 = new Date('2026-09-15T00:00:00Z')

const faits = (champs: Partial<FaitsConsultation> = {}): FaitsConsultation => ({
  dateEnvoiDce: new Date('2026-08-24T00:00:00Z'),
  dateLimiteRemise: new Date('2026-09-15T00:00:00Z'),
  dateRelance: null,
  nbOffres: 0,
  desiste: false,
  ...champs,
})

describe('statut déduit', () => {
  it('reste « à envoyer » tant que le DCE n’est pas parti', () => {
    // Une consultation créée n'est pas une consultation envoyée : la ligne
    // existe, le dossier est encore sur le bureau.
    expect(statutDe(faits({ dateEnvoiDce: null }), LE_15)).toBe('A_ENVOYER')
  })

  it('passe à « envoyée » dès que la date d’envoi est posée', () => {
    expect(statutDe(faits(), LE_15)).toBe('ENVOYEE')
  })

  it('montre la relance quand elle a eu lieu', () => {
    expect(statutDe(faits({ dateRelance: new Date('2026-09-08T00:00:00Z') }), LE_15)).toBe('RELANCEE')
  })

  it('laisse la journée entière de la date limite', () => {
    // Une remise attendue le 15 court jusqu'au soir du 15 : basculer « sans
    // réponse » le matin même ferait relancer une entreprise encore dans les
    // temps.
    const leSoirDu15 = new Date('2026-09-15T23:30:00Z')
    expect(statutDe(faits(), leSoirDu15)).toBe('ENVOYEE')
  })

  it('bascule « sans réponse » le lendemain de la remise', () => {
    expect(statutDe(faits(), new Date('2026-09-16T00:05:00Z'))).toBe('SANS_REPONSE')
  })

  it('ne réclame rien quand aucune date limite n’est fixée', () => {
    expect(statutDe(faits({ dateLimiteRemise: null }), new Date('2027-01-01T00:00:00Z'))).toBe('ENVOYEE')
  })

  it('l’offre reçue prime sur le calendrier', () => {
    // Une offre remise en retard reste une offre : c'est l'économiste qui juge
    // de sa recevabilité, pas le tableau de suivi.
    expect(statutDe(faits({ nbOffres: 1 }), new Date('2026-10-01T00:00:00Z'))).toBe('OFFRE_RECUE')
  })

  it('retrouve le bon statut quand l’offre est retirée', () => {
    // C'est le défaut d'origine : supprimer une offre reposait « envoyée » sur
    // une consultation dont la remise était close.
    const apresRetrait = faits({ nbOffres: 0 })
    expect(statutDe(apresRetrait, new Date('2026-10-01T00:00:00Z'))).toBe('SANS_REPONSE')
  })

  it('le désistement prime sur tout le reste', () => {
    expect(statutDe(faits({ desiste: true, nbOffres: 2 }), LE_15)).toBe('DESISTEMENT')
  })
})

describe('jours avant la remise', () => {
  it('compte les jours restants', () => {
    expect(joursAvantRemise(new Date('2026-09-18T00:00:00Z'), LE_15)).toBe(3)
  })

  it('rend zéro le jour de la remise', () => {
    expect(joursAvantRemise(LE_15, LE_15)).toBe(0)
  })

  it('devient négatif une fois la date passée', () => {
    expect(joursAvantRemise(new Date('2026-09-10T00:00:00Z'), LE_15)).toBe(-5)
  })

  it('ne rend rien sans date limite', () => {
    expect(joursAvantRemise(null, LE_15)).toBeNull()
  })
})
