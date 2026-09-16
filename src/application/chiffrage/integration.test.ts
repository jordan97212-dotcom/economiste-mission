/**
 * Tests d'intégration : ils parlent à une vraie base PostgreSQL.
 * Ce qu'ils vérifient ne peut pas l'être en test unitaire : le cloisonnement
 * par propriétaire, la persistance des valeurs calculées, la copie d'un arbre
 * de postes, et la conversion des nombres au format d'un tableur français.
 *
 * Démarrer la base avant : docker compose up -d db
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import { chargerChiffrage, enregistrerModifications, recalculerMission } from './service'
import { ajouterPoste, creerLot, deplacerPoste, supprimerPoste } from './structure'
import { collerBloc, devinerMappageCollage } from './coller'
import { creerMission, dupliquerMission, genererReference } from '../missions/service'
import * as PU from '../../domain/money/prix-unitaire'

const brut = new PrismaClient()

const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL_A = `test-a-${SUFFIXE}@local`
const EMAIL_B = `test-b-${SUFFIXE}@local`

let ownerA = ''
let ownerB = ''

function db(ownerId: string) {
  return clientPour(ownerId)
}

const MISSION_TYPE = {
  nomOperation: 'Résidence Les Flamboyants',
  typeOuvrage: 'LOGEMENT_COLLECTIF',
  nature: 'CONSTRUCTION_NEUVE',
  typeMarche: 'PUBLIC',
  surfaceShon: '1200',
  coefficientLocalDefaut: '1.25',
  precisionPu: 2,
}

beforeAll(async () => {
  const a = await brut.user.create({ data: { email: EMAIL_A, nom: 'Économiste A' } })
  const b = await brut.user.create({ data: { email: EMAIL_B, nom: 'Économiste B' } })
  ownerA = a.id
  ownerB = b.id
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } })
  await brut.$disconnect()
})

describe('cloisonnement par propriétaire', () => {
  it('ne laisse pas un propriétaire lire la mission d’un autre', async () => {
    const idA = await creerMission(db(ownerA), { ...MISSION_TYPE, reference: `C-${SUFFIXE}-1` })

    expect(await db(ownerA).mission.findUnique({ where: { id: idA } })).not.toBeNull()
    expect(await db(ownerB).mission.findUnique({ where: { id: idA } })).toBeNull()
    expect(await db(ownerB).mission.findMany({ where: { id: idA } })).toHaveLength(0)
  })

  it('ne laisse pas un propriétaire modifier la mission d’un autre', async () => {
    const idA = await creerMission(db(ownerA), { ...MISSION_TYPE, reference: `C-${SUFFIXE}-2` })

    const touchees = await db(ownerB).mission.updateMany({
      where: { id: idA },
      data: { nomOperation: 'Détourné' },
    })
    expect(touchees.count).toBe(0)

    const inchangee = await db(ownerA).mission.findUnique({ where: { id: idA } })
    expect(inchangee?.nomOperation).toBe(MISSION_TYPE.nomOperation)
  })

  it('marque automatiquement le propriétaire à la création', async () => {
    const id = await creerMission(db(ownerA), { ...MISSION_TYPE, reference: `C-${SUFFIXE}-3` })
    const enBase = await brut.mission.findUnique({ where: { id }, select: { ownerId: true } })
    expect(enBase?.ownerId).toBe(ownerA)
  })
})

describe('référence de mission', () => {
  it('incrémente le compteur de l’année sur trois chiffres', async () => {
    const client = db(ownerB)
    const annee = 2031
    expect(await genererReference(client, annee)).toBe('2031-001')

    await creerMission(client, { ...MISSION_TYPE, reference: '2031-001' })
    expect(await genererReference(client, annee)).toBe('2031-002')

    await creerMission(client, { ...MISSION_TYPE, reference: '2031-014' })
    expect(await genererReference(client, annee)).toBe('2031-015')
  })
})

describe('recalcul persisté', () => {
  it('écrit le prix final et le montant de chaque ligne, et le total du lot', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `R-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '02', intitule: 'Gros œuvre' })

    const posteId = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })
    await enregistrerModifications(client, missionId, [
      {
        id: posteId,
        designation: 'Béton armé pour voiles',
        code: '02.03.01',
        unite: 'M3',
        quantite: '47.500',
        prixUnitaireHtBase: PU.depuisEuros('285.43').toString(),
      },
    ])

    const poste = await brut.poste.findUnique({ where: { id: posteId } })
    // 285,43 x 1,25 = 356,7875 -> 356,79 ; 47,5 x 356,79 = 16 947,53
    expect(poste?.prixUnitaireHtFinal).toBe(3_567_900n)
    expect(poste?.montantHt).toBe(1_694_753n)

    const lot = await brut.lot.findUnique({ where: { id: lotId } })
    expect(lot?.montantEstimeHt).toBe(1_694_753n)

    const chiffrage = await chargerChiffrage(client, missionId)
    expect(chiffrage.recapitulatif.totalTceHt).toBe('1694753')
    // 16 947,53 / 1200 m² = 14,12 €/m²
    expect(chiffrage.recapitulatif.ratioEuroParM2).toBe('14.12')
  })

  it('propage le coefficient du lot à ses lignes', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `R2-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, {
      numero: '13',
      intitule: 'Climatisation',
      coefficientLocal: '1.4000',
    })
    const posteId = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })

    await enregistrerModifications(client, missionId, [
      { id: posteId, designation: 'Split mural', quantite: '10', prixUnitaireHtBase: PU.depuisEuros('1000').toString() },
    ])

    const poste = await brut.poste.findUnique({ where: { id: posteId } })
    // Le coefficient du lot (1,40) l'emporte sur celui de la mission (1,25).
    expect(poste?.prixUnitaireHtFinal).toBe(14_000_000n)
    expect(poste?.montantHt).toBe(1_400_000n)
  })

  it('fait remonter les sous-totaux dans les sous-lots', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `R3-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '06', intitule: 'Menuiseries' })

    const sousLotId = await ajouterPoste(client, missionId, { lotId, type: 'SOUS_LOT' })
    const enfantA = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE', parentId: sousLotId })
    const enfantB = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE', parentId: sousLotId })

    await enregistrerModifications(client, missionId, [
      { id: enfantA, designation: 'Fenêtre', quantite: '2', prixUnitaireHtBase: PU.depuisEuros('400').toString() },
      { id: enfantB, designation: 'Porte', quantite: '1', prixUnitaireHtBase: PU.depuisEuros('800').toString() },
    ])

    // (2 x 400 + 800) x 1,25 = 2 000
    const sousLot = await brut.poste.findUnique({ where: { id: sousLotId } })
    expect(sousLot?.montantHt).toBe(200_000n)
    expect(sousLot?.prixUnitaireHtFinal).toBeNull()

    const lot = await brut.lot.findUnique({ where: { id: lotId } })
    expect(lot?.montantEstimeHt).toBe(200_000n)
  })

  it('remet le total à zéro quand la dernière ligne est supprimée', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `R4-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '14', intitule: 'Peinture' })
    const posteId = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })

    await enregistrerModifications(client, missionId, [
      { id: posteId, designation: 'Peinture murs', quantite: '100', prixUnitaireHtBase: PU.depuisEuros('12').toString() },
    ])
    expect((await brut.lot.findUnique({ where: { id: lotId } }))?.montantEstimeHt).toBe(150_000n)

    await supprimerPoste(client, missionId, posteId)
    expect((await brut.lot.findUnique({ where: { id: lotId } }))?.montantEstimeHt).toBe(0n)
  })

  it('refuse d’écrire sur un poste qui n’appartient pas à la mission', async () => {
    const client = db(ownerA)
    const missionUn = await creerMission(client, { ...MISSION_TYPE, reference: `R5-${SUFFIXE}` })
    const missionDeux = await creerMission(client, { ...MISSION_TYPE, reference: `R6-${SUFFIXE}` })
    const lotId = await creerLot(client, missionUn, { numero: '01', intitule: 'VRD' })
    const posteId = await ajouterPoste(client, missionUn, { lotId, type: 'OUVRAGE' })

    await expect(
      enregistrerModifications(client, missionDeux, [{ id: posteId, designation: 'Intrus' }]),
    ).rejects.toThrow(/hors de la mission/)
  })
})

describe('arborescence', () => {
  it('indente une ligne sous la précédente, qui devient un sous-lot', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `A-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '09', intitule: 'Cloisons' })

    const premier = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })
    const second = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })

    await deplacerPoste(client, missionId, second, 'indenter')

    const apres = await brut.poste.findUnique({ where: { id: second } })
    expect(apres?.parentId).toBe(premier)
    expect((await brut.poste.findUnique({ where: { id: premier } }))?.type).toBe('SOUS_LOT')

    await deplacerPoste(client, missionId, second, 'desindenter')
    expect((await brut.poste.findUnique({ where: { id: second } }))?.parentId).toBeNull()
  })

  it('supprime la descendance avec le parent', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `A2-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '11', intitule: 'Faux-plafonds' })

    const parent = await ajouterPoste(client, missionId, { lotId, type: 'SOUS_LOT' })
    const enfant = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE', parentId: parent })

    await supprimerPoste(client, missionId, parent)
    expect(await brut.poste.findUnique({ where: { id: enfant } })).toBeNull()
  })
})

describe('duplication de mission', () => {
  it('recopie les lots et l’arbre des postes, et repart en prospect', async () => {
    const client = db(ownerA)
    const sourceId = await creerMission(client, {
      ...MISSION_TYPE,
      reference: `D-${SUFFIXE}`,
      statut: 'EN_COURS',
    })
    const lotId = await creerLot(client, sourceId, { numero: '02', intitule: 'Gros œuvre' })
    const sousLot = await ajouterPoste(client, sourceId, { lotId, type: 'SOUS_LOT' })
    const enfant = await ajouterPoste(client, sourceId, { lotId, type: 'OUVRAGE', parentId: sousLot })

    await enregistrerModifications(client, sourceId, [
      { id: sousLot, designation: 'Fondations' },
      { id: enfant, designation: 'Semelle filante', quantite: '30', prixUnitaireHtBase: PU.depuisEuros('150').toString() },
    ])

    const copieId = await dupliquerMission(client, sourceId, { nomOperation: 'Copie pour essai' })
    const copie = await chargerChiffrage(client, copieId)

    expect(copie.mission.statut).toBe('PROSPECT')
    expect(copie.mission.nomOperation).toBe('Copie pour essai')
    expect(copie.mission.id).not.toBe(sourceId)
    expect(copie.lots).toHaveLength(1)

    const postes = copie.lots[0]?.postes ?? []
    expect(postes).toHaveLength(2)
    expect(postes[0]?.designation).toBe('Fondations')
    expect(postes[0]?.profondeur).toBe(0)
    expect(postes[1]?.designation).toBe('Semelle filante')
    expect(postes[1]?.profondeur).toBe(1)
    expect(postes[1]?.parentId).toBe(postes[0]?.id)
    expect(postes[1]?.id).not.toBe(enfant)

    // 30 x 150 x 1,25 = 5 625
    expect(copie.recapitulatif.totalTceHt).toBe('562500')
  })

  it('peut repartir de la structure sans reprendre les prix', async () => {
    const client = db(ownerA)
    const sourceId = await creerMission(client, { ...MISSION_TYPE, reference: `D2-${SUFFIXE}` })
    const lotId = await creerLot(client, sourceId, { numero: '02', intitule: 'Gros œuvre' })
    const posteId = await ajouterPoste(client, sourceId, { lotId, type: 'OUVRAGE' })
    await enregistrerModifications(client, sourceId, [
      { id: posteId, designation: 'Béton', quantite: '10', prixUnitaireHtBase: PU.depuisEuros('300').toString() },
    ])

    const copieId = await dupliquerMission(client, sourceId, { reprendreLesPrix: false })
    const copie = await chargerChiffrage(client, copieId)
    const poste = copie.lots[0]?.postes[0]

    expect(poste?.designation).toBe('Béton')
    expect(poste?.quantite).toBe('10')
    expect(poste?.prixUnitaireHtBase).toBeNull()
    expect(copie.recapitulatif.totalTceHt).toBe('0')
  })
})

describe('collage d’un bloc de tableur', () => {
  it('crée les lignes manquantes et lit les nombres au format français', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `P-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '02', intitule: 'Gros œuvre' })
    const depart = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })

    const chiffrage = await collerBloc(client, missionId, {
      lotId,
      posteDepartId: depart,
      colonneDepart: 'code',
      lignes: [
        ['02.01.01', 'Fouilles en pleine masse', 'm3', '1 250,500', '38,20'],
        ['02.01.02', 'Béton de propreté', 'm3', '42', '145,90'],
        ['02.02.01', 'Semelles filantes', 'm3', '88,250', '312,45'],
      ],
    })

    const postes = chiffrage.lots[0]?.postes ?? []
    expect(postes).toHaveLength(3)

    expect(postes[0]?.code).toBe('02.01.01')
    expect(postes[0]?.designation).toBe('Fouilles en pleine masse')
    expect(postes[0]?.unite).toBe('M3')
    expect(postes[0]?.quantite).toBe('1250.5')
    // 38,20 x 1,25 = 47,75 ; 1250,5 x 47,75 = 59 711,375 -> 59 711,38
    expect(postes[0]?.prixUnitaireHtFinal).toBe('477500')
    expect(postes[0]?.montantHt).toBe('5971138')

    expect(postes[2]?.designation).toBe('Semelles filantes')
    expect(postes[2]?.quantite).toBe('88.25')
  })

  it('colle un tableur dont le prix précède la quantité, sans les intervertir', async () => {
    // Le défaut d'origine : le collage remplissait les colonnes dans l'ordre de
    // la grille, donc ce tableur-là versait le prix dans la quantité et la
    // quantité dans le prix. Les deux valeurs étant lisibles, rien ne se
    // signalait et le montant était faux.
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `PI-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '02', intitule: 'Gros œuvre' })
    const depart = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })

    const bloc = [
      ['02.01', 'Voile béton banché ép. 20 cm', 'm3', '268,40', '47,5'],
      ['02.02', 'Dalle portée béton armé', 'm2', '92,15', '310'],
    ]

    const { colonnes } = devinerMappageCollage(bloc, 'code')
    expect(colonnes.map((c) => c.colonne)).toEqual([
      'code',
      'designation',
      'unite',
      'prixUnitaireHtBase',
      'quantite',
    ])

    const chiffrage = await collerBloc(client, missionId, {
      lotId,
      posteDepartId: depart,
      colonneDepart: 'code',
      lignes: bloc,
      mappage: colonnes.map((c) => c.colonne),
    })

    const postes = chiffrage.lots[0]?.postes ?? []
    expect(postes[0]?.quantite).toBe('47.5')
    // 268,40 x 1,25 = 335,50 ; 47,5 x 335,50 = 15 936,25
    expect(postes[0]?.prixUnitaireHtFinal).toBe('3355000')
    expect(postes[0]?.montantHt).toBe('1593625')
  })

  it('n’écrit pas les colonnes que l’économiste a écartées', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `PE-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '02', intitule: 'Gros œuvre' })
    const depart = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })

    // Une colonne du milieu — ici un commentaire — est écartée ; les suivantes
    // doivent quand même être collées.
    const chiffrage = await collerBloc(client, missionId, {
      lotId,
      posteDepartId: depart,
      colonneDepart: 'designation',
      lignes: [['Voile béton banché', 'à revoir avec le BET', 'm3', '47,5']],
      mappage: ['designation', null, 'unite', 'quantite'],
    })

    const poste = chiffrage.lots[0]?.postes?.[0]
    expect(poste?.designation).toBe('Voile béton banché')
    expect(poste?.unite).toBe('M3')
    expect(poste?.quantite).toBe('47.5')
  })

  it('refuse un collage plus gros que la limite de sécurité', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `P2-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '02', intitule: 'Gros œuvre' })
    const depart = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })

    await expect(
      collerBloc(client, missionId, {
        lotId,
        posteDepartId: depart,
        colonneDepart: 'code',
        lignes: Array.from({ length: 2001 }, () => ['x']),
      }),
    ).rejects.toThrow(/trop volumineux/)
  })
})

describe('volume réaliste', () => {
  it('recalcule un lot de mille lignes et retombe sur la somme exacte', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION_TYPE, reference: `V-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '02', intitule: 'Gros œuvre' })
    const depart = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })

    // 1 000 lignes à 1 x 10,00 €, coefficient 1,25 -> 12,50 € la ligne
    await collerBloc(client, missionId, {
      lotId,
      posteDepartId: depart,
      colonneDepart: 'designation',
      lignes: Array.from({ length: 1000 }, (_, i) => [`Poste ${i + 1}`, 'U', '1', '10,00']),
    })

    await recalculerMission(client, missionId)
    const lot = await brut.lot.findUnique({ where: { id: lotId } })
    expect(lot?.montantEstimeHt).toBe(1_250_000n) // 1 000 x 12,50 €
  }, 60_000)
})
