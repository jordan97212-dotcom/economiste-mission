import type { PrismaClient } from '@prisma/client'
import { chargerChiffrage } from '../chiffrage/service'
import { preparerPiece, verifierMission } from './service'
import { piecesDuDossier, lirePiece } from '../pieces/service'
import { genererCctp, genererPieceSimple } from '../../infrastructure/docx/pieces-ecrites'
import { genererDpgfExcel } from '../../infrastructure/excel/dpgf-export'
import {
  genererDossierConsultation,
  nomFichierDossier,
  type DocumentProduit,
  type InfoDossier,
  type PieceTransmise,
} from '../../infrastructure/zip/dossier-consultation'
import { nomDansArchive, type CategoriePiece } from '../../domain/pieces/validation'
import type { ChiffrageDTO } from '../dto'

/**
 * Constitution du dossier de consultation — SPEC_APP_ECONOMISTE.md §5.5.
 *
 * Rassemble en une archive ce qu'on envoie à une entreprise : les pièces
 * écrites, le bordereau à remplir, et les pièces déposées qui concernent le
 * lot. C'est le geste qui prenait une demi-heure à chaque envoi.
 *
 * Ce qui n'y entre pas : le bordereau chiffré. L'entreprise reçoit la variante
 * à remplir, sans les prix de l'économiste — règle 8.
 */

export class DossierImpossible extends Error {
  readonly detail: readonly string[]
  constructor(message: string, detail: readonly string[] = []) {
    super(message)
    this.detail = detail
    this.name = 'DossierImpossible'
  }
}

/** Réduit le chiffrage à un seul lot, sans toucher au reste de la structure. */
function limiterAuLot(chiffrage: ChiffrageDTO, lotId: string | null): ChiffrageDTO {
  if (lotId === null) return chiffrage
  const lot = chiffrage.lots.find((l) => l.id === lotId)
  if (!lot) throw new DossierImpossible('Lot introuvable dans cette mission.')
  return {
    ...chiffrage,
    lots: [lot],
    recapitulatif: {
      ...chiffrage.recapitulatif,
      lots: chiffrage.recapitulatif.lots.filter((l) => l.lotId === lotId),
    },
  }
}

export interface OptionsDossier {
  /** Null = toute l'opération, tous lots confondus. */
  readonly lotId: string | null
  /** Produire malgré les anomalies bloquantes du contrôle de cohérence. */
  readonly forcer?: boolean
}

export interface DossierConstitue {
  readonly archive: Buffer
  readonly nomFichier: string
  readonly info: InfoDossier
  readonly nbPieces: number
}

export async function assemblerDossier(
  client: PrismaClient,
  missionId: string,
  options: OptionsDossier,
): Promise<DossierConstitue> {
  const { lotId } = options

  // Le contrôle de cohérence tourne avant, comme pour le CCTP seul : un dossier
  // de consultation incomplet ne doit pas partir par inadvertance.
  if (options.forcer !== true) {
    const synthese = await verifierMission(client, missionId)
    if (!synthese.exportPossible) {
      throw new DossierImpossible(
        `Le contrôle de cohérence relève ${synthese.nbBloquantes} anomalie(s) bloquante(s).`,
        synthese.anomalies
          .filter((a) => a.severite === 'bloquante')
          .slice(0, 20)
          .map((a) => a.message),
      )
    }
  }

  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { id: true, reference: true, nomOperation: true, maitreOuvrage: true },
  })
  if (!mission) throw new DossierImpossible('Mission introuvable.')

  const lot =
    lotId === null
      ? null
      : await client.lot.findFirst({
          where: { id: lotId, missionId },
          select: { numero: true, intitule: true },
        })
  if (lotId !== null && lot === null) throw new DossierImpossible('Lot introuvable.')

  const info: InfoDossier = {
    reference: mission.reference,
    nomOperation: mission.nomOperation,
    maitreOuvrage: mission.maitreOuvrage,
    lotNumero: lot?.numero ?? null,
    lotIntitule: lot?.intitule ?? null,
    dateGeneration: new Date(),
  }

  const documents: DocumentProduit[] = []

  /* --- Les pièces écrites --- */
  const cctp = await preparerPiece(client, missionId, 'CCTP')
  const chiffrageDuLot = limiterAuLot(cctp.chiffrage, lotId)
  documents.push({
    dossier: '01-Pieces-ecrites',
    nom: `CCTP${lot ? ` - Lot ${lot.numero}` : ''}.docx`,
    libelle: 'Cahier des clauses techniques particulières',
    donnees: await genererCctp(chiffrageDuLot, cctp.textes, cctp.contenu),
  })

  // CCAP et CCTG ne sont pas toujours rédigés. Leur absence n'empêche pas
  // l'envoi : elle se lit dans le bordereau des pièces.
  for (const piece of ['CCAP', 'CCTG'] as const) {
    try {
      const preparation = await preparerPiece(client, missionId, piece)
      documents.push({
        dossier: '01-Pieces-ecrites',
        nom: `${piece}.docx`,
        libelle:
          piece === 'CCAP'
            ? 'Cahier des clauses administratives particulières'
            : 'Cahier des clauses techniques générales',
        donnees: await genererPieceSimple(
          limiterAuLot(preparation.chiffrage, lotId),
          piece,
          preparation.contenu ?? '',
        ),
      })
    } catch {
      // Trame absente ou vide : on continue sans.
    }
  }

  /* --- Le bordereau à remplir, jamais le chiffré --- */
  documents.push({
    dossier: '02-Bordereau',
    nom: `DPGF a remplir${lot ? ` - Lot ${lot.numero}` : ''}.xlsx`,
    libelle: 'Bordereau de prix à remplir (DPGF)',
    donnees: await genererDpgfExcel(chiffrageDuLot, { variante: 'a-remplir' }),
  })

  /* --- Les pièces déposées --- */
  const listees = await piecesDuDossier(client, missionId, lotId)
  const transmises: PieceTransmise[] = []
  for (const piece of listees) {
    const { donnees } = await lirePiece(client, missionId, piece.id)
    transmises.push({
      nom: nomDansArchive({
        nomFichier: piece.nomFichier,
        libelle: piece.libelle,
        indice: piece.indice,
      }),
      libelle: piece.libelle ?? piece.nomFichier,
      categorie: piece.categorie as CategoriePiece,
      indice: piece.indice,
      lotLibelle: piece.lotLibelle,
      empreinte: piece.empreinte,
      donnees,
    })
  }

  const archive = await genererDossierConsultation(info, documents, transmises)

  return {
    archive,
    nomFichier: nomFichierDossier(info),
    info,
    nbPieces: documents.length + transmises.length,
  }
}

/** Ce que contiendrait le dossier, sans le produire — pour l'afficher avant d'envoyer. */
export async function inventorierDossier(
  client: PrismaClient,
  missionId: string,
  lotId: string | null,
): Promise<{ pieces: Awaited<ReturnType<typeof piecesDuDossier>>; chiffrageVide: boolean }> {
  const [pieces, chiffrage] = await Promise.all([
    piecesDuDossier(client, missionId, lotId),
    chargerChiffrage(client, missionId),
  ])
  const lots = lotId === null ? chiffrage.lots : chiffrage.lots.filter((l) => l.id === lotId)
  return {
    pieces,
    chiffrageVide: lots.every((lot) => lot.postes.length === 0),
  }
}
