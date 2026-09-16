import { Prisma, type PrismaClient } from '@prisma/client'
import {
  comparerVersions,
  estChiffrageFige,
  type ChiffrageFige,
  type Comparaison,
  type LotFige,
} from '../../domain/chiffrage/comparaison'
import * as Money from '../../domain/money/money'
import { chargerChiffrage } from './service'
import { journaliser } from '../audit/service'

/**
 * Versions de chiffrage figées — point 10.4.
 *
 * Un DPGF évolue entre l'avant-projet, le projet et le dossier de consultation.
 * Sans instantané, « l'écart vis-à-vis de l'estimatif initial » n'a pas de
 * référent : c'est la raison pour laquelle le suivi de chantier comparait
 * jusqu'ici au chiffrage courant, en le disant.
 *
 * Une version figée ne bouge plus jamais. C'est ce qui lui donne sa valeur :
 * elle sert de témoin, et un témoin qu'on retouche ne témoigne de rien. Elle se
 * supprime, mais ne se modifie pas.
 */

export type PhaseContractuelle = 'ESQ' | 'APS' | 'APD' | 'PRO' | 'DCE' | 'ACT' | 'DET' | 'AOR'

export const LIBELLES_PHASE: Record<PhaseContractuelle, string> = {
  ESQ: 'Esquisse',
  APS: 'Avant-projet sommaire',
  APD: 'Avant-projet définitif',
  PRO: 'Projet',
  DCE: 'Dossier de consultation',
  ACT: 'Assistance aux contrats de travaux',
  DET: 'Direction de l’exécution',
  AOR: 'Réception',
}

export class VersionIntrouvable extends Error {
  constructor(id: string) {
    super(`Version de chiffrage introuvable ou inaccessible : ${id}`)
    this.name = 'VersionIntrouvable'
  }
}

/** Repère la version courante, qui n'est pas figée mais sert de point d'arrivée. */
export const COURANT = 'courant'

/* ------------------------------------------------------------------ */

/**
 * Construit l'instantané du chiffrage tel qu'il est maintenant.
 *
 * Seuls les ouvrages sont retenus : un sous-lot ne porte qu'un sous-total,
 * déjà compris dans le montant du lot. Les inscrire compterait deux fois.
 */
export async function instantanerMaintenant(
  client: PrismaClient,
  missionId: string,
): Promise<ChiffrageFige> {
  const chiffrage = await chargerChiffrage(client, missionId)

  const lots: LotFige[] = chiffrage.lots.map((lot) => {
    const lignes = lot.postes
      .filter((poste) => poste.type === 'OUVRAGE')
      .map((poste) => ({
        posteId: poste.id,
        code: poste.code,
        designation: poste.designation,
        unite: poste.unite,
        quantite: poste.quantite,
        prixUnitaireHtFinal: poste.prixUnitaireHtFinal,
        montantHt: poste.montantHt,
      }))

    // Le montant du lot est la somme des lignes retenues, pas le total stocké.
    // Les deux coïncident tant que le recalcul a fait son travail, mais un
    // instantané doit être cohérent avec lui-même par construction : c'est un
    // témoin, et la comparaison rapproche ses totaux de ses propres lignes.
    return {
      lotId: lot.id,
      numero: lot.numero,
      intitule: lot.intitule,
      montantEstimeHt: Money.somme(
        lignes.map((ligne) => Money.depuisCentimes(ligne.montantHt)),
      ).toString(),
      lignes,
    }
  })

  const montantTceHt = Money.somme(
    lots.map((lot) => Money.depuisCentimes(lot.montantEstimeHt)),
  ).toString()

  return { version: 1, montantTceHt, lots }
}

export interface EntreeVersion {
  readonly phase: PhaseContractuelle
  readonly libelle?: string
}

