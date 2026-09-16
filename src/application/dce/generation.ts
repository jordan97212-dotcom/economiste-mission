import type { PrismaClient } from '@prisma/client'
import {
  apparierTrames,
  synthetiserAppariement,
  type Appariement,
  type SyntheseAppariement,
} from '../../domain/texte/appariement'
import { contenuDeTrame } from '../trames/service'
import { appliquerTrame } from './service'
import { estTexteStructure } from '../../domain/texte/structure'

/**
 * Génération du CCTP depuis le DPGF — SPEC_APP_ECONOMISTE.md §5.4.
 *
 * Rédiger un CCTP revient, pour l'essentiel, à retrouver pour chaque ligne du
 * bordereau le texte qu'on a déjà écrit ailleurs. Ce service fait ce
 * rapprochement lot par lot et propose d'appliquer les trames correspondantes.
 *
 * Il ne rédige rien. Un ouvrage sans trame ressort comme étant à rédiger, et
 * c'est volontaire : un CCTP est une pièce contractuelle que l'économiste
 * signe, et une prescription inventée l'engagerait sur des tolérances ou des
 * normes que personne n'a vérifiées — règle 9.
 *
 * Proposer et appliquer sont deux gestes séparés : `proposerGeneration` ne
 * touche pas la base, `appliquerGeneration` n'écrit que ce qui a été coché.
 */

export interface PropositionLot {
  readonly lotId: string
  readonly numero: string
  readonly intitule: string
  readonly corpsEtat: string | null
  readonly appariements: readonly Appariement[]
  readonly synthese: SyntheseAppariement
  /** Nombre de trames disponibles pour ce lot, généralités comprises. */
  readonly nbTramesDisponibles: number
}

export interface PropositionGeneration {
  readonly lots: readonly PropositionLot[]
  readonly synthese: SyntheseAppariement
}

/** Rapproche les ouvrages de la bibliothèque. N'écrit rien. */
export async function proposerGeneration(
  client: PrismaClient,
  missionId: string,
): Promise<PropositionGeneration> {
  const [lots, trames] = await Promise.all([
    client.lot.findMany({
      where: { missionId },
      orderBy: { numero: 'asc' },
      select: {
        id: true,
        numero: true,
        intitule: true,
        corpsEtatId: true,
        corpsEtat: { select: { code: true, libelle: true } },
        postes: {
          where: { type: 'OUVRAGE' },
          orderBy: { ordre: 'asc' },
          select: { id: true, designation: true, texteCctp: true },
        },
      },
    }),
    client.trame.findMany({
      where: { type: 'CCTP' },
      select: { id: true, intitule: true, corpsEtatId: true, contenu: true },
    }),
  ])

  // Une trame sans texte exploitable ne sert à rien : l'appliquer échouerait.
  const candidates = trames
    .filter((trame) => estTexteStructure(trame.contenu) && contenuDeTrame(trame.contenu).trim() !== '')
    .map((trame) => ({
      trameId: trame.id,
      intitule: trame.intitule,
      corpsEtatId: trame.corpsEtatId,
    }))

  const propositions: PropositionLot[] = lots.map((lot) => {
    const appariements = apparierTrames(
      lot.postes
        // Une ligne sans désignation n'a rien à quoi se raccrocher.
        .filter((poste) => poste.designation.trim() !== '')
        .map((poste) => ({
          posteId: poste.id,
          designation: poste.designation,
          aDejaUnTexte: contenuDeTrame(poste.texteCctp).trim() !== '',
        })),
      candidates,
      lot.corpsEtatId,
    )

    return {
      lotId: lot.id,
      numero: lot.numero,
      intitule: lot.intitule,
      corpsEtat: lot.corpsEtat ? `${lot.corpsEtat.code} · ${lot.corpsEtat.libelle}` : null,
      appariements,
      synthese: synthetiserAppariement(appariements),
      nbTramesDisponibles: candidates.filter(
        (t) => t.corpsEtatId === null || t.corpsEtatId === lot.corpsEtatId,
      ).length,
    }
  })

  return {
    lots: propositions,
    synthese: synthetiserAppariement(propositions.flatMap((lot) => lot.appariements)),
  }
}

export interface ChoixGeneration {
  readonly posteId: string
  readonly trameId: string
}

export interface ResultatGeneration {
  readonly nbAppliquees: number
  readonly echecs: readonly string[]
}

/**
 * Applique les trames retenues, une par ouvrage.
 *
 * Chaque application passe par `appliquerTrame`, donc par le même chemin que
 * l'application manuelle : même écriture, même journal, même mémorisation de la
 * désignation du moment. Un échec sur une ligne n'arrête pas les autres, et
 * remonte à l'écran plutôt que de disparaître.
 */
export async function appliquerGeneration(
  client: PrismaClient,
  missionId: string,
  choix: readonly ChoixGeneration[],
): Promise<ResultatGeneration> {
  const echecs: string[] = []
  let nbAppliquees = 0

  for (const { posteId, trameId } of choix) {
    try {
      await appliquerTrame(client, missionId, posteId, trameId)
      nbAppliquees += 1
    } catch (erreur) {
      echecs.push(erreur instanceof Error ? erreur.message : String(erreur))
    }
  }

  return { nbAppliquees, echecs }
}
