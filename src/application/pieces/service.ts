import { Prisma, type PrismaClient } from '@prisma/client'
import {
  assainirNomFichier,
  estCategorie,
  extensionDe,
  refuserDepot,
  type CategoriePiece,
} from '../../domain/pieces/validation'
import {
  cheminDePiece,
  ecrireFichier,
  empreinteSha256,
  lireFichier,
  supprimerFichier,
} from '../../infrastructure/fichiers/stockage'
import { journaliser } from '../audit/service'
import type { PieceJointeDTO } from '../dto'

/**
 * Pièces du dossier — SPEC_APP_ECONOMISTE.md §5.5, point 10.9.
 *
 * Un dossier de consultation ne se limite pas aux pièces que l'économiste
 * rédige. Plans de l'architecte, rapport de sol, diagnostic amiante, notice de
 * sécurité : ces documents arrivent d'ailleurs et repartent aux entreprises
 * tels quels. L'application les garde à côté de la mission plutôt que dans un
 * dossier du bureau dont personne ne se souvient du chemin.
 *
 * Les octets vont sur le disque, les métadonnées en base. Et une pièce ne part
 * aux entreprises que si elle a été explicitement marquée comme telle —
 * règle 8.
 */

export class PieceIntrouvable extends Error {
  constructor(id: string) {
    super(`Pièce introuvable ou hors de la mission : ${id}`)
    this.name = 'PieceIntrouvable'
  }
}

export class DepotRefuse extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'DepotRefuse'
  }
}

/**
 * Type servi au téléchargement. Il est déduit de l'extension, **jamais** repris
 * du navigateur : un fichier déposé ne doit pas pouvoir choisir comment il sera
 * interprété. Ce qui n'est pas dans cette table part en flux binaire.
 */
const TYPES_PAR_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
}

export function typeMimeServi(nomFichier: string): string {
  const extension = extensionDe(nomFichier)
  return (extension === null ? undefined : TYPES_PAR_EXTENSION[extension]) ?? 'application/octet-stream'
}

interface PieceBrute {
  id: string
  nomFichier: string
  libelle: string | null
  indice: string | null
  categorie: string
  typeMime: string
  tailleOctets: number
  empreinte: string
  lotId: string | null
  inclureAuDce: boolean
  deposeLe: Date
  lot?: { numero: string; intitule: string } | null
}

const SELECTION = {
  id: true,
  nomFichier: true,
  libelle: true,
  indice: true,
  categorie: true,
  typeMime: true,
  tailleOctets: true,
  empreinte: true,
  lotId: true,
  inclureAuDce: true,
  deposeLe: true,
  lot: { select: { numero: true, intitule: true } },
} as const

function versDTO(piece: PieceBrute): PieceJointeDTO {
  return {
    id: piece.id,
    nomFichier: piece.nomFichier,
    libelle: piece.libelle,
    indice: piece.indice,
    categorie: piece.categorie,
    typeMime: piece.typeMime,
    tailleOctets: piece.tailleOctets,
    empreinte: piece.empreinte,
    lotId: piece.lotId,
    lotLibelle: piece.lot ? `${piece.lot.numero} — ${piece.lot.intitule}` : null,
    inclureAuDce: piece.inclureAuDce,
    deposeLe: piece.deposeLe.toISOString(),
  }
}

async function verifierMission(client: PrismaClient, missionId: string): Promise<void> {
  const mission = await client.mission.findUnique({ where: { id: missionId }, select: { id: true } })
  if (!mission) throw new DepotRefuse('mission_introuvable', 'Mission introuvable.')
}

async function verifierLot(
  client: PrismaClient,
  missionId: string,
  lotId: string | null,
): Promise<void> {
  if (lotId === null) return
  const lot = await client.lot.findFirst({ where: { id: lotId, missionId }, select: { id: true } })
  if (!lot) throw new DepotRefuse('lot_hors_mission', 'Ce lot n’appartient pas à cette mission.')
}

export interface EntreeDepot {
  readonly nomFichier: string
  readonly donnees: Buffer
  readonly categorie: string
  readonly libelle?: string | null
  readonly indice?: string | null
  readonly lotId?: string | null
  readonly inclureAuDce?: boolean
}

/**
 * Dépose une pièce. La ligne est créée d'abord, pour tenir son identifiant ;
 * si l'écriture sur disque échoue, elle est retirée. Une pièce enregistrée qui
 * ne désigne aucun fichier serait pire qu'une pièce absente : on la verrait.
 */
