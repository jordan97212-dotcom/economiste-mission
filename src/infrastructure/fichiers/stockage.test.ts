/**
 * Le dépôt de fichiers, vérifié sur un vrai disque.
 *
 * L'essentiel tient en une phrase : aucun chemin ne doit pouvoir sortir de la
 * racine. Le reste — écrire, relire, supprimer — se vérifie en passant.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CheminInvalide,
  cheminAbsolu,
  cheminDePiece,
  ecrireFichier,
  empreinteSha256,
  fichierExiste,
  lireFichier,
  racineStockage,
  supprimerFichier,
} from './stockage'

let racine = ''
const precedente = process.env.PIECES_RACINE

beforeAll(async () => {
  racine = await mkdtemp(join(tmpdir(), 'pieces-'))
  process.env.PIECES_RACINE = racine
})

afterAll(async () => {
  if (precedente === undefined) delete process.env.PIECES_RACINE
  else process.env.PIECES_RACINE = precedente
  await rm(racine, { recursive: true, force: true })
})

describe('racine', () => {
  it('suit la variable d’environnement', () => {
    expect(racineStockage()).toBe(racine)
  })
})

describe('chemin d’une pièce', () => {
  it('se dérive des identifiants, pas du nom fourni', () => {
    expect(cheminDePiece('cmu48d1j5', 'cpiece0001', 'pdf')).toBe('cmu48d1j5/cpiece0001.pdf')
  })

  it('refuse un identifiant qui n’en est pas un', () => {
    // Le nom d'utilisateur ne doit jamais arriver jusqu'ici, mais si un jour il
    // y arrivait, il ne construirait pas un chemin.
    expect(() => cheminDePiece('../../etc', 'p1', 'pdf')).toThrow(CheminInvalide)
    expect(() => cheminDePiece('m1', 'p1/../../p2', 'pdf')).toThrow(CheminInvalide)
    expect(() => cheminDePiece('m1', 'p1', '../sh')).toThrow(CheminInvalide)
    expect(() => cheminDePiece('m1', 'p1', 'PDF')).toThrow(CheminInvalide)
  })
})

describe('résolution', () => {
  it('résout sous la racine', () => {
    expect(cheminAbsolu('m1/p1.pdf')).toBe(join(racine, 'm1', 'p1.pdf'))
  })

  it('refuse tout ce qui remonte hors de la racine', () => {
    expect(() => cheminAbsolu('../voisin.pdf')).toThrow(CheminInvalide)
    expect(() => cheminAbsolu('m1/../../voisin.pdf')).toThrow(CheminInvalide)
    expect(() => cheminAbsolu('/etc/passwd')).toThrow(CheminInvalide)
  })
})

describe('écriture et lecture', () => {
  const chemin = 'mission1/piece1.pdf'
  const contenu = Buffer.from('%PDF-1.7 un plan')

  it('crée les dossiers manquants et relit à l’identique', async () => {
    await ecrireFichier(chemin, contenu)
    expect(await lireFichier(chemin)).toEqual(contenu)
    // Le fichier est bien là où on le croit.
    expect(await readFile(join(racine, 'mission1', 'piece1.pdf'))).toEqual(contenu)
  })

  it('calcule une empreinte stable', () => {
    expect(empreinteSha256(contenu)).toBe(empreinteSha256(Buffer.from('%PDF-1.7 un plan')))
    expect(empreinteSha256(contenu)).toHaveLength(64)
  })

  it('supprime, et ne se plaint pas d’un fichier déjà parti', async () => {
    expect(await fichierExiste(chemin)).toBe(true)
    await supprimerFichier(chemin)
    expect(await fichierExiste(chemin)).toBe(false)
    await expect(supprimerFichier(chemin)).resolves.toBeUndefined()
  })
})
