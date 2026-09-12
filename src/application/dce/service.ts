import { Prisma, type PrismaClient } from '@prisma/client'
import * as Money from '../../domain/money/money'
import {
  creerTexte,
  estTexteStructure,
  estVide,
  resoudreVariables,
  type TexteStructure,
} from '../../domain/texte/structure'
import {
  synthetiser,
  verifierCoherence,
  type LotVerif,
  type SyntheseCoherence,
} from '../../domain/coherence/verification'
import { chargerChiffrage, MissionIntrouvable } from '../chiffrage/service'
import type { ChiffrageDTO } from '../dto'

/**
 * Pièces écrites du DCE — SPEC_APP_ECONOMISTE.md §5.4.
 *
 * Le lien DPGF vers CCTP n'est pas une jointure : chaque ouvrage porte son texte
 * descriptif. La génération ne fait que parcourir les lots dans l'ordre. Le
 * contrôle de cohérence, lui, vit dans le domaine et tourne sans base.
 */

export type PieceEcrite = 'CCTP' | 'CCAP' | 'CCTG'

export interface TexteOuvrage {
  readonly contenu: string
  readonly designationSource: string | null
}

function lireTexte(valeur: Prisma.JsonValue | null): TexteOuvrage | null {
  if (!estTexteStructure(valeur)) return null
  const structure = valeur as TexteStructure
  return {
    contenu: structure.contenu,
    designationSource: structure.designationSource ?? null,
  }
}

/** Textes descriptifs de tous les ouvrages d'une mission, indexés par poste. */
export async function chargerTextes(
  client: PrismaClient,
  missionId: string,
): Promise<Map<string, TexteOuvrage>> {
  const postes = await client.poste.findMany({
    where: { lot: { missionId } },
    select: { id: true, texteCctp: true },
  })

  const textes = new Map<string, TexteOuvrage>()
  for (const poste of postes) {
    const texte = lireTexte(poste.texteCctp)
    if (texte) textes.set(poste.id, texte)
  }
  return textes
}

/**
 * Enregistre le texte d'un ouvrage, en mémorisant la désignation du moment.
 * C'est ce repère qui permettra de signaler plus tard qu'elle a changé.
 */
export async function enregistrerTexte(
  client: PrismaClient,
  missionId: string,
  posteId: string,
  contenu: string,
): Promise<void> {
  const poste = await client.poste.findFirst({
    where: { id: posteId, lot: { missionId } },
    select: { id: true, designation: true },
  })
  if (!poste) throw new Error(`Poste hors de la mission : ${posteId}`)

  await client.poste.update({
    where: { id: posteId },
    data: {
      texteCctp: estVide(contenu)
        ? Prisma.DbNull
        : (creerTexte(contenu, poste.designation) as unknown as Prisma.InputJsonValue),
    },
  })
}

/** Recopie une trame dans le texte d'un ouvrage, comme point de départ. */
export async function appliquerTrame(
  client: PrismaClient,
  missionId: string,
  posteId: string,
  trameId: string,
): Promise<void> {
  const trame = await client.trame.findUnique({ where: { id: trameId }, select: { contenu: true } })
  if (!trame) throw new Error(`Trame introuvable : ${trameId}`)

  const texte = lireTexte(trame.contenu)
  if (!texte) throw new Error('Cette trame ne contient pas de texte exploitable.')

  await enregistrerTexte(client, missionId, posteId, texte.contenu)
}

// ---------------------------------------------------------------------------
// Contrôle de cohérence
// ---------------------------------------------------------------------------

export async function verifierMission(
  client: PrismaClient,
  missionId: string,
): Promise<SyntheseCoherence> {
  const mission = await client.mission.findUnique({ where: { id: missionId }, select: { id: true } })
  if (!mission) throw new MissionIntrouvable(missionId)

  const lots = await client.lot.findMany({
    where: { missionId },
    orderBy: [{ ordre: 'asc' }, { numero: 'asc' }],
    select: {
      id: true,
      numero: true,
      intitule: true,
      postes: {
        orderBy: { ordre: 'asc' },
        select: {
          id: true,
          type: true,
          code: true,
          designation: true,
          unite: true,
          quantite: true,
          prixUnitaireHtFinal: true,
          texteCctp: true,
        },
      },
    },
  })

  const pourVerification: LotVerif[] = lots.map((lot) => ({
    id: lot.id,
    numero: lot.numero,
    intitule: lot.intitule,
    postes: lot.postes.map((poste) => {
      const texte = lireTexte(poste.texteCctp)
      return {
        id: poste.id,
        type: poste.type,
        code: poste.code,
        designation: poste.designation,
        unite: poste.unite,
        quantite: poste.quantite?.toString() ?? null,
        prixUnitaireHtFinal: poste.prixUnitaireHtFinal?.toString() ?? null,
        texteCctp: texte?.contenu ?? null,
        designationSource: texte?.designationSource ?? null,
      }
    }),
  }))

  return synthetiser(verifierCoherence(pourVerification))
}

