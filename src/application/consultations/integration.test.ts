/**
 * Préparation du courriel de consultation, sur une vraie base.
 *
 * Ce qui compte : que le brouillon parte avec la bonne adresse et le bon lot,
 * que l'envoi soit noté au moment où il a lieu — c'est ce suivi qui déclenche
 * les relances — et qu'une entreprise sans adresse ne produise pas un envoi
 * fantôme dans le tableau.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import { creerMission } from '../missions/service'
import { creerLot } from '../chiffrage/structure'
import { creerEntreprise } from '../entreprises/service'
import { creerConsultation, listerConsultationsDuLot } from './service'
import { preparerCourrielConsultation } from './courriel'
import { dateEnToutesLettres } from '../../domain/consultations/courriel'

/**
 * Une échéance toujours à venir. Une date écrite en dur périmerait : ce test
 * s'est mis à échouer le jour où la date choisie est passée, en annonçant « sans
 * réponse » — ce qui était la bonne réponse, sur une mauvaise donnée d'essai.
 */
const DANS_UN_MOIS = new Date(Date.now() + 30 * 86_400_000)

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `courriel-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

let missionId = ''
let lotId = ''

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste' } })
  owner = utilisateur.id

  missionId = await creerMission(db(), {
    nomOperation: 'Groupe scolaire du Lorrain',
    typeOuvrage: 'TERTIAIRE',
    nature: 'CONSTRUCTION_NEUVE',
    typeMarche: 'PUBLIC',
    coefficientLocalDefaut: '1',
    precisionPu: 2,
    reference: `C-${SUFFIXE}`,
  })
  lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre — Maçonnerie' })
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

async function consultationPour(
  raisonSociale: string,
  email: string | null,
  dateLimiteRemise: Date | null = DANS_UN_MOIS,
): Promise<string> {
  const entrepriseId = await creerEntreprise(db(), { raisonSociale, email })
  return creerConsultation(db(), missionId, { lotId, entrepriseId, dateLimiteRemise })
}

async function statutDe(consultationId: string): Promise<string | undefined> {
  const liste = await listerConsultationsDuLot(db(), missionId, lotId)
  return liste.find((c) => c.id === consultationId)?.statut
}

describe('brouillon de courriel', () => {
  it('compose le message et note l’envoi', async () => {
    const id = await consultationPour('Maçonnerie Créole', 'contact@maconnerie-creole.mq')
    expect(await statutDe(id)).toBe('A_ENVOYER')

    const brouillon = await preparerCourrielConsultation(db(), missionId, id, {
      signature: 'Économiste 972',
      lienDossier: null,
    })

    expect(brouillon.destinataires).toEqual(['contact@maconnerie-creole.mq'])
    expect(brouillon.objet).toContain('Lot 02 Gros œuvre — Maçonnerie')
    expect(brouillon.objet).toContain('Groupe scolaire du Lorrain')
    expect(brouillon.corps).toContain(dateEnToutesLettres(DANS_UN_MOIS))
    expect(brouillon.adresse.startsWith('mailto:')).toBe(true)

    // L'envoi est noté : c'est lui qui fait courir les relances.
    expect(await statutDe(id)).toBe('ENVOYEE')
  })

  it('ne note pas d’envoi pour une entreprise sans adresse', async () => {
    // Rien ne partira : inscrire une date d'envoi serait inscrire un fait qui
    // n'a pas eu lieu, et le tableau de suivi mentirait (règle 7).
    const id = await consultationPour('Antilles Structures', null)

    const brouillon = await preparerCourrielConsultation(db(), missionId, id, {
      signature: null,
      lienDossier: null,
    })

    expect(brouillon.anomalies.some((a) => a.includes('Aucune adresse'))).toBe(true)
    expect(await statutDe(id)).toBe('A_ENVOYER')
  })

  it('ne réécrit pas une date d’envoi déjà posée', async () => {
    // Le bouton sert aussi à relancer : la relance ne doit pas effacer la date
    // du premier envoi, sur laquelle se compte le délai de remise.
    const id = await consultationPour('Bâti Sud Caraïbe', 'contact@batisud.mq')
    await preparerCourrielConsultation(db(), missionId, id, { signature: null, lienDossier: null })

    const premiere = (await listerConsultationsDuLot(db(), missionId, lotId)).find((c) => c.id === id)
      ?.dateEnvoiDce

    await preparerCourrielConsultation(db(), missionId, id, { signature: null, lienDossier: null })

    const seconde = (await listerConsultationsDuLot(db(), missionId, lotId)).find((c) => c.id === id)
      ?.dateEnvoiDce
    expect(seconde?.toISOString()).toBe(premiere?.toISOString())
  })

  it('annonce la pièce jointe tant qu’aucun lien n’est configuré', async () => {
    const id = await consultationPour('Cloisons de l’Est', 'n.belfort@cloisons-est.mq')
    const brouillon = await preparerCourrielConsultation(db(), missionId, id, {
      signature: null,
      lienDossier: null,
    })
    expect(brouillon.corps).toContain('joint au présent message')
    expect(brouillon.anomalies.some((a) => a.includes('joindre le dossier'))).toBe(true)
  })

  it('refuse une consultation d’une autre mission', async () => {
    const autre = await creerMission(db(), {
      nomOperation: 'Autre chantier',
      typeOuvrage: 'TERTIAIRE',
      nature: 'CONSTRUCTION_NEUVE',
      typeMarche: 'PRIVE',
      coefficientLocalDefaut: '1',
      precisionPu: 2,
      reference: `C2-${SUFFIXE}`,
    })
    const id = await consultationPour('Ouest Rénovation', 'contact@ouest-renovation.mq')

    await expect(
      preparerCourrielConsultation(db(), autre, id, { signature: null, lienDossier: null }),
    ).rejects.toThrow(/introuvable/)
  })
})
