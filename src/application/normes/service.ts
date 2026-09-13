import type { Prisma, PrismaClient, StatutNorme as StatutPrisma } from '@prisma/client'
import { canoniserReference } from '../../domain/normes/citation'
import {
  normesAAjouter,
  synthetiserNormes,
  verifierNormes,
  type AnomalieNorme,
  type NormeConnue,
  type SyntheseNormes,
  type TexteAVerifier,
} from '../../domain/normes/verification'
import type { ReleveNorme, SourceNormes } from '../ports/source-normes'
import { chargerChiffrage } from '../chiffrage/service'
import { chargerTextes } from '../dce/service'
import { difference, journaliser } from '../audit/service'

/**
 * Tenue du référentiel des normes — voir `src/application/ports/source-normes.ts`
 * pour ce que l'application peut et ne peut pas récupérer toute seule.
 *
 * Rien ici ne modifie un texte de CCTP. Remplacer une référence dans une pièce
 * contractuelle change ce que le marché prescrit : l'application signale, et
 * l'économiste décide.
 */

export interface EntreeNorme {
  readonly reference: string
  readonly titre?: string | null
  readonly statut?: StatutPrisma
  readonly dateEdition?: Date | null
  readonly dateVerification?: Date | null
  readonly source?: string | null
  readonly remplaceePar?: string | null
  readonly commentaire?: string | null
  readonly corpsEtatId?: string | null
}

export class NormeIntrouvable extends Error {
  constructor(id: string) {
    super(`Référence normative introuvable : ${id}`)
    this.name = 'NormeIntrouvable'
  }
}

/** Le référentiel complet, dans la forme qu'attend le domaine. */
export async function chargerReferentiel(client: PrismaClient): Promise<NormeConnue[]> {
  const lignes = await client.referenceNormative.findMany({ orderBy: { reference: 'asc' } })
  return lignes.map((ligne) => ({
    reference: ligne.reference,
    titre: ligne.titre,
    statut: ligne.statut,
    dateEdition: ligne.dateEdition,
    dateVerification: ligne.dateVerification,
    remplaceePar: ligne.remplaceePar,
  }))
}

export async function ajouterNorme(client: PrismaClient, entree: EntreeNorme): Promise<string> {
  const reference = canoniserReference(entree.reference)
  if (reference.trim() === '') throw new Error('Une référence est nécessaire.')

  const norme = await client.referenceNormative.create({
    data: {
      reference,
      titre: entree.titre ?? null,
      statut: entree.statut ?? 'EN_VIGUEUR',
      dateEdition: entree.dateEdition ?? null,
      dateVerification: entree.dateVerification ?? new Date(),
      source: entree.source ?? null,
      remplaceePar: entree.remplaceePar ? canoniserReference(entree.remplaceePar) : null,
      commentaire: entree.commentaire ?? null,
      corpsEtatId: entree.corpsEtatId ?? null,
      // `ownerId` est posé par l'extension Prisma, pas ici.
    } as unknown as Prisma.ReferenceNormativeCreateInput,
    select: { id: true, reference: true, statut: true },
  })

  await journaliser(client, {
    entite: 'Norme',
    entiteId: norme.id,
    action: 'CREATION',
    apres: { reference: norme.reference, statut: norme.statut },
  })

  return norme.id
}

export async function modifierNorme(
  client: PrismaClient,
  id: string,
  entree: Partial<EntreeNorme>,
): Promise<void> {
  const avant = await client.referenceNormative.findFirst({ where: { id } })
  if (!avant) throw new NormeIntrouvable(id)

  const donnees = {
    ...(entree.reference !== undefined ? { reference: canoniserReference(entree.reference) } : {}),
    ...(entree.titre !== undefined ? { titre: entree.titre } : {}),
    ...(entree.statut !== undefined ? { statut: entree.statut } : {}),
    ...(entree.dateEdition !== undefined ? { dateEdition: entree.dateEdition } : {}),
    ...(entree.dateVerification !== undefined ? { dateVerification: entree.dateVerification } : {}),
    ...(entree.source !== undefined ? { source: entree.source } : {}),
    ...(entree.remplaceePar !== undefined
      ? { remplaceePar: entree.remplaceePar ? canoniserReference(entree.remplaceePar) : null }
      : {}),
    ...(entree.commentaire !== undefined ? { commentaire: entree.commentaire } : {}),
    ...(entree.corpsEtatId !== undefined ? { corpsEtatId: entree.corpsEtatId } : {}),
  }

  const apres = await client.referenceNormative.update({ where: { id }, data: donnees })

  const ecart = difference(
    avant as unknown as Record<string, unknown>,
    apres as unknown as Record<string, unknown>,
  )
  if (ecart) {
    await journaliser(client, {
      entite: 'Norme',
      entiteId: id,
      action: 'MODIFICATION',
      avant: ecart.avant,
      apres: ecart.apres,
    })
  }
}

export async function supprimerNorme(client: PrismaClient, id: string): Promise<void> {
  const norme = await client.referenceNormative.findFirst({
    where: { id },
    select: { reference: true, statut: true },
  })
  if (!norme) throw new NormeIntrouvable(id)

  await client.referenceNormative.delete({ where: { id } })
  await journaliser(client, {
    entite: 'Norme',
    entiteId: id,
    action: 'SUPPRESSION',
    avant: { reference: norme.reference, statut: norme.statut },
  })
}

/* --------------------------------------------------------------------------
   Contrôle d'une mission
   -------------------------------------------------------------------------- */

