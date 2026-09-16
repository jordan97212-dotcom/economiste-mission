/**
 * Versions de chiffrage figées, vérifiées sur une vraie base.
 *
 * Ce qui compte : qu'une version figée ne bouge plus quand le chiffrage change,
 * que la comparaison attribue l'écart au bon mouvement, et que le suivi de
 * chantier s'appuie enfin sur cette référence au lieu du chiffrage courant.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import { creerMission } from '../missions/service'
import { ajouterPoste, creerLot, supprimerPoste } from './structure'
import { enregistrerModifications } from './service'
import { chargerSuivi } from '../suivi/service'
import {
  COURANT,
  comparer,
  figerVersion,
  instantanerMaintenant,
  listerVersions,
  supprimerVersion,
  VersionIntrouvable,
} from './versions'
import * as PU from '../../domain/money/prix-unitaire'

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `versions-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

let missionId = ''
let lotId = ''
let posteVoile = ''
let versionApd = ''

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste' } })
  owner = utilisateur.id

  missionId = await creerMission(db(), {
    nomOperation: 'Médiathèque',
    typeOuvrage: 'TERTIAIRE',
    nature: 'CONSTRUCTION_NEUVE',
    typeMarche: 'PUBLIC',
    surfaceShon: '900',
    coefficientLocalDefaut: '1',
    precisionPu: 2,
    reference: `V-${SUFFIXE}`,
  })

  lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
  posteVoile = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })

  // 10 m³ à 1 000 € = 10 000 €
  await enregistrerModifications(db(), missionId, [
    {
      id: posteVoile,
      code: '02.01',
      designation: 'Voile béton',
      unite: 'M3',
      quantite: '10',
      prixUnitaireHtBase: PU.depuisEuros('1000').toString(),
    },
  ])

  versionApd = await figerVersion(db(), missionId, { phase: 'APD' })
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

describe('figeage', () => {
  it('enregistre le montant et le contenu du chiffrage', async () => {
    const versions = await listerVersions(db(), missionId)
    expect(versions).toHaveLength(1)
    expect(versions[0]?.phase).toBe('APD')
    expect(versions[0]?.libelle).toBe('Avant-projet définitif')
    expect(versions[0]?.montantTceHt).toBe('1000000') // 10 000 €
    expect(versions[0]?.nbLignes).toBe(1)
  })

  it('ne retient que les ouvrages, pas les sous-totaux', async () => {
    // Un sous-lot ne porte qu'un sous-total, déjà compris dans le montant du
    // lot : l'inscrire compterait deux fois.
    const sousLot = await ajouterPoste(db(), missionId, { lotId, type: 'SOUS_LOT' })
    const instantane = await instantanerMaintenant(db(), missionId)
    expect(instantane.lots[0]?.lignes.map((l) => l.posteId)).not.toContain(sousLot)
    await supprimerPoste(db(), missionId, sousLot)
  })
})

describe('une version figée ne bouge plus', () => {
  it('garde son montant quand le chiffrage change', async () => {
    // 10 m³ → 15 m³ : le chiffrage courant passe à 15 000 €.
    await enregistrerModifications(db(), missionId, [{ id: posteVoile, quantite: '15' }])

    const versions = await listerVersions(db(), missionId)
    expect(versions[0]?.montantTceHt).toBe('1000000')

    const courant = await instantanerMaintenant(db(), missionId)
    expect(courant.montantTceHt).toBe('1500000')
  })
})

describe('comparaison', () => {
  it('compare une version figée au chiffrage courant', async () => {
    const resultat = await comparer(db(), missionId, versionApd, COURANT)
    expect(resultat.libelleAvant).toBe('Avant-projet définitif')
    expect(resultat.libelleApres).toBe('Chiffrage actuel')
    expect(resultat.ecartMontantHt).toBe('500000') // + 5 000 €
    expect(resultat.ecartPourcent).toBe('50.00')
  })

  it('attribue l’écart à la modification, pas à une apparition', async () => {
    const { synthese } = await comparer(db(), missionId, versionApd, COURANT)
    expect(synthese.nbModifiees).toBe(1)
    expect(synthese.nbApparues).toBe(0)
    expect(synthese.ecartParModificationHt).toBe('500000')
    expect(synthese.ecartParApparitionHt).toBe('0')
  })

  it('nomme le champ qui a bougé', async () => {
    const resultat = await comparer(db(), missionId, versionApd, COURANT)
    expect(resultat.lots[0]?.lignes[0]?.champsModifies).toEqual(['quantite'])
  })

  it('voit une ligne apparue depuis le figeage', async () => {
    const nouveau = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
    await enregistrerModifications(db(), missionId, [
      {
        id: nouveau,
        designation: 'Dalle portée',
        unite: 'M2',
        quantite: '100',
        prixUnitaireHtBase: PU.depuisEuros('80').toString(),
      },
    ])

    const { synthese } = await comparer(db(), missionId, versionApd, COURANT)
    expect(synthese.nbApparues).toBe(1)
    expect(synthese.ecartParApparitionHt).toBe('800000') // 8 000 €

    await supprimerPoste(db(), missionId, nouveau)
  })

  it('refuse une version qui n’existe pas', async () => {
    await expect(comparer(db(), missionId, 'inexistante', COURANT)).rejects.toBeInstanceOf(
      VersionIntrouvable,
    )
  })

  it('ne laisse pas comparer la version d’une autre opération', async () => {
    const autre = await creerMission(db(), {
      nomOperation: 'Autre',
      typeOuvrage: 'TERTIAIRE',
      nature: 'CONSTRUCTION_NEUVE',
      typeMarche: 'PUBLIC',
      coefficientLocalDefaut: '1',
      precisionPu: 2,
      reference: `V2-${SUFFIXE}`,
    })
    await expect(comparer(db(), autre, versionApd, COURANT)).rejects.toBeInstanceOf(
      VersionIntrouvable,
    )
  })
})

describe('le suivi s’appuie sur la version figée', () => {
  it('prend le chiffrage courant tant que rien n’est figé', async () => {
    const vierge = await creerMission(db(), {
      nomOperation: 'Sans version',
      typeOuvrage: 'TERTIAIRE',
      nature: 'CONSTRUCTION_NEUVE',
      typeMarche: 'PUBLIC',
      coefficientLocalDefaut: '1',
      precisionPu: 2,
      reference: `V3-${SUFFIXE}`,
    })
    const suivi = await chargerSuivi(db(), vierge)
    expect(suivi.referenceEstimatif.origine).toBe('chiffrage_courant')
    expect(suivi.referenceEstimatif.figeLe).toBe(null)
  })

  it('compare au montant figé, pas au chiffrage du moment', async () => {
    // Le chiffrage courant vaut 15 000 €, la version figée 10 000 €.
    const suivi = await chargerSuivi(db(), missionId)
    expect(suivi.referenceEstimatif.origine).toBe('version_figee')
    expect(suivi.referenceEstimatif.libelle).toBe('Avant-projet définitif')
    expect(suivi.estimatifHt).toBe('1000000')
  })

  it('préfère le DCE à une version plus récente d’une autre phase', async () => {
    await figerVersion(db(), missionId, { phase: 'DCE' })
    await figerVersion(db(), missionId, { phase: 'ACT' })

    const suivi = await chargerSuivi(db(), missionId)
    expect(suivi.referenceEstimatif.libelle).toBe('Dossier de consultation')
    // Le DCE a été figé à 15 000 €, après la modification de quantité.
    expect(suivi.estimatifHt).toBe('1500000')
  })
})

describe('suppression', () => {
  it('supprime une version figée', async () => {
    const jetable = await figerVersion(db(), missionId, { phase: 'ESQ', libelle: 'À jeter' })
    await supprimerVersion(db(), missionId, jetable)
    const versions = await listerVersions(db(), missionId)
    expect(versions.map((v) => v.id)).not.toContain(jetable)
  })

  it('refuse de supprimer une version qui n’existe pas', async () => {
    await expect(supprimerVersion(db(), missionId, 'inexistante')).rejects.toBeInstanceOf(
      VersionIntrouvable,
    )
  })
})
