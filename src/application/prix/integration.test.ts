/**
 * Tests d'intégration de la base de prix et de l'import de DPGF.
 * Ils ont besoin de PostgreSQL : docker compose up -d db
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import { creerSourcePrixPersonnelle } from '../../infrastructure/sources-prix/base-personnelle'
import { creerPrix, importerBasePrix, listerPrix, supprimerPrix } from './service'
import { devinerMappagePrix } from './analyse-import'
import { creerMission } from '../missions/service'
import { creerLot } from '../chiffrage/structure'
import { importerDpgf } from '../import/dpgf'
import { chargerChiffrage } from '../chiffrage/service'
import * as PU from '../../domain/money/prix-unitaire'

const brut = new PrismaClient()

const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL_A = `prix-a-${SUFFIXE}@local`
const EMAIL_B = `prix-b-${SUFFIXE}@local`

let ownerA = ''
let ownerB = ''

const db = (ownerId: string) => clientPour(ownerId)

beforeAll(async () => {
  const a = await brut.user.create({ data: { email: EMAIL_A } })
  const b = await brut.user.create({ data: { email: EMAIL_B } })
  ownerA = a.id
  ownerB = b.id
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } })
  await brut.$disconnect()
})

describe('base de prix personnelle', () => {
  it('enregistre un prix à l’échelle du dix-millième d’euro', async () => {
    const client = db(ownerA)
    const id = await creerPrix(client, {
      designation: 'Béton armé pour voiles',
      unite: 'm3',
      prixUnitaireHt: '285,43',
      code: 'BA-VOILE',
    })

    const enBase = await brut.prixReference.findUnique({ where: { id } })
    expect(enBase?.prixUnitaireHt).toBe(PU.depuisEuros('285.43'))
    expect(enBase?.unite).toBe('M3')
    expect(enBase?.zone).toBe('MARTINIQUE')
    expect(enBase?.ownerId).toBe(ownerA)
  })

  it('retrouve un prix malgré les accents manquants et le pluriel', async () => {
    const client = db(ownerA)
    await creerPrix(client, {
      designation: 'Cloison de distribution plaques de plâtre',
      unite: 'm2',
      prixUnitaireHt: '48,90',
    })

    const source = creerSourcePrixPersonnelle(client, ownerA)

    const sansAccent = await source.rechercher({ texte: 'beton arme' })
    expect(sansAccent.map((p) => p.designation)).toContain('Béton armé pour voiles')

    const pluriel = await source.rechercher({ texte: 'cloisons' })
    expect(pluriel.map((p) => p.designation)).toContain(
      'Cloison de distribution plaques de plâtre',
    )
  })

  it('ne cherche pas sur un texte trop court', async () => {
    const source = creerSourcePrixPersonnelle(db(ownerA), ownerA)
    expect(await source.rechercher({ texte: 'b' })).toHaveLength(0)
  })

  it('calcule la dispersion et compte les relevés d’une même famille', async () => {
    const client = db(ownerB)
    for (const prix of ['300,00', '320,00', '380,00']) {
      await creerPrix(client, {
        code: 'GO-SEMELLE',
        designation: 'Semelle filante béton armé',
        unite: 'm3',
        prixUnitaireHt: prix,
      })
    }

    const source = creerSourcePrixPersonnelle(client, ownerB)
    const propositions = await source.rechercher({ texte: 'semelle filante' })

    expect(propositions.length).toBeGreaterThan(0)
    const premiere = propositions[0]
    expect(premiere?.nbReferences).toBe(3)
    expect(premiere?.dispersion?.minimum).toBe(PU.depuisEuros('300'))
    expect(premiere?.dispersion?.mediane).toBe(PU.depuisEuros('320'))
    expect(premiere?.dispersion?.maximum).toBe(PU.depuisEuros('380'))
    // Étendue : (380 - 300) / 320 = 25 %
    expect(premiere?.dispersion?.ecartRelatif?.toString()).toBe('25')
  })

  it('ne propose qu’une ligne par ouvrage, même avec plusieurs relevés', async () => {
    const source = creerSourcePrixPersonnelle(db(ownerB), ownerB)
    const propositions = await source.rechercher({ texte: 'semelle filante' })
    const semelles = propositions.filter((p) => p.code === 'GO-SEMELLE')
    expect(semelles).toHaveLength(1)
    expect(semelles[0]?.nbReferences).toBe(3)
  })

  it('ne donne pas de dispersion sur une référence isolée', async () => {
    const client = db(ownerB)
    await creerPrix(client, {
      code: 'UNIQUE-1',
      designation: 'Ouvrage vu une seule fois',
      unite: 'u',
      prixUnitaireHt: '99,99',
    })

    const source = creerSourcePrixPersonnelle(client, ownerB)
    const propositions = await source.rechercher({ texte: 'ouvrage vu une seule fois' })
    expect(propositions[0]?.nbReferences).toBe(1)
    expect(propositions[0]?.dispersion).toBeNull()
  })

  it('ne laisse pas un propriétaire voir les prix d’un autre', async () => {
    const sourceB = creerSourcePrixPersonnelle(db(ownerB), ownerB)
    const resultats = await sourceB.rechercher({ texte: 'beton arme' })
    expect(resultats.map((p) => p.designation)).not.toContain('Béton armé pour voiles')
  })

  it('supprime un prix de sa propre base seulement', async () => {
    const client = db(ownerA)
    const id = await creerPrix(client, {
      designation: 'Prix temporaire',
      unite: 'u',
      prixUnitaireHt: '10',
    })
    await expect(supprimerPrix(db(ownerB), id)).rejects.toThrow()
    await supprimerPrix(client, id)
    expect(await brut.prixReference.findUnique({ where: { id } })).toBeNull()
  })
})

describe('import d’un classeur de base de prix', () => {
  it('reconnaît les colonnes et crée les entrées', async () => {
    const client = db(ownerA)
    const entete = ['Code', 'Désignation', 'Unité', 'Prix unitaire HT', 'Date']
    const mappage = devinerMappagePrix(entete)
    expect(mappage.designation).toBe(1)
    expect(mappage.prixUnitaireHt).toBe(3)

    const avant = (await listerPrix(client, { limite: 1000 })).length

    const resultat = await importerBasePrix(
      client,
      [
        ['IMP-01', 'Chape de ravoirage importée', 'm2', '24,50', '12/03/2026'],
        ['IMP-02', 'Enduit de façade importé', 'm2', '38,00', '12/03/2026'],
        ['', '', '', '', ''],
      ],
      mappage,
      { premiereLigne: 2 },
    )

    expect(resultat.crees).toBe(2)
    expect(resultat.ignores).toBe(1)
    expect(resultat.anomalies).toHaveLength(0)

    const apres = await listerPrix(client, { limite: 1000 })
    expect(apres.length).toBe(avant + 2)

    const chape = apres.find((p) => p.code === 'IMP-01')
    expect(chape?.prixUnitaireHt).toBe(PU.depuisEuros('24.50'))
    expect(chape?.dateReleve.toISOString().slice(0, 10)).toBe('2026-03-12')
  })

  it('signale les lignes illisibles sans les inventer', async () => {
    const client = db(ownerA)
    const resultat = await importerBasePrix(
      client,
      [
        ['IMP-03', 'Ligne correcte', 'm2', '15,00'],
        ['IMP-04', 'Prix absent', 'm2', 'sur devis'],
        ['IMP-05', '', 'm2', '20,00'],
      ],
      { code: 0, designation: 1, unite: 2, prixUnitaireHt: 3 },
      { premiereLigne: 1 },
    )

    expect(resultat.crees).toBe(1)
    expect(resultat.anomalies).toHaveLength(2)
    expect(resultat.anomalies[0]?.message).toContain('Prix unitaire illisible')
    expect(resultat.anomalies[1]?.message).toContain('Désignation absente')
  })

  it('refuse d’importer sans colonne de prix', async () => {
    await expect(
      importerBasePrix(db(ownerA), [['x']], { designation: 0 }, {}),
    ).rejects.toThrow(/prix unitaire est obligatoire/)
  })
})

describe('import d’un DPGF dans un lot', () => {
  const MISSION = {
    nomOperation: 'Groupe scolaire importé',
    typeOuvrage: 'SCOLAIRE',
    nature: 'CONSTRUCTION_NEUVE',
    typeMarche: 'PUBLIC',
    coefficientLocalDefaut: '1.25',
    precisionPu: 2,
  }

  it('crée l’arborescence, rattache les ouvrages et recalcule', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION, reference: `IMP-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '02', intitule: 'Gros œuvre' })

    const resultat = await importerDpgf(
      client,
      missionId,
      lotId,
      [
        ['02.01', 'TERRASSEMENTS', '', '', ''],
        ['02.01.01', 'Fouilles en pleine masse', 'm3', '1 250,500', '38,20'],
        ['02.01.02', 'Évacuation des terres', 'm3', '1 250,500', '12,00'],
        ['02.02', 'FONDATIONS', '', '', ''],
        ['02.02.01', 'Semelles filantes', 'm3', '88,250', '312,45'],
      ],
      { code: 0, designation: 1, unite: 2, quantite: 3, prixUnitaireHt: 4 },
      { premiereLigne: 2 },
    )

    expect(resultat.nbSousLots).toBe(2)
    expect(resultat.nbOuvrages).toBe(3)

    const postes = resultat.chiffrage.lots[0]?.postes ?? []
    expect(postes).toHaveLength(5)
    expect(postes[0]?.type).toBe('SOUS_LOT')
    expect(postes[0]?.designation).toBe('TERRASSEMENTS')
    expect(postes[1]?.profondeur).toBe(1)
    expect(postes[1]?.parentId).toBe(postes[0]?.id)
    expect(postes[3]?.type).toBe('SOUS_LOT')
    expect(postes[4]?.parentId).toBe(postes[3]?.id)

    // 38,20 x 1,25 = 47,75 ; 1 250,5 x 47,75 = 59 711,375 -> 59 711,38
    expect(postes[1]?.prixUnitaireHtFinal).toBe('477500')
    expect(postes[1]?.montantHt).toBe('5971138')

    // Le sous-lot porte la somme de ses deux ouvrages.
    const terrassements = BigInt(postes[1]?.montantHt ?? '0') + BigInt(postes[2]?.montantHt ?? '0')
    expect(postes[0]?.montantHt).toBe(terrassements.toString())
  })

  it('refuse un import qui contient une ligne bloquante', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION, reference: `IMP2-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '02', intitule: 'Gros œuvre' })

    await expect(
      importerDpgf(
        client,
        missionId,
        lotId,
        [['02.01.01', 'Poste douteux', 'm3', 'à définir', '38,20']],
        { code: 0, designation: 1, unite: 2, quantite: 3, prixUnitaireHt: 4 },
      ),
    ).rejects.toThrow(/bloquante/)

    // Rien ne doit avoir été écrit.
    const chiffrage = await chargerChiffrage(client, missionId)
    expect(chiffrage.lots[0]?.postes).toHaveLength(0)
  })

  it('peut remplacer le contenu existant du lot', async () => {
    const client = db(ownerA)
    const missionId = await creerMission(client, { ...MISSION, reference: `IMP3-${SUFFIXE}` })
    const lotId = await creerLot(client, missionId, { numero: '02', intitule: 'Gros œuvre' })
    const mappage = { designation: 0, unite: 1, quantite: 2, prixUnitaireHt: 3 }

    await importerDpgf(client, missionId, lotId, [['Ancien poste', 'u', '1', '10']], mappage)
    await importerDpgf(client, missionId, lotId, [['Nouveau poste', 'u', '1', '20']], mappage, {
      remplacer: true,
    })

    const chiffrage = await chargerChiffrage(client, missionId)
    const postes = chiffrage.lots[0]?.postes ?? []
    expect(postes).toHaveLength(1)
    expect(postes[0]?.designation).toBe('Nouveau poste')
    // 20 x 1,25 = 25,00
    expect(chiffrage.recapitulatif.totalTceHt).toBe('2500')
  })

  it('refuse un lot qui n’appartient pas à la mission', async () => {
    const client = db(ownerA)
    const missionUn = await creerMission(client, { ...MISSION, reference: `IMP4-${SUFFIXE}` })
    const missionDeux = await creerMission(client, { ...MISSION, reference: `IMP5-${SUFFIXE}` })
    const lotId = await creerLot(client, missionUn, { numero: '02', intitule: 'Gros œuvre' })

    await expect(
      importerDpgf(client, missionDeux, lotId, [['Poste', 'u', '1', '10']], {
        designation: 0,
        unite: 1,
        quantite: 2,
        prixUnitaireHt: 3,
      }),
    ).rejects.toThrow(/hors de la mission/)
  })
})
