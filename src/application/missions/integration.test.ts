/**
 * Archivage et suppression d'une mission, sur une vraie base et un vrai disque.
 *
 * Ce qui compte : qu'archiver n'abîme rien — c'est censé être une mise sur
 * l'étagère, pas une demi-suppression — et que supprimer emporte réellement les
 * fichiers déposés. Une pièce restée sur le disque sous une mission effacée est
 * invisible, impossible à retrouver, et les sauvegardes la traînent de mois en
 * mois.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

// Le stockage lit sa racine au premier appel : elle doit être posée avant que
// le module ne soit chargé, sinon les pièces partiraient dans le dossier réel.
const RACINE = await mkdtemp(join(tmpdir(), 'pieces-missions-'))
process.env['PIECES_RACINE'] = RACINE

const { clientPour } = await import('../../infrastructure/prisma')
const { fichierExiste } = await import('../../infrastructure/fichiers/stockage')
const { archiverMission, creerMission, listerMissions, supprimerMission } = await import('./service')
const { deposerPiece } = await import('../pieces/service')

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `missions-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste' } })
  owner = utilisateur.id
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
  await rm(RACINE, { recursive: true, force: true })
})

let compteur = 0
async function nouvelleMission(nomOperation: string): Promise<string> {
  compteur += 1
  return creerMission(db(), {
    nomOperation,
    typeOuvrage: 'TERTIAIRE',
    nature: 'CONSTRUCTION_NEUVE',
    typeMarche: 'PRIVE',
    coefficientLocalDefaut: '1',
    precisionPu: 2,
    reference: `A${compteur}-${SUFFIXE}`,
  })
}

describe('archivage', () => {
  it('retire la mission du tableau de bord sans y toucher', async () => {
    const id = await nouvelleMission('Collège de Trinité')
    expect((await listerMissions(db())).map((m) => m.id)).toContain(id)

    await archiverMission(db(), id, true)

    expect((await listerMissions(db())).map((m) => m.id)).not.toContain(id)
    const archivees = await listerMissions(db(), { archivees: true })
    expect(archivees.map((m) => m.id)).toContain(id)

    // Le statut n'a pas bougé : ranger une affaire ne la déclare pas abandonnée.
    expect(archivees.find((m) => m.id === id)?.statut).toBe('PROSPECT')
  })

  it('ressort la mission telle quelle', async () => {
    const id = await nouvelleMission('Gymnase du Robert')
    await archiverMission(db(), id, true)
    await archiverMission(db(), id, false)

    expect((await listerMissions(db())).map((m) => m.id)).toContain(id)
    expect((await listerMissions(db(), { archivees: true })).map((m) => m.id)).not.toContain(id)
  })

  it('ne déplace pas la date d’archivage d’une mission déjà rangée', async () => {
    // C'est elle qui ordonne l'archive : la plus récemment rangée en tête.
    const id = await nouvelleMission('Médiathèque du Marin')
    await archiverMission(db(), id, true)
    const premiere = (await listerMissions(db(), { archivees: true })).find((m) => m.id === id)
      ?.archiveeLe

    await archiverMission(db(), id, true)

    const seconde = (await listerMissions(db(), { archivees: true })).find((m) => m.id === id)
      ?.archiveeLe
    expect(seconde?.toISOString()).toBe(premiere?.toISOString())
  })
})

describe('suppression', () => {
  it('emporte les pièces déposées sur le disque', async () => {
    const id = await nouvelleMission('Groupe scolaire du Lorrain')
    await deposerPiece(db(), id, {
      nomFichier: 'PL-002-plan-de-masse.pdf',
      donnees: Buffer.from('%PDF-1.7\nplan\n%%EOF'),
      categorie: 'PLAN',
      libelle: 'Plan de masse',
    })

    const pieces = await brut.pieceJointe.findMany({
      where: { missionId: id },
      select: { cheminStockage: true },
    })
    expect(pieces).toHaveLength(1)
    const chemin = pieces[0]?.cheminStockage as string
    expect(await fichierExiste(chemin)).toBe(true)

    await supprimerMission(db(), id)

    // La ligne part avec la cascade, le fichier ne partirait pas tout seul.
    expect(await brut.pieceJointe.count({ where: { missionId: id } })).toBe(0)
    expect(await fichierExiste(chemin)).toBe(false)
  })

  it('supprime une mission archivée', async () => {
    // C'est le chemin offert par le tableau de bord : on range, puis on efface.
    const id = await nouvelleMission('Halle des sports du Lamentin')
    await archiverMission(db(), id, true)

    await supprimerMission(db(), id)

    expect(await brut.mission.count({ where: { id } })).toBe(0)
  })

  it('refuse une mission qui n’existe pas', async () => {
    await expect(supprimerMission(db(), 'mission-inexistante')).rejects.toThrow(/introuvable/i)
  })
})