export interface ControleNormes {
  readonly anomalies: readonly AnomalieNorme[]
  readonly synthese: SyntheseNormes
  /** Références citées et absentes du référentiel, prêtes à y être versées. */
  readonly aVerser: readonly string[]
}

/** Rassemble les textes d'une mission sous la forme qu'attend le domaine. */
export async function textesDeMission(
  client: PrismaClient,
  missionId: string,
): Promise<TexteAVerifier[]> {
  const [chiffrage, textes] = await Promise.all([
    chargerChiffrage(client, missionId),
    chargerTextes(client, missionId),
  ])

  const aVerifier: TexteAVerifier[] = []
  for (const lot of chiffrage.lots) {
    for (const poste of lot.postes) {
      const texte = textes.get(poste.id)
      if (!texte || texte.contenu.trim() === '') continue
      aVerifier.push({
        posteId: poste.id,
        repere: `Lot ${lot.numero} · ${poste.code ?? 'sans code'} ${poste.designation}`.trim(),
        contenu: texte.contenu,
      })
    }
  }
  return aVerifier
}

export async function controlerMission(
  client: PrismaClient,
  missionId: string,
  aujourdhui: Date = new Date(),
): Promise<ControleNormes> {
  const [textes, referentiel] = await Promise.all([
    textesDeMission(client, missionId),
    chargerReferentiel(client),
  ])

  const anomalies = verifierNormes(textes, referentiel, aujourdhui)

  return {
    anomalies,
    synthese: synthetiserNormes(textes, anomalies),
    aVerser: normesAAjouter(textes, referentiel).map((citation) => citation.reference),
  }
}

/* --------------------------------------------------------------------------
   Amorçage et mise à jour
   -------------------------------------------------------------------------- */

export interface ResultatAmorcage {
  readonly ajoutees: readonly string[]
  readonly dejaConnues: number
}

/**
 * Amorce le référentiel à partir des textes déjà écrits, toutes missions
 * confondues. Sept ans de CCTP contiennent déjà la liste des normes qui
 * comptent pour ce métier : autant partir de là plutôt que d'une page blanche.
 *
 * Les références versées arrivent SANS statut vérifié : elles sont marquées
 * comme telles et ressortiront au contrôle tant que l'économiste ne les a pas
 * confirmées. On ne présume jamais qu'une norme est en vigueur.
 */
export async function amorcerDepuisTextes(client: PrismaClient): Promise<ResultatAmorcage> {
  const missions = await client.mission.findMany({ select: { id: true } })

  const tousLesTextes: TexteAVerifier[] = []
  for (const mission of missions) {
    tousLesTextes.push(...(await textesDeMission(client, mission.id)))
  }

  const referentiel = await chargerReferentiel(client)
  const manquantes = normesAAjouter(tousLesTextes, referentiel)

  for (const citation of manquantes) {
    await client.referenceNormative.create({
      data: {
        reference: citation.reference,
        statut: 'EN_VIGUEUR',
        dateVerification: null, // jamais vérifié : le contrôle le dira
        source: 'Relevé dans vos propres textes de CCTP',
      } as unknown as Prisma.ReferenceNormativeCreateInput,
    })
  }

  if (manquantes.length > 0) {
    await journaliser(client, {
      entite: 'Norme',
      entiteId: 'amorcage',
      action: 'CREATION',
      apres: { referencesVersees: manquantes.length },
    })
  }

  return {
    ajoutees: manquantes.map((citation) => citation.reference),
    dejaConnues: referentiel.length,
  }
}

export interface ResultatMiseAJour {
  readonly misesAJour: readonly { reference: string; avant: string; apres: string }[]
  readonly inchangees: number
  readonly nonTrouvees: readonly string[]
}

/**
 * Confronte le référentiel à une source et applique ce qu'elle rend.
 *
 * La source ne touche qu'au statut, au titre, aux dates et au remplacement :
 * jamais aux commentaires de l'économiste, jamais à un texte de CCTP.
 */
export async function mettreAJourDepuis(
  client: PrismaClient,
  source: SourceNormes,
): Promise<ResultatMiseAJour> {
  const referentiel = await client.referenceNormative.findMany()
  const releves = await source.consulter(referentiel.map((norme) => norme.reference))
  const parReference = new Map<string, ReleveNorme>(releves.map((r) => [r.reference, r]))

  const misesAJour: { reference: string; avant: string; apres: string }[] = []
  const nonTrouvees: string[] = []
  let inchangees = 0

  for (const norme of referentiel) {
    const releve = parReference.get(norme.reference)
    if (!releve) {
      nonTrouvees.push(norme.reference)
      continue
    }

    const change =
      releve.statut !== norme.statut ||
      (releve.remplaceePar ?? null) !== norme.remplaceePar ||
      (releve.titre ?? null) !== norme.titre

    await client.referenceNormative.update({
      where: { id: norme.id },
      data: {
        statut: releve.statut,
        titre: releve.titre ?? norme.titre,
        dateEdition: releve.dateEdition ?? norme.dateEdition,
        remplaceePar: releve.remplaceePar,
        dateVerification: new Date(),
        source: releve.source,
      },
    })

    if (change) {
      misesAJour.push({ reference: norme.reference, avant: norme.statut, apres: releve.statut })
      await journaliser(client, {
        entite: 'Norme',
        entiteId: norme.id,
        action: 'MODIFICATION',
        avant: { statut: norme.statut, remplaceePar: norme.remplaceePar },
        apres: { statut: releve.statut, remplaceePar: releve.remplaceePar },
      })
    } else {
      inchangees += 1
    }
  }

  return { misesAJour, inchangees, nonTrouvees }
}
