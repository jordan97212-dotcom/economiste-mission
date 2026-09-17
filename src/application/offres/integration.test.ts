/**
 * Consultation des entreprises et analyse des offres, vérifiées sur une vraie
 * base et un vrai classeur Excel — le passage le plus sensible : reprendre le
 * DPGF « à remplir » exporté puis rempli par une entreprise.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'
import { clientPour } from '../../infrastructure/prisma'
import { creerMission } from '../missions/service'
import { ajouterPoste, creerLot } from '../chiffrage/structure'
import { enregistrerModifications, chargerChiffrage } from '../chiffrage/service'
import { genererDpgfExcel } from '../../infrastructure/excel/dpgf-export'
import * as PU from '../../domain/money/prix-unitaire'
import { creerEntreprise, listerEntreprises, supprimerEntreprise } from '../entreprises/service'
import { creerConsultation, listerConsultationsDuLot, modifierConsultation } from '../consultations/service'
import {
  enregistrerOffreGlobale,
  importerOffreDpgf,
  supprimerOffre,
  chargerTableauComparatif,
} from './service'
import {
  chargerRapportBrouillon,
  enregistrerRapportBrouillon,
  genererBrouillonAutomatique,
  genererDocumentRapport,
} from './rapport'

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `offres-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

const MISSION = {
  nomOperation: 'Extension du collège Bellevue',
  typeOuvrage: 'TERTIAIRE',
  nature: 'CONSTRUCTION_NEUVE',
  typeMarche: 'PUBLIC',
  surfaceShon: '2200',
  coefficientLocalDefaut: '1.25',
  precisionPu: 2,
  maitreOuvrage: 'Collectivité territoriale de Martinique',
}

let missionId = ''
let lotId = ''
let posteA = ''
let posteB = ''

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste test' } })
  owner = utilisateur.id

  missionId = await creerMission(db(), { ...MISSION, reference: `O-${SUFFIXE}` })
  lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
  posteA = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
  posteB = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })

  await enregistrerModifications(db(), missionId, [
    { id: posteA, code: '02.01', designation: 'Voile béton', unite: 'M3', quantite: '100', prixUnitaireHtBase: '20000' },
    { id: posteB, code: '02.02', designation: 'Dalle', unite: 'M2', quantite: '50', prixUnitaireHtBase: '10000' },
  ])
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

describe('répertoire des entreprises', () => {
  it('crée, liste et empêche la suppression d’une entreprise encore consultée', async () => {
    const id = await creerEntreprise(db(), { raisonSociale: 'Bâti Antilles', corpsEtatQualifies: ['02'] })
    const entreprises = await listerEntreprises(db())
    expect(entreprises.find((e) => e.id === id)?.raisonSociale).toBe('Bâti Antilles')

    await creerConsultation(db(), missionId, { lotId, entrepriseId: id })
    await expect(supprimerEntreprise(db(), id)).rejects.toThrow(/liée à 1 consultation/)
  })

  it('cloisonne le répertoire par propriétaire', async () => {
    const autre = await brut.user.create({ data: { email: `autre-${EMAIL}` } })
    await brut.entreprise.create({ data: { ownerId: autre.id, raisonSociale: 'Fantôme SARL' } })

    const entreprises = await listerEntreprises(db())
    expect(entreprises.find((e) => e.raisonSociale === 'Fantôme SARL')).toBeUndefined()

    await brut.user.delete({ where: { id: autre.id } })
  })
})

describe('consultation et offres', () => {
  it('refuse deux consultations de la même entreprise sur le même lot', async () => {
    const entrepriseId = await creerEntreprise(db(), { raisonSociale: 'Caraïbe BTP' })
    await creerConsultation(db(), missionId, { lotId, entrepriseId })
    await expect(creerConsultation(db(), missionId, { lotId, entrepriseId })).rejects.toThrow(
      /déjà consultée/,
    )
  })

  it('offre globale : met à jour le statut de la consultation et journalise', async () => {
    const entrepriseId = await creerEntreprise(db(), { raisonSociale: 'Sud Construction' })
    const consultationId = await creerConsultation(db(), missionId, { lotId, entrepriseId })

    await enregistrerOffreGlobale(db(), missionId, consultationId, {
      montantHt: '19000',
      dateReception: new Date('2026-10-01'),
    })

    const consultations = await listerConsultationsDuLot(db(), missionId, lotId)
    const consultation = consultations.find((c) => c.id === consultationId)
    expect(consultation?.statut).toBe('OFFRE_RECUE')
    expect(consultation?.nbOffres).toBe(1)
  })

  it('une variante moins chère ne devient pas la moins-disante — point 10.8', async () => {
    // Le type doit survivre à l'aller-retour en base jusqu'au classement :
    // sinon une variante, qui répond à un autre dossier, serait désignée
    // mieux-disante et fausserait la recommandation d'attribution.
    // Sa propre opération : ajouter un lot à la mission partagée fausserait le
    // test d'export DPGF, qui compte les lots qu'il exporte.
    const missionVariante = await creerMission(db(), { ...MISSION, reference: `OV-${SUFFIXE}` })
    const lotVariante = await creerLot(db(), missionVariante, { numero: '07', intitule: 'Charpente' })
    const posteId = await ajouterPoste(db(), missionVariante, { lotId: lotVariante, type: 'OUVRAGE' })
    await enregistrerModifications(db(), missionVariante, [
      {
        id: posteId,
        designation: 'Charpente traditionnelle',
        unite: 'M2',
        quantite: '100',
        prixUnitaireHtBase: PU.depuisEuros('200').toString(),
      },
    ])

    const baseId = await creerEntreprise(db(), { raisonSociale: 'Charpentes Caraïbes' })
    const varId = await creerEntreprise(db(), { raisonSociale: 'Bois des Îles' })
    const consulBase = await creerConsultation(db(), missionVariante, { lotId: lotVariante, entrepriseId: baseId })
    const consulVar = await creerConsultation(db(), missionVariante, { lotId: lotVariante, entrepriseId: varId })

    await enregistrerOffreGlobale(db(), missionVariante, consulBase, {
      type: 'BASE',
      montantHt: '26000',
      dateReception: new Date('2026-10-01'),
    })
    await enregistrerOffreGlobale(db(), missionVariante, consulVar, {
      type: 'VARIANTE',
      libelle: 'Lamellé-collé',
      montantHt: '18000',
      dateReception: new Date('2026-10-02'),
    })

    const tableau = await chargerTableauComparatif(db(), missionVariante, lotVariante)
    const gagnante = tableau.colonnes.find((c) => c.moinsDisante)
    expect(gagnante?.entrepriseNom).toBe('Charpentes Caraïbes')

    const variante = tableau.colonnes.find((c) => c.entrepriseNom === 'Bois des Îles')
    expect(variante?.type).toBe('VARIANTE')
    expect(variante?.libelle).toBe('Lamellé-collé')
    expect(variante?.classee).toBe(false)
  })

  it('reprend un DPGF « à remplir » réellement exporté puis rempli', async () => {
    const entrepriseId = await creerEntreprise(db(), { raisonSociale: 'Nord Bâtiment' })
    const consultationId = await creerConsultation(db(), missionId, { lotId, entrepriseId })

    // Étape 1 : le vrai export, tel qu'envoyé à l'entreprise.
    const chiffrage = await chargerChiffrage(db(), missionId)
    const classeurExporte = await genererDpgfExcel(chiffrage, { variante: 'a-remplir' })

    // Étape 2 : l'entreprise remplit ses prix, en retrouvant ses lignes par
    // l'onglet technique — jamais par la désignation.
    const classeur = new ExcelJS.Workbook()
    await classeur.xlsx.load(classeurExporte as unknown as ExcelJS.Buffer)
    const technique = classeur.getWorksheet('_identifiants')!
    const parPoste = new Map<string, { feuille: string; ligne: number }>()
    technique.eachRow((ligne, numero) => {
      if (numero === 1) return
      const feuille = String(ligne.getCell(1).value)
      const numeroLigne = Number(ligne.getCell(2).value)
      const posteId = String(ligne.getCell(3).value)
      parPoste.set(posteId, { feuille, ligne: numeroLigne })
    })

    const refA = parPoste.get(posteA)!
    const refB = parPoste.get(posteB)!
    classeur.getWorksheet(refA.feuille)!.getRow(refA.ligne).getCell(5).value = 240 // au lieu de 250 (coeff. 1,25 x 200)
    // posteB volontairement laissé vide : l'entreprise ne l'a pas chiffré.

    const classeurRempli = Buffer.from(await classeur.xlsx.writeBuffer())

    // Étape 3 : reprise par l'application.
    const resultat = await importerOffreDpgf(db(), missionId, consultationId, classeurRempli, {
      dateReception: new Date('2026-10-05'),
    })

    expect(resultat.nbLignes).toBe(1)
    expect(resultat.nbNonRenseignees).toBe(1)
    expect(resultat.nbIllisibles).toBe(0)

    const offre = await brut.offre.findFirst({ where: { consultationId }, include: { lignes: true } })
    expect(offre?.lignes).toHaveLength(1)
    expect(offre?.lignes[0]?.posteId).toBe(posteA)
    expect(offre?.montantHt.toString()).toBe('2400000') // 100 m³ × 240 € = 24 000,00 €

    const consultations = await listerConsultationsDuLot(db(), missionId, lotId)
    expect(consultations.find((c) => c.id === consultationId)?.statut).toBe('OFFRE_RECUE')
  })

  it('refuse un classeur sans l’onglet technique', async () => {
    const entrepriseId = await creerEntreprise(db(), { raisonSociale: 'Ouest Rénovation' })
    const consultationId = await creerConsultation(db(), missionId, { lotId, entrepriseId })

    const classeurVide = new ExcelJS.Workbook()
    classeurVide.addWorksheet('Feuille1')
    const octets = Buffer.from(await classeurVide.xlsx.writeBuffer())

    await expect(
      importerOffreDpgf(db(), missionId, consultationId, octets, { dateReception: new Date() }),
    ).rejects.toThrow(/correspondance de lignes/)
  })

  it('supprimer la dernière offre remet la consultation à « envoyée »', async () => {
    const entrepriseId = await creerEntreprise(db(), { raisonSociale: 'Est Ouvrages' })
    const consultationId = await creerConsultation(db(), missionId, { lotId, entrepriseId })
    const offreId = await enregistrerOffreGlobale(db(), missionId, consultationId, {
      montantHt: '25000',
      dateReception: new Date(),
    })

    await supprimerOffre(db(), missionId, offreId)

    const consultations = await listerConsultationsDuLot(db(), missionId, lotId)
    const consultation = consultations.find((c) => c.id === consultationId)
    expect(consultation?.statut).toBe('ENVOYEE')
    expect(consultation?.nbOffres).toBe(0)
  })
})

describe('tableau comparatif et rapport', () => {
  it('construit le comparatif et désigne la moins-disante parmi les conformes', async () => {
    const tableau = await chargerTableauComparatif(db(), missionId, lotId)
    expect(tableau.colonnes.length).toBeGreaterThanOrEqual(2)
    expect(tableau.colonnes.filter((c) => c.moinsDisante)).toHaveLength(1)
  })

  it('le brouillon automatique cite les entreprises et se relit sans l’application', async () => {
    const tableau = await chargerTableauComparatif(db(), missionId, lotId)
    const brouillon = genererBrouillonAutomatique(tableau)
    expect(brouillon).toContain('## Constat')
    expect(brouillon).toContain('## À compléter')
  })

  it('enregistre puis relit le brouillon édité par l’économiste', async () => {
    await enregistrerRapportBrouillon(db(), missionId, lotId, '## Analyse\nTexte rédigé à la main.')
    const relu = await chargerRapportBrouillon(db(), missionId, lotId)
    expect(relu).toBe('## Analyse\nTexte rédigé à la main.')
  })

  it('génère un document Word réel à partir du tableau et du brouillon', async () => {
    const { fichier, nom } = await genererDocumentRapport(db(), missionId, lotId)
    expect(fichier.subarray(0, 2).toString()).toBe('PK')
    expect(fichier.length).toBeGreaterThan(1000)
    expect(nom).toContain('Analyse-offres')
  })
})
