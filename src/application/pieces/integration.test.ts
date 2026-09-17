/**
 * Pièces du dossier, vérifiées sur une vraie base et un vrai disque.
 *
 * Deux choses comptent plus que les autres : qu'une pièce d'une mission ne
 * fuite pas vers une autre, et qu'une pièce non cochée « au DCE » ne parte pas
 * aux entreprises — règle 8. Le reste suit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import JSZip from 'jszip'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { clientPour } from '../../infrastructure/prisma'
import { creerMission } from '../missions/service'
import { ajouterPoste, creerLot } from '../chiffrage/structure'
import { enregistrerModifications } from '../chiffrage/service'
import {
  deposerPiece,
  DepotRefuse,
  lirePiece,
  listerPieces,
  modifierPiece,
  piecesDuDossier,
  PieceIntrouvable,
  supprimerPiece,
} from './service'
import { fichierExiste } from '../../infrastructure/fichiers/stockage'
import { assemblerDossier } from '../dce/dossier'
import * as PU from '../../domain/money/prix-unitaire'

// La racine de stockage est relue à chaque appel : la poser dans `beforeAll`
// suffit, et le dépôt de test reste dans un dossier temporaire.
let racine = ''
const racinePrecedente = process.env.PIECES_RACINE

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `pieces-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

let missionId = ''
let autreMissionId = ''
let lotGo = ''
let lotCvc = ''
let planGeneral = ''
let noteGo = ''

const PDF = Buffer.from('%PDF-1.7\nun plan de masse\n%%EOF')

beforeAll(async () => {
  racine = await mkdtemp(join(tmpdir(), 'pieces-'))
  process.env.PIECES_RACINE = racine

  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste' } })
  owner = utilisateur.id

  missionId = await creerMission(db(), {
    nomOperation: 'École du Prêcheur',
    typeOuvrage: 'TERTIAIRE',
    nature: 'CONSTRUCTION_NEUVE',
    typeMarche: 'PUBLIC',
    coefficientLocalDefaut: '1',
    precisionPu: 2,
    reference: `P-${SUFFIXE}`,
  })
  autreMissionId = await creerMission(db(), {
    nomOperation: 'Autre chantier',
    typeOuvrage: 'TERTIAIRE',
    nature: 'CONSTRUCTION_NEUVE',
    typeMarche: 'PRIVE',
    coefficientLocalDefaut: '1',
    precisionPu: 2,
    reference: `P2-${SUFFIXE}`,
  })

  lotGo = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
  lotCvc = await creerLot(db(), missionId, { numero: '08', intitule: 'CVC' })

  const poste = await ajouterPoste(db(), missionId, { lotId: lotGo, type: 'OUVRAGE' })
  await enregistrerModifications(db(), missionId, [
    {
      id: poste,
      code: '02.01',
      designation: 'Voile béton',
      unite: 'M3',
      quantite: '10',
      prixUnitaireHtBase: PU.depuisEuros('1000').toString(),
    },
  ])
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
  await rm(racine, { recursive: true, force: true })
  if (racinePrecedente === undefined) delete process.env.PIECES_RACINE
  else process.env.PIECES_RACINE = racinePrecedente
})

describe('dépôt', () => {
  it('enregistre la pièce et écrit le fichier', async () => {
    const piece = await deposerPiece(db(), missionId, {
      nomFichier: 'PL-002.pdf',
      donnees: PDF,
      categorie: 'PLAN',
      libelle: 'Plan de masse',
      indice: 'C',
    })
    planGeneral = piece.id

    expect(piece.libelle).toBe('Plan de masse')
    expect(piece.tailleOctets).toBe(PDF.length)
    expect(piece.empreinte).toHaveLength(64)
    expect(piece.inclureAuDce).toBe(true)

    const enBase = await brut.pieceJointe.findUniqueOrThrow({ where: { id: piece.id } })
    expect(await fichierExiste(enBase.cheminStockage)).toBe(true)
    // Le chemin est dérivé des identifiants, jamais du nom fourni.
    expect(enBase.cheminStockage).toBe(`${missionId}/${piece.id}.pdf`)
  })

  it('rattache une pièce à un lot', async () => {
    const piece = await deposerPiece(db(), missionId, {
      nomFichier: 'Note de calcul.pdf',
      donnees: PDF,
      categorie: 'RAPPORT_ETUDE',
      libelle: 'Note de calcul béton',
      lotId: lotGo,
    })
    noteGo = piece.id
    expect(piece.lotId).toBe(lotGo)
    expect(piece.lotLibelle).toBe('02 — Gros œuvre')
  })

  it('refuse un fichier qui n’a rien à faire dans un dossier de consultation', async () => {
    await expect(
      deposerPiece(db(), missionId, {
        nomFichier: 'installeur.exe',
        donnees: PDF,
        categorie: 'AUTRE',
      }),
    ).rejects.toBeInstanceOf(DepotRefuse)
  })

  it('refuse un lot qui appartient à une autre mission', async () => {
    const lotEtranger = await creerLot(db(), autreMissionId, { numero: '01', intitule: 'Ailleurs' })
    await expect(
      deposerPiece(db(), missionId, {
        nomFichier: 'plan.pdf',
        donnees: PDF,
        categorie: 'PLAN',
        lotId: lotEtranger,
      }),
    ).rejects.toBeInstanceOf(DepotRefuse)
  })

  it('n’écrit rien en base quand le dépôt est refusé', async () => {
    const avant = (await listerPieces(db(), missionId)).length
    await expect(
      deposerPiece(db(), missionId, { nomFichier: 'vide.pdf', donnees: Buffer.alloc(0), categorie: 'PLAN' }),
    ).rejects.toBeInstanceOf(DepotRefuse)
    expect((await listerPieces(db(), missionId)).length).toBe(avant)
  })
})

describe('cloisonnement', () => {
  it('ne montre pas les pièces d’une autre mission', async () => {
    await deposerPiece(db(), autreMissionId, {
      nomFichier: 'confidentiel.pdf',
      donnees: PDF,
      categorie: 'AUTRE',
    })
    const ici = await listerPieces(db(), missionId)
    expect(ici.map((p) => p.nomFichier)).not.toContain('confidentiel.pdf')
  })

  it('refuse de lire une pièce par le mauvais identifiant de mission', async () => {
    await expect(lirePiece(db(), autreMissionId, planGeneral)).rejects.toBeInstanceOf(
      PieceIntrouvable,
    )
  })
})

describe('ce qui part au dossier de consultation', () => {
  it('retient les pièces du lot et celles de l’opération', async () => {
    const pourGo = await piecesDuDossier(db(), missionId, lotGo)
    expect(pourGo.map((p) => p.id).sort()).toEqual([planGeneral, noteGo].sort())

    // La note de calcul béton ne concerne pas le lot CVC.
    const pourCvc = await piecesDuDossier(db(), missionId, lotCvc)
    expect(pourCvc.map((p) => p.id)).toEqual([planGeneral])
  })

  it('écarte une pièce qu’on a décochée', async () => {
    await modifierPiece(db(), missionId, planGeneral, { inclureAuDce: false })
    const pourCvc = await piecesDuDossier(db(), missionId, lotCvc)
    expect(pourCvc).toHaveLength(0)
    await modifierPiece(db(), missionId, planGeneral, { inclureAuDce: true })
  })
})

describe('archive de consultation', () => {
  it('rassemble pièces écrites, bordereau et pièces déposées', async () => {
    const dossier = await assemblerDossier(db(), missionId, { lotId: lotGo, forcer: true })
    const archive = await JSZip.loadAsync(dossier.archive)
    const chemins = Object.keys(archive.files).filter((c) => !c.endsWith('/'))

    const racineArchive = dossier.nomFichier.replace(/\.zip$/, '')
    expect(chemins).toContain(`${racineArchive}/00-Bordereau-des-pieces.xlsx`)
    expect(chemins).toContain(`${racineArchive}/01-Pieces-ecrites/CCTP - Lot 02.docx`)
    expect(chemins).toContain(`${racineArchive}/02-Bordereau/DPGF a remplir - Lot 02.xlsx`)
    // Le plan porte son libellé et son indice, pas son nom d'origine.
    expect(chemins).toContain(`${racineArchive}/03-Plans/Plan de masse - Ind C.pdf`)
    expect(chemins).toContain(`${racineArchive}/04-Rapports-etudes/Note de calcul béton.pdf`)
  })

  it('transmet les octets à l’identique', async () => {
    const dossier = await assemblerDossier(db(), missionId, { lotId: lotGo, forcer: true })
    const archive = await JSZip.loadAsync(dossier.archive)
    const racineArchive = dossier.nomFichier.replace(/\.zip$/, '')
    const plan = await archive
      .file(`${racineArchive}/03-Plans/Plan de masse - Ind C.pdf`)
      ?.async('nodebuffer')
    expect(plan).toEqual(PDF)
  })

  it('n’emporte pas une pièce écartée du DCE', async () => {
    await modifierPiece(db(), missionId, noteGo, { inclureAuDce: false })
    const dossier = await assemblerDossier(db(), missionId, { lotId: lotGo, forcer: true })
    const chemins = Object.keys((await JSZip.loadAsync(dossier.archive)).files)
    expect(chemins.some((c) => c.includes('Note de calcul'))).toBe(false)
    await modifierPiece(db(), missionId, noteGo, { inclureAuDce: true })
  })

  it('écarte les pièces d’un autre lot', async () => {
    const dossier = await assemblerDossier(db(), missionId, { lotId: lotCvc, forcer: true })
    const chemins = Object.keys((await JSZip.loadAsync(dossier.archive)).files)
    expect(chemins.some((c) => c.includes('Note de calcul'))).toBe(false)
    expect(chemins.some((c) => c.includes('Plan de masse'))).toBe(true)
  })
})

describe('suppression', () => {
  it('efface le fichier en même temps que la ligne', async () => {
    const piece = await deposerPiece(db(), missionId, {
      nomFichier: 'a-jeter.pdf',
      donnees: PDF,
      categorie: 'AUTRE',
    })
    const enBase = await brut.pieceJointe.findUniqueOrThrow({ where: { id: piece.id } })
    expect(await fichierExiste(enBase.cheminStockage)).toBe(true)

    await supprimerPiece(db(), missionId, piece.id)
    expect(await fichierExiste(enBase.cheminStockage)).toBe(false)
    expect((await listerPieces(db(), missionId)).map((p) => p.id)).not.toContain(piece.id)
  })

  it('refuse de supprimer une pièce qui n’est pas de cette mission', async () => {
    await expect(supprimerPiece(db(), autreMissionId, planGeneral)).rejects.toBeInstanceOf(
      PieceIntrouvable,
    )
  })
})