// ---------------------------------------------------------------------------
// Variables de mission
// ---------------------------------------------------------------------------

/** Jeu de variables utilisable dans les trames de CCAP et de CCTG. */
export function variablesMission(chiffrage: ChiffrageDTO): Record<string, string | null> {
  const mission = chiffrage.mission
  const total = Money.depuisCentimes(chiffrage.recapitulatif.totalTceHt)

  return {
    nom_operation: mission.nomOperation,
    reference: mission.reference,
    maitre_ouvrage: mission.maitreOuvrage,
    maitre_oeuvre: mission.maitreOeuvre,
    type_marche: mission.typeMarche === 'PUBLIC' ? 'public' : 'privé',
    surface_shon: mission.surfaceShon ? `${mission.surfaceShon.replace('.', ',')} m²` : null,
    surface_utile: mission.surfaceUtile ? `${mission.surfaceUtile.replace('.', ',')} m²` : null,
    montant_travaux_ht: Money.estZero(total) ? null : Money.formater(total),
    nombre_de_lots: String(chiffrage.lots.length),
    taux_tva: `${mission.tauxTva.replace('.', ',')} %`,
    date_du_jour: new Date().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    phases: mission.phasesContractuelles.join(', ') || null,
  }
}

export const VARIABLES_DISPONIBLES = [
  'nom_operation',
  'reference',
  'maitre_ouvrage',
  'maitre_oeuvre',
  'type_marche',
  'surface_shon',
  'surface_utile',
  'montant_travaux_ht',
  'nombre_de_lots',
  'taux_tva',
  'date_du_jour',
  'phases',
] as const

// ---------------------------------------------------------------------------
// Assemblage d'une pièce
// ---------------------------------------------------------------------------

export interface ContenuPiece {
  readonly chiffrage: ChiffrageDTO
  /** Texte descriptif de chaque ouvrage, prêt à mettre en forme. */
  readonly textes: ReadonlyMap<string, string>
  readonly contenu: string | null
  readonly variablesManquantes: readonly string[]
}

/**
 * Rassemble tout ce qu'il faut pour produire une pièce, sans rien mettre en
 * forme : la mise en forme appartient à l'infrastructure documentaire.
 */
export async function preparerPiece(
  client: PrismaClient,
  missionId: string,
  piece: PieceEcrite,
): Promise<ContenuPiece> {
  const chiffrage = await chargerChiffrage(client, missionId)

  if (piece === 'CCTP') {
    const avecContexte = await chargerTextes(client, missionId)
    const textes = new Map([...avecContexte].map(([id, texte]) => [id, texte.contenu]))
    const preambule = await client.trame.findFirst({
      where: { type: 'CCTP', corpsEtatId: null },
      orderBy: { modifieLe: 'desc' },
      select: { contenu: true },
    })
    const texte = preambule ? lireTexte(preambule.contenu) : null
    const resolution = texte
      ? resoudreVariables(texte.contenu, variablesMission(chiffrage))
      : { texte: null, manquantes: [] as string[] }

    return {
      chiffrage,
      textes,
      contenu: resolution.texte,
      variablesManquantes: resolution.manquantes,
    }
  }

  const trame = await client.trame.findFirst({
    where: { type: piece },
    orderBy: { modifieLe: 'desc' },
    select: { contenu: true },
  })
  if (!trame) {
    throw new Error(
      `Aucune trame de ${piece} n’a encore été écrite. Créez-la dans la bibliothèque de trames.`,
    )
  }

  const texte = lireTexte(trame.contenu)
  if (!texte || estVide(texte.contenu)) {
    throw new Error(`La trame de ${piece} est vide.`)
  }

  const resolution = resoudreVariables(texte.contenu, variablesMission(chiffrage))

  return {
    chiffrage,
    textes: new Map(),
    contenu: resolution.texte,
    variablesManquantes: resolution.manquantes,
  }
}