export async function deposerPiece(
  client: PrismaClient,
  missionId: string,
  entree: EntreeDepot,
): Promise<PieceJointeDTO> {
  await verifierMission(client, missionId)
  await verifierLot(client, missionId, entree.lotId ?? null)

  const nomFichier = assainirNomFichier(entree.nomFichier)
  const refus = refuserDepot({ nomFichier, tailleOctets: entree.donnees.length })
  if (refus) throw new DepotRefuse(refus.code, refus.message)

  if (!estCategorie(entree.categorie)) {
    throw new DepotRefuse('categorie_inconnue', `Catégorie inconnue : ${entree.categorie}.`)
  }

  const extension = extensionDe(nomFichier) as string

  const cree = await client.pieceJointe.create({
    // `ownerId` est posé par l'extension Prisma, pas ici.
    data: {
      missionId,
      lotId: entree.lotId ?? null,
      nomFichier,
      libelle: entree.libelle?.trim() || null,
      indice: entree.indice?.trim() || null,
      categorie: entree.categorie as CategoriePiece,
      inclureAuDce: entree.inclureAuDce ?? true,
      typeMime: typeMimeServi(nomFichier),
      tailleOctets: entree.donnees.length,
      empreinte: empreinteSha256(entree.donnees),
      cheminStockage: '',
    } as unknown as Prisma.PieceJointeCreateInput,
    select: { id: true },
  })

  try {
    const chemin = cheminDePiece(missionId, cree.id, extension)
    await ecrireFichier(chemin, entree.donnees)
    await client.pieceJointe.update({ where: { id: cree.id }, data: { cheminStockage: chemin } })
  } catch (erreur) {
    await client.pieceJointe.delete({ where: { id: cree.id } })
    throw erreur
  }

  await journaliser(client, {
    entite: 'PieceJointe',
    entiteId: cree.id,
    action: 'CREATION',
    apres: { nomFichier, categorie: entree.categorie, lotId: entree.lotId ?? null },
  })

  const piece = await client.pieceJointe.findUniqueOrThrow({
    where: { id: cree.id },
    select: SELECTION,
  })
  return versDTO(piece as PieceBrute)
}

export async function listerPieces(
  client: PrismaClient,
  missionId: string,
): Promise<PieceJointeDTO[]> {
  const pieces = await client.pieceJointe.findMany({
    where: { missionId },
    orderBy: [{ categorie: 'asc' }, { deposeLe: 'asc' }],
    select: SELECTION,
  })
  return pieces.map((piece) => versDTO(piece as PieceBrute))
}

/** Les pièces qui partent avec le dossier d'un lot : les siennes, et celles de l'opération. */
export async function piecesDuDossier(
  client: PrismaClient,
  missionId: string,
  lotId: string | null,
): Promise<PieceJointeDTO[]> {
  const pieces = await client.pieceJointe.findMany({
    where: {
      missionId,
      inclureAuDce: true,
      ...(lotId === null ? {} : { OR: [{ lotId: null }, { lotId }] }),
    },
    orderBy: [{ categorie: 'asc' }, { libelle: 'asc' }, { nomFichier: 'asc' }],
    select: SELECTION,
  })
  return pieces.map((piece) => versDTO(piece as PieceBrute))
}

export interface ModificationPiece {
  readonly libelle?: string | null
  readonly indice?: string | null
  readonly categorie?: string
  readonly lotId?: string | null
  readonly inclureAuDce?: boolean
}

export async function modifierPiece(
  client: PrismaClient,
  missionId: string,
  pieceId: string,
  champs: ModificationPiece,
): Promise<PieceJointeDTO> {
  const existante = await client.pieceJointe.findFirst({
    where: { id: pieceId, missionId },
    select: { id: true },
  })
  if (!existante) throw new PieceIntrouvable(pieceId)

  if (champs.categorie !== undefined && !estCategorie(champs.categorie)) {
    throw new DepotRefuse('categorie_inconnue', `Catégorie inconnue : ${champs.categorie}.`)
  }
  if (champs.lotId !== undefined) await verifierLot(client, missionId, champs.lotId)

  await client.pieceJointe.update({
    where: { id: pieceId },
    data: {
      ...(champs.libelle !== undefined ? { libelle: champs.libelle?.trim() || null } : {}),
      ...(champs.indice !== undefined ? { indice: champs.indice?.trim() || null } : {}),
      ...(champs.categorie !== undefined ? { categorie: champs.categorie as CategoriePiece } : {}),
      ...(champs.lotId !== undefined ? { lotId: champs.lotId } : {}),
      ...(champs.inclureAuDce !== undefined ? { inclureAuDce: champs.inclureAuDce } : {}),
    },
  })

  const piece = await client.pieceJointe.findUniqueOrThrow({
    where: { id: pieceId },
    select: SELECTION,
  })
  return versDTO(piece as PieceBrute)
}

/** Supprime le fichier avant la ligne : mieux vaut un octet orphelin qu'une pièce qui pointe dans le vide. */
export async function supprimerPiece(
  client: PrismaClient,
  missionId: string,
  pieceId: string,
): Promise<void> {
  const piece = await client.pieceJointe.findFirst({
    where: { id: pieceId, missionId },
    select: { id: true, cheminStockage: true, nomFichier: true },
  })
  if (!piece) throw new PieceIntrouvable(pieceId)

  if (piece.cheminStockage !== '') await supprimerFichier(piece.cheminStockage)
  await client.pieceJointe.delete({ where: { id: pieceId } })

  await journaliser(client, {
    entite: 'PieceJointe',
    entiteId: pieceId,
    action: 'SUPPRESSION',
    avant: { nomFichier: piece.nomFichier },
  })
}

export interface ContenuPiece {
  readonly piece: PieceJointeDTO
  readonly donnees: Buffer
}

export async function lirePiece(
  client: PrismaClient,
  missionId: string,
  pieceId: string,
): Promise<ContenuPiece> {
  const piece = await client.pieceJointe.findFirst({
    where: { id: pieceId, missionId },
    select: { ...SELECTION, cheminStockage: true },
  })
  if (!piece) throw new PieceIntrouvable(pieceId)
  if (piece.cheminStockage === '') throw new PieceIntrouvable(pieceId)

  return { piece: versDTO(piece as PieceBrute), donnees: await lireFichier(piece.cheminStockage) }
}
