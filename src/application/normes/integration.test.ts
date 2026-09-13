/**
 * Référentiel des normes, vérifié sur une vraie base.
 *
 * Ce qui compte ici : qu'un DTU annulé cité dans un CCTP empêche réellement la
 * pièce de partir, et que l'application ne touche jamais au texte elle-même.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import { creerMission } from '../missions/service'
import { ajouterPoste, creerLot } from '../chiffrage/structure'
import { enregistrerModifications } from '../chiffrage/service'
import { chargerTextes, enregistrerTexte, verifierMission } from '../dce/service'
import * as PU from '../../domain/money/prix-unitaire'
import { ReleveManuel } from '../../infrastructure/sources-normes/releve-manuel'
import {
  ajouterNorme,
  amorcerDepuisTextes,
  chargerReferentiel,
  controlerMission,
  mettreAJourDepuis,
  modifierNorme,
  supprimerNorme,
} from './service'

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `normes-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

const MISSION = {
  nomOperation: 'Groupe scolaire des Anses',
  typeOuvrage: 'TERTIAIRE',
  nature: 'CONSTRUCTION_NEUVE',
  typeMarche: 'PUBLIC',
  surfaceShon: '1200',
  coefficientLocalDefaut: '1.25',
  precisionPu: 2,
  maitreOuvrage: 'Commune des Anses-d’Arlet',
}

/** Une mission d'un lot, d'un ouvrage chiffré, et de son texte. */
async function missionAvecTexte(reference: string, texte: string) {
  const missionId = await creerMission(db(), { ...MISSION, reference })
  const lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
  const posteId = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
  await enregistrerModifications(db(), missionId, [
    {
      id: posteId,
      designation: 'Béton armé pour voiles',
      unite: 'M3',
      quantite: '47.5',
      prixUnitaireHtBase: PU.depuisEuros('285.43').toString(),
    },
  ])
  await enregistrerTexte(db(), missionId, posteId, texte)
  return { missionId, lotId, posteId }
}

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste test' } })
  owner = utilisateur.id
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

describe('tenue du référentiel', () => {
  it('range une référence sous son écriture canonique', async () => {
    const id = await ajouterNorme(db(), { reference: 'dtu 20-1', titre: 'Ouvrages en maçonnerie' })
    const referentiel = await chargerReferentiel(db())
    const posee = referentiel.find((n) => n.reference === 'NF DTU 20.1')

    expect(posee).toBeDefined()
    expect(posee?.titre).toBe('Ouvrages en maçonnerie')
    await supprimerNorme(db(), id)
  })

  it('date la vérification à la saisie, faute de mieux', async () => {
    const id = await ajouterNorme(db(), { reference: 'NF DTU 26.1' })
    const [norme] = await chargerReferentiel(db())
    expect(norme?.dateVerification).toBeInstanceOf(Date)
    await supprimerNorme(db(), id)
  })

  it('canonise aussi la référence de remplacement', async () => {
    const id = await ajouterNorme(db(), {
      reference: 'NF DTU 13.3',
      statut: 'REMPLACEE',
      remplaceePar: 'dtu 13-3 P1-1',
    })
    const [norme] = await chargerReferentiel(db())
    expect(norme?.remplaceePar).toBe('NF DTU 13.3 P1-1')
    await supprimerNorme(db(), id)
  })
})

describe('contrôle d’une mission', () => {
  it('bloque la pièce écrite quand un DTU cité est annulé', async () => {
    const { missionId } = await missionAvecTexte(
      `N1-${SUFFIXE}`,
      'Maçonnerie conforme au NF DTU 20.1 en vigueur.',
    )
    const id = await ajouterNorme(db(), { reference: 'NF DTU 20.1', statut: 'ANNULEE' })

    const synthese = await verifierMission(db(), missionId)
    const anomalie = synthese.anomalies.find((a) => a.code === 'norme_annulee')

    expect(anomalie?.severite).toBe('bloquante')
    expect(synthese.exportPossible).toBe(false)

    await supprimerNorme(db(), id)
  })

  it('laisse passer la pièce quand la norme est en vigueur et vérifiée', async () => {
    const { missionId } = await missionAvecTexte(
      `N2-${SUFFIXE}`,
      'Maçonnerie conforme au NF DTU 20.1.',
    )
    const id = await ajouterNorme(db(), { reference: 'NF DTU 20.1', statut: 'EN_VIGUEUR' })

    const synthese = await verifierMission(db(), missionId)
    expect(synthese.anomalies.filter((a) => a.code.startsWith('norme_'))).toEqual([])

    await supprimerNorme(db(), id)
  })

  it('avertit sans bloquer quand la norme citée est inconnue du référentiel', async () => {
    const { missionId } = await missionAvecTexte(
      `N3-${SUFFIXE}`,
      'Étanchéité conforme au NF DTU 43.1.',
    )
    const { anomalies, aVerser } = await controlerMission(db(), missionId)
    const inconnue = anomalies.find((a) => a.reference === 'NF DTU 43.1')

    expect(inconnue?.code).toBe('norme_inconnue')
    expect(inconnue?.severite).toBe('avertissement')
    expect(aVerser).toContain('NF DTU 43.1')
  })

  it('ne modifie jamais le texte du CCTP', async () => {
    const contenu = 'Maçonnerie conforme au NF DTU 20.1 en vigueur.'
    const { missionId, posteId } = await missionAvecTexte(`N4-${SUFFIXE}`, contenu)
    const id = await ajouterNorme(db(), {
      reference: 'NF DTU 20.1',
      statut: 'REMPLACEE',
      remplaceePar: 'NF DTU 20.1 P1-1',
    })

    await verifierMission(db(), missionId)
    await controlerMission(db(), missionId)

    const textes = await chargerTextes(db(), missionId)
    expect(textes.get(posteId)?.contenu).toBe(contenu)

    await supprimerNorme(db(), id)
  })
})

