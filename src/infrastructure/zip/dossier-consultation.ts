import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import {
  DOSSIERS_CATEGORIE,
  LIBELLES_CATEGORIE,
  formaterTaille,
  type CategoriePiece,
} from '../../domain/pieces/validation'

/**
 * Dossier de consultation des entreprises — SPEC_APP_ECONOMISTE.md §5.5.
 *
 * Ce que l'économiste envoie à une entreprise n'est pas un fichier mais un
 * dossier : le CCTP, le bordereau à remplir, et les pièces venues d'ailleurs —
 * plans, rapport de sol, diagnostics. Jusqu'ici il fallait les rassembler à la
 * main, à chaque envoi, pour chaque entreprise.
 *
 * L'archive porte un **bordereau des pièces** : la liste de ce qu'elle
 * contient, avec l'indice de chaque plan et son empreinte. Sans lui, une
 * entreprise qui reçoit deux envois successifs ne sait pas ce qui a changé, et
 * personne ne peut prouver ce qui a été transmis.
 */

const DOSSIER_PIECES_ECRITES = '01-Pieces-ecrites'
const DOSSIER_BORDEREAU = '02-Bordereau'

export interface InfoDossier {
  readonly reference: string
  readonly nomOperation: string
  readonly maitreOuvrage: string | null
  readonly lotNumero: string | null
  readonly lotIntitule: string | null
  readonly dateGeneration: Date
}

/** Une pièce que l'application a produite : CCTP, bordereau. */
export interface DocumentProduit {
  readonly dossier: string
  readonly nom: string
  readonly libelle: string
  readonly donnees: Buffer
}

/** Une pièce déposée par l'économiste et transmise telle quelle. */
export interface PieceTransmise {
  readonly nom: string
  readonly libelle: string
  readonly categorie: CategoriePiece
  readonly indice: string | null
  readonly empreinte: string
  readonly lotLibelle: string | null
  readonly donnees: Buffer
}

function sansAccent(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function nomDossier(info: InfoDossier): string {
  const operation = sansAccent(info.nomOperation).slice(0, 50)
  const lot = info.lotNumero === null ? 'Tous-lots' : `Lot-${sansAccent(info.lotNumero)}`
  return `${info.reference}-${operation}-${lot}-DCE`
}

export function nomFichierDossier(info: InfoDossier): string {
  return `${nomDossier(info)}.zip`
}

/**
 * Bordereau des pièces : ce que contient l'envoi, noir sur blanc.
 * L'empreinte permet de vérifier plus tard qu'un fichier reçu est bien celui
 * qui est parti — c'est ce qui rend une transmission opposable.
 */
async function genererBordereau(
  info: InfoDossier,
  documents: readonly DocumentProduit[],
  pieces: readonly PieceTransmise[],
): Promise<Buffer> {
  const classeur = new ExcelJS.Workbook()
  classeur.creator = 'Application de gestion de missions d’économiste'
  classeur.created = info.dateGeneration

  const feuille = classeur.addWorksheet('Bordereau des pièces')
  feuille.columns = [
    { width: 6 }, { width: 44 }, { width: 10 }, { width: 40 },
    { width: 12 }, { width: 26 }, { width: 68 },
  ]

  feuille.addRow([`${info.reference} · ${info.nomOperation}`]).font = { bold: true, size: 13 }
  if (info.lotNumero !== null) {
    feuille.addRow([`Lot ${info.lotNumero} — ${info.lotIntitule ?? ''}`]).font = { bold: true }
  }
  if (info.maitreOuvrage !== null) feuille.addRow([`Maître d’ouvrage : ${info.maitreOuvrage}`])
  feuille.addRow([
    `Dossier constitué le ${info.dateGeneration.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })}`,
  ])
  feuille.addRow([])

  const entete = feuille.addRow([
    'N°', 'Pièce', 'Indice', 'Fichier', 'Taille', 'Emplacement', 'Empreinte SHA-256',
  ])
  entete.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  for (let i = 1; i <= 7; i += 1) {
    entete.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF13211D' } }
  }

  let numero = 0
  for (const document of documents) {
    numero += 1
    feuille.addRow([
      numero,
      document.libelle,
      '',
      document.nom,
      formaterTaille(document.donnees.length),
      document.dossier,
      '',
    ])
  }

  for (const piece of pieces) {
    numero += 1
    feuille.addRow([
      numero,
      [piece.libelle, piece.lotLibelle === null ? null : `(lot ${piece.lotLibelle})`]
        .filter(Boolean)
        .join(' '),
      piece.indice ?? '',
      piece.nom,
      formaterTaille(piece.donnees.length),
      `${DOSSIERS_CATEGORIE[piece.categorie]} — ${LIBELLES_CATEGORIE[piece.categorie]}`,
      piece.empreinte,
    ])
  }

  feuille.addRow([])
  feuille.addRow([
    '',
    `${numero} pièce(s) au total.`,
  ]).font = { bold: true }
  feuille.addRow([
    '',
    'L’empreinte SHA-256 identifie le fichier transmis : deux fichiers d’empreintes différentes ne sont pas le même document.',
  ]).font = { italic: true, size: 10 }

  return Buffer.from(await classeur.xlsx.writeBuffer())
}

/**
 * Assemble l'archive. Les noms de dossiers sont numérotés pour que l'ordre
 * d'ouverture soit celui de la lecture, quel que soit l'explorateur de fichiers
 * de l'entreprise.
 */
export async function genererDossierConsultation(
  info: InfoDossier,
  documents: readonly DocumentProduit[],
  pieces: readonly PieceTransmise[],
): Promise<Buffer> {
  const archive = new JSZip()
  const racine = archive.folder(nomDossier(info))
  if (racine === null) throw new Error('Archive impossible à constituer.')

  const bordereau = await genererBordereau(info, documents, pieces)
  racine.file('00-Bordereau-des-pieces.xlsx', bordereau)

  for (const document of documents) {
    racine.folder(document.dossier)?.file(document.nom, document.donnees)
  }

  // Deux pièces peuvent porter le même nom dans la même catégorie — deux
  // « Plan RDC.pdf » venus de deux émetteurs. On les distingue plutôt que d'en
  // écraser une silencieusement.
  const nomsPris = new Set<string>()
  for (const piece of pieces) {
    const dossier = DOSSIERS_CATEGORIE[piece.categorie]
    let nom = piece.nom
    let suffixe = 1
    while (nomsPris.has(`${dossier}/${nom}`)) {
      suffixe += 1
      const point = piece.nom.lastIndexOf('.')
      nom =
        point <= 0
          ? `${piece.nom} (${suffixe})`
          : `${piece.nom.slice(0, point)} (${suffixe})${piece.nom.slice(point)}`
    }
    nomsPris.add(`${dossier}/${nom}`)
    racine.folder(dossier)?.file(nom, piece.donnees)
  }

  return archive.generateAsync({
    type: 'nodebuffer',
    // Les PDF et les DWG sont déjà compressés : insister coûte du temps pour
    // quelques octets. Le niveau moyen suffit.
    compression: 'DEFLATE',
    compressionOptions: { level: 5 },
  })
}

export { DOSSIER_BORDEREAU, DOSSIER_PIECES_ECRITES }
