import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/**
 * Stockage des pièces sur le disque — point 10.9.
 *
 * Les fichiers ne vont pas en base : un plan d'exécution pèse couramment
 * cinquante mégaoctets, et une sauvegarde SQL qui les embarque devient
 * inexploitable. La base porte les métadonnées, le disque porte les octets.
 *
 * Le chemin d'un fichier est dérivé **uniquement** d'identifiants engendrés par
 * l'application. Le nom fourni par l'utilisateur ne sert qu'à l'affichage et au
 * nommage dans l'archive : il ne touche jamais le système de fichiers, et c'est
 * ce qui ferme la porte aux remontées de dossier.
 */

/** Rien ne sort du dépôt : l'application tourne sur le poste de l'économiste. */
export function racineStockage(): string {
  return resolve(process.env.PIECES_RACINE ?? join(process.cwd(), 'donnees', 'pieces'))
}

export class CheminInvalide extends Error {
  constructor(valeur: string) {
    super(`Identifiant de stockage inattendu : ${valeur}`)
    this.name = 'CheminInvalide'
  }
}

/** Les identifiants cuid de Prisma sont alphanumériques, et rien d'autre. */
function verifierIdentifiant(valeur: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(valeur)) throw new CheminInvalide(valeur)
  return valeur
}

function verifierExtension(extension: string): string {
  if (!/^[a-z0-9]{1,8}$/.test(extension)) throw new CheminInvalide(extension)
  return extension
}

/**
 * Chemin relatif d'une pièce, tel qu'il est enregistré en base. Il reste
 * relatif pour que le dépôt puisse être déplacé d'une machine à l'autre sans
 * réécrire une seule ligne.
 */
export function cheminDePiece(missionId: string, pieceId: string, extension: string): string {
  return `${verifierIdentifiant(missionId)}/${verifierIdentifiant(pieceId)}.${verifierExtension(
    extension,
  )}`
}

/**
 * Résout un chemin relatif sous la racine, et refuse tout ce qui en sortirait.
 * La vérification est redondante avec la construction du chemin — c'est voulu :
 * un chemin qui s'échappe du dépôt ne doit jamais dépendre d'un seul garde-fou.
 */
export function cheminAbsolu(cheminRelatif: string): string {
  const racine = racineStockage()
  const absolu = resolve(racine, cheminRelatif)
  if (absolu !== racine && !absolu.startsWith(racine + sep)) {
    throw new CheminInvalide(cheminRelatif)
  }
  return absolu
}

export function empreinteSha256(donnees: Buffer): string {
  return createHash('sha256').update(donnees).digest('hex')
}

export async function ecrireFichier(cheminRelatif: string, donnees: Buffer): Promise<void> {
  const absolu = cheminAbsolu(cheminRelatif)
  await mkdir(absolu.slice(0, absolu.lastIndexOf(sep)), { recursive: true })
  await writeFile(absolu, donnees)
}

export async function lireFichier(cheminRelatif: string): Promise<Buffer> {
  return readFile(cheminAbsolu(cheminRelatif))
}

/** Supprime sans se plaindre d'un fichier déjà absent : le but est qu'il n'y soit plus. */
export async function supprimerFichier(cheminRelatif: string): Promise<void> {
  await rm(cheminAbsolu(cheminRelatif), { force: true })
}

export async function fichierExiste(cheminRelatif: string): Promise<boolean> {
  try {
    await readFile(cheminAbsolu(cheminRelatif))
    return true
  } catch {
    return false
  }
}