describe('amorçage depuis les textes déjà écrits', () => {
  it('verse les normes citées, sans présumer de leur statut', async () => {
    await missionAvecTexte(
      `N5-${SUFFIXE}`,
      'Béton conforme à la NF EN 206/CN et au NF DTU 21. Voir aussi Eurocode 2.',
    )

    const { ajoutees } = await amorcerDepuisTextes(db())
    expect(ajoutees).toEqual(expect.arrayContaining(['NF EN 206/CN', 'NF DTU 21', 'Eurocode 2']))

    // Versées sans date de vérification : elles ressortiront au contrôle tant
    // que l'économiste ne les a pas confirmées.
    const referentiel = await chargerReferentiel(db())
    const eurocode = referentiel.find((n) => n.reference === 'Eurocode 2')
    expect(eurocode?.dateVerification).toBeNull()
  })

  it('ne verse pas deux fois la même référence', async () => {
    const premier = await amorcerDepuisTextes(db())
    expect(premier.ajoutees).toEqual([])
  })
})

describe('mise à jour depuis une source', () => {
  it('applique le statut relevé et date la vérification', async () => {
    const reference = `NF DTU 24.1`
    const id = await ajouterNorme(db(), { reference, statut: 'EN_VIGUEUR' })
    await modifierNorme(db(), id, { dateVerification: new Date('2023-01-01') })

    const source = new ReleveManuel([
      {
        reference,
        titre: 'Travaux de fumisterie',
        statut: 'REMPLACEE',
        dateEdition: null,
        remplaceePar: 'NF DTU 24.1 P1',
        source: 'Relevé du 13/09/2026',
      },
    ])

    const resultat = await mettreAJourDepuis(db(), source)
    const changee = resultat.misesAJour.find((m) => m.reference === reference)

    expect(changee).toEqual({ reference, avant: 'EN_VIGUEUR', apres: 'REMPLACEE' })

    const referentiel = await chargerReferentiel(db())
    const norme = referentiel.find((n) => n.reference === reference)
    expect(norme?.remplaceePar).toBe('NF DTU 24.1 P1')
    expect(norme?.dateVerification?.getFullYear()).toBe(new Date().getFullYear())

    await supprimerNorme(db(), id)
  })

  it('signale les références que la source ne connaît pas, sans les toucher', async () => {
    const id = await ajouterNorme(db(), { reference: 'NF DTU 45.1', statut: 'EN_VIGUEUR' })
    const resultat = await mettreAJourDepuis(db(), new ReleveManuel([]))

    expect(resultat.nonTrouvees).toContain('NF DTU 45.1')
    expect(resultat.misesAJour).toEqual([])

    const referentiel = await chargerReferentiel(db())
    expect(referentiel.find((n) => n.reference === 'NF DTU 45.1')?.statut).toBe('EN_VIGUEUR')

    await supprimerNorme(db(), id)
  })
})

describe('cloisonnement', () => {
  it('ne laisse pas voir le référentiel d’un autre propriétaire', async () => {
    const autre = await brut.user.create({ data: { email: `autre-${EMAIL}` } })
    await brut.referenceNormative.create({
      data: { ownerId: autre.id, reference: 'NF DTU 99.9', statut: 'ANNULEE' },
    })

    const referentiel = await chargerReferentiel(db())
    expect(referentiel.find((n) => n.reference === 'NF DTU 99.9')).toBeUndefined()

    await brut.user.delete({ where: { id: autre.id } })
  })
})
