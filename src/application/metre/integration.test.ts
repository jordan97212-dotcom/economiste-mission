/**
 * Métré, vérifié sur une vraie base.
 *
 * Ce qui compte : que la quantité d'un ouvrage métré soit bien celle de ses
 * mesures, qu'elle ne puisse plus être retapée par-dessus, et qu'un repère
 * modifié se répercute partout où il est rappelé — pas seulement là où on
 * pensait à regarder.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import { creerMission } from '../missions/service'
import { ajouterPoste, creerLot } from '../chiffrage/structure'
import { chargerChiffrage, enregistrerModifications, QuantiteCalculee } from '../chiffrage/service'
import {
  chargerMetrePoste,
  creerRepere,
  enregistrerMetrePoste,
  enregistrerRepere,
  listerReperes,
  MetreInvalide,
  RepereEncoreRappele,
  supprimerMetrePoste,
  supprimerRepere,
  type SaisieLigneMetre,
} from './service'
import * as PU from '../../domain/money/prix-unitaire'

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `metre-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

let missionId = ''
let lotId = ''
let posteVoile = ''
let posteDalle = ''
let repereEtage = ''

const mesure = (champs: Partial<SaisieLigneMetre> = {}): SaisieLigneMetre => ({
  type: 'MESURE',
  libelle: '',
  deduction: false,
  nombre: null,
  longueur: null,
  largeur: null,
  hauteur: null,
  rappelRepereId: null,
  ...champs,
})

const rappel = (repereId: string, champs: Partial<SaisieLigneMetre> = {}): SaisieLigneMetre =>
  mesure({ type: 'RAPPEL', rappelRepereId: repereId, ...champs })

async function quantiteDe(posteId: string): Promise<string | null> {
  const chiffrage = await chargerChiffrage(db(), missionId)
  for (const lot of chiffrage.lots) {
    const poste = lot.postes.find((p) => p.id === posteId)
    if (poste) return poste.quantite
  }
  return null
}

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste' } })
  owner = utilisateur.id

  missionId = await creerMission(db(), {
    nomOperation: 'Groupe scolaire',
    typeOuvrage: 'TERTIAIRE',
    nature: 'CONSTRUCTION_NEUVE',
    typeMarche: 'PUBLIC',
    surfaceShon: '900',
    coefficientLocalDefaut: '1',
    precisionPu: 2,
    reference: `M-${SUFFIXE}`,
  })

  lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
  posteVoile = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
  posteDalle = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })

  await enregistrerModifications(db(), missionId, [
    {
      id: posteVoile,
      code: '02.01',
      designation: 'Voile béton',
      unite: 'M2',
      prixUnitaireHtBase: PU.depuisEuros('100').toString(),
    },
    {
      id: posteDalle,
      code: '02.02',
      designation: 'Dalle portée',
      unite: 'M2',
      prixUnitaireHtBase: PU.depuisEuros('50').toString(),
    },
  ])
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

describe('métré d’un ouvrage', () => {
  it('reporte le total des mesures dans la quantité du poste', async () => {
    const metre = await enregistrerMetrePoste(db(), missionId, posteVoile, [
      mesure({ libelle: 'RDC — mur nord', longueur: '12.50', hauteur: '2.80' }),
      mesure({ libelle: 'RDC — mur sud', longueur: '12.50', hauteur: '2.80' }),
      mesure({ libelle: 'Baie séjour', longueur: '2.40', hauteur: '2.15', deduction: true }),
    ])

    // 35 + 35 − 5,16 = 64,84
    expect(metre.total).toBe('64.84')
    expect(await quantiteDe(posteVoile)).toBe('64.84')
  })

  it('met le montant du poste à jour dans la foulée', async () => {
    const chiffrage = await chargerChiffrage(db(), missionId)
    const poste = chiffrage.lots[0]?.postes.find((p) => p.id === posteVoile)
    // 64,84 m² × 100 € = 6 484 €
    expect(poste?.montantHt).toBe('648400')
  })

  it('marque le poste comme métré', async () => {
    const chiffrage = await chargerChiffrage(db(), missionId)
    const poste = chiffrage.lots[0]?.postes.find((p) => p.id === posteVoile)
    expect(poste?.aMetre).toBe(true)
    expect(chiffrage.lots[0]?.postes.find((p) => p.id === posteDalle)?.aMetre).toBe(false)
  })

  it('refuse qu’on retape la quantité par-dessus', async () => {
    // Sans ce refus, la saisie tiendrait jusqu'au prochain recalcul, puis
    // disparaîtrait sans prévenir.
    await expect(
      enregistrerModifications(db(), missionId, [{ id: posteVoile, quantite: '999' }]),
    ).rejects.toBeInstanceOf(QuantiteCalculee)
    expect(await quantiteDe(posteVoile)).toBe('64.84')
  })

  it('laisse modifier le reste de la ligne', async () => {
    await enregistrerModifications(db(), missionId, [
      { id: posteVoile, designation: 'Voile béton banché' },
    ])
    expect(await quantiteDe(posteVoile)).toBe('64.84')
  })

  it('signale une mesure qui ne correspond pas à l’unité de l’ouvrage', async () => {
    const metre = await chargerMetrePoste(db(), missionId, posteVoile)
    expect(metre.anomalies).toHaveLength(0)

    await enregistrerModifications(db(), missionId, [{ id: posteVoile, unite: 'M3' }])
    const apres = await chargerMetrePoste(db(), missionId, posteVoile)
    expect(apres.anomalies.map((a) => a.code)).toContain('unite_incoherente')
    // Avertissement, pas blocage : la quantité reste reportée.
    expect(await quantiteDe(posteVoile)).toBe('64.84')

    await enregistrerModifications(db(), missionId, [{ id: posteVoile, unite: 'M2' }])
  })

  it('refuse une mesure négative plutôt que de la stocker', async () => {
    await expect(
      enregistrerMetrePoste(db(), missionId, posteDalle, [mesure({ longueur: '-3' })]),
    ).rejects.toBeInstanceOf(MetreInvalide)
  })

  it('rend la main à la saisie directe quand on supprime le métré', async () => {
    await enregistrerMetrePoste(db(), missionId, posteDalle, [mesure({ longueur: '10', largeur: '4' })])
    expect(await quantiteDe(posteDalle)).toBe('40')

    await supprimerMetrePoste(db(), missionId, posteDalle)
    // La dernière quantité calculée reste : l'ouvrage garde son montant.
    expect(await quantiteDe(posteDalle)).toBe('40')
    await enregistrerModifications(db(), missionId, [{ id: posteDalle, quantite: '42' }])
    expect(await quantiteDe(posteDalle)).toBe('42')
  })
})

describe('repères', () => {
  it('calcule un sous-total nommé', async () => {
    repereEtage = await creerRepere(db(), missionId, { nom: 'Surface étage courant', unite: 'M2' })
    await enregistrerRepere(db(), missionId, repereEtage, {
      lignes: [mesure({ libelle: 'Emprise', longueur: '20', largeur: '16' })],
    })

    const reperes = await listerReperes(db(), missionId)
    expect(reperes.find((r) => r.id === repereEtage)?.valeur).toBe('320')
  })

  it('se rappelle dans le métré d’un ouvrage', async () => {
    const metre = await enregistrerMetrePoste(db(), missionId, posteDalle, [
      rappel(repereEtage, { libelle: 'Étages 1 à 3', nombre: '3' }),
    ])
    expect(metre.total).toBe('960')
    expect(await quantiteDe(posteDalle)).toBe('960')
  })

  it('répercute sa modification sur tous les ouvrages qui le rappellent', async () => {
    // L'emprise passe de 20 × 16 à 22 × 16 : la dalle doit suivre, seule.
    await enregistrerRepere(db(), missionId, repereEtage, {
      lignes: [mesure({ libelle: 'Emprise', longueur: '22', largeur: '16' })],
    })
    expect(await quantiteDe(posteDalle)).toBe('1056')
    expect(await quantiteDe(posteVoile)).toBe('64.84')
  })

  it('compte ses emplois', async () => {
    const reperes = await listerReperes(db(), missionId)
    expect(reperes.find((r) => r.id === repereEtage)?.emplois).toBe(1)
  })

  it('refuse d’être supprimé tant qu’il est rappelé', async () => {
    await expect(supprimerRepere(db(), missionId, repereEtage)).rejects.toBeInstanceOf(
      RepereEncoreRappele,
    )
  })

  it('refuse un rappel qui tournerait en rond', async () => {
    const autre = await creerRepere(db(), missionId, { nom: 'Surface totale', unite: 'M2' })
    await enregistrerRepere(db(), missionId, autre, { lignes: [rappel(repereEtage, { nombre: '3' })] })

    await expect(
      enregistrerRepere(db(), missionId, repereEtage, { lignes: [rappel(autre)] }),
    ).rejects.toBeInstanceOf(MetreInvalide)

    // Le repère d'origine n'a pas bougé.
    const reperes = await listerReperes(db(), missionId)
    expect(reperes.find((r) => r.id === repereEtage)?.valeur).toBe('352')
    await supprimerRepere(db(), missionId, autre)
  })

  it('refuse deux repères du même nom dans une mission', async () => {
    await expect(
      creerRepere(db(), missionId, { nom: 'Surface étage courant', unite: 'M2' }),
    ).rejects.toBeInstanceOf(MetreInvalide)
  })

  it('refuse de rappeler un repère d’une autre mission', async () => {
    const autreMission = await creerMission(db(), {
      nomOperation: 'Autre chantier',
      typeOuvrage: 'TERTIAIRE',
      nature: 'CONSTRUCTION_NEUVE',
      typeMarche: 'PRIVE',
      coefficientLocalDefaut: '1',
      precisionPu: 2,
      reference: `M2-${SUFFIXE}`,
    })
    const etranger = await creerRepere(db(), autreMission, { nom: 'Emprise', unite: 'M2' })

    await expect(
      enregistrerMetrePoste(db(), missionId, posteVoile, [rappel(etranger)]),
    ).rejects.toBeInstanceOf(MetreInvalide)
  })

  it('se supprime une fois libéré', async () => {
    await enregistrerMetrePoste(db(), missionId, posteDalle, [mesure({ longueur: '10', largeur: '4' })])
    await supprimerRepere(db(), missionId, repereEtage)
    const reperes = await listerReperes(db(), missionId)
    expect(reperes.map((r) => r.id)).not.toContain(repereEtage)
    expect(await quantiteDe(posteDalle)).toBe('40')
  })
})
