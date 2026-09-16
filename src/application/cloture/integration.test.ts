/**
 * Clôture d'opération, vérifiée sur une vraie base.
 *
 * Ce qui compte ici : que le prix versé dans la base personnelle soit celui de
 * l'offre retenue et jamais l'estimatif, et que rien n'entre en base sans
 * avoir été explicitement choisi.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import * as PU from '../../domain/money/prix-unitaire'
import { creerMission } from '../missions/service'
import { ajouterPoste, creerLot } from '../chiffrage/structure'
import { enregistrerModifications } from '../chiffrage/service'
import { creerEntreprise } from '../entreprises/service'
import { creerConsultation } from '../consultations/service'
import { enregistrerOffreGlobale } from '../offres/service'
import { retenirOffre } from '../marche/service'
import { creerSituation } from '../situations/service'
import { creerAvenant } from '../avenants/service'
import { listerPrix } from '../prix/service'
import {
  candidatsReinjection,
  chargerDecompteGeneral,
  chargerEtatCloture,
  cloturerMission,
  rouvrirMission,
  verserPrix,
} from './service'

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `cloture-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

const MISSION = {
  nomOperation: 'École des Trois-Îlets',
  typeOuvrage: 'SCOLAIRE',
  nature: 'CONSTRUCTION_NEUVE',
  typeMarche: 'PUBLIC',
  surfaceShon: '900',
  coefficientLocalDefaut: '1.25',
  precisionPu: 2,
  maitreOuvrage: 'Commune des Trois-Îlets',
}

let missionId = ''
let lotId = ''
let posteA = ''
let posteB = ''
let offreId = ''

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste test' } })
  owner = utilisateur.id

  missionId = await creerMission(db(), { ...MISSION, reference: `C-${SUFFIXE}` })
  lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
  posteA = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
  posteB = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })

  // Estimatif : 200 € de base × 1,25 = 250 € le m³.
  await enregistrerModifications(db(), missionId, [
    {
      id: posteA,
      code: '02.01',
      designation: 'Voile béton',
      unite: 'M3',
      quantite: '100',
      prixUnitaireHtBase: PU.depuisEuros('200').toString(),
    },
    {
      id: posteB,
      code: '02.02',
      designation: 'Dalle pleine',
      unite: 'M2',
      quantite: '200',
      prixUnitaireHtBase: PU.depuisEuros('80').toString(),
    },
  ])

  const entrepriseId = await creerEntreprise(db(), { raisonSociale: 'Trois-Îlets Construction' })
  const consultationId = await creerConsultation(db(), missionId, { lotId, entrepriseId })
  offreId = await enregistrerOffreGlobale(db(), missionId, consultationId, {
    montantHt: '42000',
    dateReception: new Date('2026-10-01'),
  })

  // L'entreprise n'a chiffré ligne à ligne que le premier poste, à 268,40 €.
  await brut.ligneOffre.create({
    data: {
      offreId,
      posteId: posteA,
      prixUnitaireHt: PU.depuisEuros('268.40') as bigint,
      montantHt: 2_684_000n,
    },
  })

  await retenirOffre(db(), missionId, lotId, offreId)
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

describe('décompte général', () => {
  it('rassemble marché, exécuté et retenue par lot puis pour l’opération', async () => {
    await creerSituation(db(), missionId, lotId, {
      periode: new Date('2026-12-31'),
      avancementPourcent: '100',
      retenueGarantieHt: '2100',
    })
    await creerAvenant(db(), missionId, {
      lotId,
      objet: 'Ajustement de fondations',
      montantHt: '3000',
      date: new Date('2027-01-15'),
      statut: 'ACCEPTE',
    })

    const decompte = await chargerDecompteGeneral(db(), missionId)

    expect(decompte.lots).toHaveLength(1)
    expect(decompte.lots[0]?.marcheInitialHt).toBe('4200000') // 42 000 €
    expect(decompte.lots[0]?.marcheActuelHt).toBe('4500000') // + 3 000 € d'avenant
    expect(decompte.lots[0]?.travauxExecutesHt).toBe('4200000') // situation à 100 % du marché d'alors
    expect(decompte.lots[0]?.retenueGarantieARestituerHt).toBe('210000') // 2 100 €
    expect(decompte.lots[0]?.netRegleHt).toBe('3990000') // 42 000 − 2 100
    expect(decompte.soldeNonExecuteHt).toBe('300000') // l'avenant reste à exécuter
  })
})

describe('réinjection des prix réels', () => {
  it('propose le prix de l’offre retenue, et non l’estimatif', async () => {
    const { candidats } = await candidatsReinjection(db(), missionId)
    const voile = candidats.find((c) => c.posteId === posteA)

    expect(voile?.prixReelHt).toBe(PU.depuisEuros('268.40').toString())
    expect(voile?.prixEstimeHt).toBe(PU.depuisEuros('250').toString()) // 200 × 1,25
    expect(voile?.ecartPourcent).toBe('7.36')
  })

  it('écarte, en le disant, le poste que l’entreprise n’a pas chiffré', async () => {
    const { candidats, ecartes } = await candidatsReinjection(db(), missionId)
    expect(candidats.map((c) => c.posteId)).toEqual([posteA])
    expect(ecartes.find((e) => e.posteId === posteB)?.motif).toBe('non_chiffre_par_entreprise')
  })

  it('ne verse rien tant qu’aucune ligne n’est choisie', async () => {
    const resultat = await verserPrix(db(), missionId, [])
    expect(resultat.nbVerses).toBe(0)
    expect(await listerPrix(db(), {})).toHaveLength(0)
  })

  it('verse le prix choisi, avec le contexte de l’opération et son origine', async () => {
    const resultat = await verserPrix(db(), missionId, [posteA])
    expect(resultat.nbVerses).toBe(1)

    const prix = await listerPrix(db(), {})
    expect(prix).toHaveLength(1)
    expect(prix[0]?.designation).toBe('Voile béton')
    expect(prix[0]?.prixUnitaireHt).toBe(PU.depuisEuros('268.40') as bigint)

    const enBase = await brut.prixReference.findFirst({ where: { ownerId: owner } })
    expect(enBase?.origineMissionId).toBe(missionId)
    expect(enBase?.contexteTypeOuvrage).toBe('SCOLAIRE')
    expect(enBase?.contexteNature).toBe('CONSTRUCTION_NEUVE')
  })

  it('signale un prix désormais présent en base, sans l’écarter pour autant', async () => {
    // Deux relevés d'un même ouvrage, c'est de la dispersion — pas un doublon.
    const { candidats } = await candidatsReinjection(db(), missionId)
    expect(candidats.find((c) => c.posteId === posteA)?.dejaEnBase).toBe(true)
  })

  it('ne verse que les postes cochés, jamais toute la proposition', async () => {
    const avant = (await listerPrix(db(), {})).length
    await verserPrix(db(), missionId, ['poste-inexistant'])
    expect((await listerPrix(db(), {})).length).toBe(avant)
  })
})

describe('archivage', () => {
  it('clôture l’opération et l’horodate', async () => {
    await cloturerMission(db(), missionId)
    const etat = await chargerEtatCloture(db(), missionId)

    expect(etat.archivee).toBe(true)
    expect(etat.statut).toBe('TERMINEE')
    expect(etat.archiveeLe).toBeInstanceOf(Date)
    expect(etat.nbPrixVerses).toBe(1)
  })

  it('refuse de clôturer deux fois', async () => {
    await expect(cloturerMission(db(), missionId)).rejects.toThrow(/déjà clôturée/)
  })

  it('reste entièrement lisible une fois clôturée', async () => {
    const decompte = await chargerDecompteGeneral(db(), missionId)
    expect(decompte.lots).toHaveLength(1)
  })

  it('se rouvre : une clôture trop tôt ne doit pas être un piège', async () => {
    await rouvrirMission(db(), missionId)
    const etat = await chargerEtatCloture(db(), missionId)
    expect(etat.archivee).toBe(false)
    expect(etat.statut).toBe('EN_COURS')
  })
})