/** Fige le chiffrage courant. L'instantané ne bougera plus. */
export async function figerVersion(
  client: PrismaClient,
  missionId: string,
  entree: EntreeVersion,
): Promise<string> {
  const instantane = await instantanerMaintenant(client, missionId)

  const version = await client.chiffrageVersion.create({
    data: {
      missionId,
      phase: entree.phase,
      libelle: entree.libelle?.trim() || LIBELLES_PHASE[entree.phase],
      montantTceHt: BigInt(instantane.montantTceHt),
      contenu: instantane as unknown as Prisma.InputJsonValue,
    } as unknown as Prisma.ChiffrageVersionCreateInput,
    select: { id: true },
  })

  await journaliser(client, {
    entite: 'Mission',
    entiteId: missionId,
    action: 'CREATION',
    apres: {
      phase: entree.phase,
      montantTceHt: instantane.montantTceHt,
      nbLots: instantane.lots.length,
    },
  })

  return version.id
}

export interface VersionResume {
  readonly id: string
  readonly phase: PhaseContractuelle
  readonly libelle: string
  readonly figeLe: Date
  readonly montantTceHt: string
  readonly nbLots: number
  readonly nbLignes: number
}

export async function listerVersions(
  client: PrismaClient,
  missionId: string,
): Promise<VersionResume[]> {
  const versions = await client.chiffrageVersion.findMany({
    where: { missionId },
    orderBy: { figeLe: 'asc' },
  })

  return versions.map((version) => {
    const contenu = estChiffrageFige(version.contenu) ? version.contenu : null
    return {
      id: version.id,
      phase: version.phase as PhaseContractuelle,
      libelle: version.libelle,
      figeLe: version.figeLe,
      montantTceHt: version.montantTceHt.toString(),
      nbLots: contenu?.lots.length ?? 0,
      nbLignes: contenu?.lots.reduce((n, lot) => n + lot.lignes.length, 0) ?? 0,
    }
  })
}

async function chargerInstantane(
  client: PrismaClient,
  missionId: string,
  id: string,
): Promise<{ instantane: ChiffrageFige; libelle: string }> {
  if (id === COURANT) {
    return { instantane: await instantanerMaintenant(client, missionId), libelle: 'Chiffrage actuel' }
  }

  const version = await client.chiffrageVersion.findFirst({
    where: { id, missionId },
    select: { contenu: true, libelle: true },
  })
  if (!version) throw new VersionIntrouvable(id)

  if (!estChiffrageFige(version.contenu)) {
    // Un instantané illisible ne se devine pas : on le dit — règle 7.
    throw new Error(
      `L’instantané « ${version.libelle} » est illisible. Il a probablement été écrit par une version plus récente de l’application.`,
    )
  }

  return { instantane: version.contenu, libelle: version.libelle }
}

export interface ComparaisonNommee extends Comparaison {
  readonly libelleAvant: string
  readonly libelleApres: string
}

/**
 * Compare deux versions. L'une ou l'autre peut être `COURANT`, ce qui répond à
 * la question la plus fréquente : où en est-on depuis le dernier figeage ?
 */
export async function comparer(
  client: PrismaClient,
  missionId: string,
  avantId: string,
  apresId: string,
): Promise<ComparaisonNommee> {
  const [avant, apres] = await Promise.all([
    chargerInstantane(client, missionId, avantId),
    chargerInstantane(client, missionId, apresId),
  ])

  return {
    ...comparerVersions(avant.instantane, apres.instantane),
    libelleAvant: avant.libelle,
    libelleApres: apres.libelle,
  }
}

/**
 * Supprime une version figée.
 *
 * Une version se supprime mais ne se modifie pas : un témoin qu'on retouche ne
 * témoigne de rien. Se tromper de phase au figeage reste rattrapable.
 */
export async function supprimerVersion(
  client: PrismaClient,
  missionId: string,
  id: string,
): Promise<void> {
  const supprimees = await client.chiffrageVersion.deleteMany({ where: { id, missionId } })
  if (supprimees.count === 0) throw new VersionIntrouvable(id)

  await journaliser(client, {
    entite: 'Mission',
    entiteId: missionId,
    action: 'SUPPRESSION',
    avant: { versionFigee: id },
  })
}
