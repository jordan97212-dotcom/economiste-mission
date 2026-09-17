import type { PrismaClient } from '@prisma/client'
import {
  chiffresSeuls,
  clefComparaison,
  type EntrepriseLue,
} from '../../domain/entreprises/import'
import { creerEntreprise, modifierEntreprise } from './service'

/**
 * Import du répertoire d'entreprises — SPEC_APP_ECONOMISTE.md §3.
 *
 * Ce service écrit ; l'analyse du fichier, elle, n'écrit rien et vit dans le
 * domaine. Les deux gestes restent séparés, comme pour la génération du CCTP :
 * on regarde d'abord, on décide ensuite.
 *
 * Une entreprise déjà au répertoire n'est jamais écrasée. Au mieux ses champs
 * vides sont complétés — ce que l'économiste a saisi de sa main prime sur ce
 * qu'un fichier venu d'ailleurs propose.
 */

export type SurExistante = 'ignorer' | 'completer'

export interface LigneIgnoree {
  readonly ligne: number
  readonly raisonSociale: string
  readonly motif: string
}

export interface ResultatImportEntreprises {
  readonly creees: number
  readonly completees: number
  readonly ignorees: readonly LigneIgnoree[]
}

interface Existante {
  id: string
  raisonSociale: string
  siret: string | null
  contactNom: string | null
  email: string | null
  telephone: string | null
  corpsEtatQualifies: string[]
  zoneIntervention: string | null
  historiqueNotes: string | null
}

/** Le premier renseigné des deux, l'existant d'abord. */
function completer(existant: string | null, propose: string | null): string | null {
  const garde = existant?.trim()
  return garde !== undefined && garde !== '' ? existant : propose
}

export async function importerEntreprises(
  client: PrismaClient,
  entreprises: readonly EntrepriseLue[],
  surExistante: SurExistante,
): Promise<ResultatImportEntreprises> {
  const existantes = (await client.entreprise.findMany({
    select: {
      id: true,
      raisonSociale: true,
      siret: true,
      contactNom: true,
      email: true,
      telephone: true,
      corpsEtatQualifies: true,
      zoneIntervention: true,
      historiqueNotes: true,
    },
  })) as Existante[]

  const parSiret = new Map<string, Existante>()
  const parNom = new Map<string, Existante>()
  for (const entreprise of existantes) {
    const chiffres = entreprise.siret === null ? '' : chiffresSeuls(entreprise.siret)
    if (chiffres.length === 14) parSiret.set(chiffres, entreprise)
    parNom.set(clefComparaison(entreprise.raisonSociale), entreprise)
  }

  let creees = 0
  let completees = 0
  const ignorees: LigneIgnoree[] = []

  for (const lue of entreprises) {
    if (lue.doublonDansLeFichier) {
      ignorees.push({
        ligne: lue.ligne,
        raisonSociale: lue.raisonSociale,
        motif: 'déjà présente plus haut dans le fichier',
      })
      continue
    }

    const chiffres = lue.siret === null ? '' : chiffresSeuls(lue.siret)
    const dejaLa =
      (chiffres.length === 14 ? parSiret.get(chiffres) : undefined) ??
      parNom.get(clefComparaison(lue.raisonSociale))

    if (dejaLa === undefined) {
      const id = await creerEntreprise(client, {
        raisonSociale: lue.raisonSociale,
        siret: lue.siret,
        contactNom: lue.contactNom,
        email: lue.email,
        telephone: lue.telephone,
        corpsEtatQualifies: lue.corpsEtatQualifies,
        zoneIntervention: lue.zoneIntervention,
        historiqueNotes: lue.historiqueNotes,
      })
      creees += 1

      // Une ligne suivante portant le même nom ne doit pas créer un doublon.
      const creee: Existante = {
        id,
        raisonSociale: lue.raisonSociale,
        siret: lue.siret,
        contactNom: lue.contactNom,
        email: lue.email,
        telephone: lue.telephone,
        corpsEtatQualifies: [...lue.corpsEtatQualifies],
        zoneIntervention: lue.zoneIntervention,
        historiqueNotes: lue.historiqueNotes,
      }
      if (chiffres.length === 14) parSiret.set(chiffres, creee)
      parNom.set(clefComparaison(lue.raisonSociale), creee)
      continue
    }

    if (surExistante === 'ignorer') {
      ignorees.push({
        ligne: lue.ligne,
        raisonSociale: lue.raisonSociale,
        motif: `déjà au répertoire sous « ${dejaLa.raisonSociale} »`,
      })
      continue
    }

    // Réunion des corps d'état : on ajoute, on ne retranche jamais.
    const corpsEtat = [...dejaLa.corpsEtatQualifies]
    for (const corps of lue.corpsEtatQualifies) {
      if (!corpsEtat.some((present) => clefComparaison(present) === clefComparaison(corps))) {
        corpsEtat.push(corps)
      }
    }

    const fusionnee = {
      raisonSociale: dejaLa.raisonSociale,
      siret: completer(dejaLa.siret, lue.siret),
      contactNom: completer(dejaLa.contactNom, lue.contactNom),
      email: completer(dejaLa.email, lue.email),
      telephone: completer(dejaLa.telephone, lue.telephone),
      corpsEtatQualifies: corpsEtat,
      zoneIntervention: completer(dejaLa.zoneIntervention, lue.zoneIntervention),
      historiqueNotes: completer(dejaLa.historiqueNotes, lue.historiqueNotes),
    }

    const inchangee =
      fusionnee.siret === dejaLa.siret &&
      fusionnee.contactNom === dejaLa.contactNom &&
      fusionnee.email === dejaLa.email &&
      fusionnee.telephone === dejaLa.telephone &&
      fusionnee.zoneIntervention === dejaLa.zoneIntervention &&
      fusionnee.historiqueNotes === dejaLa.historiqueNotes &&
      corpsEtat.length === dejaLa.corpsEtatQualifies.length

    if (inchangee) {
      ignorees.push({
        ligne: lue.ligne,
        raisonSociale: lue.raisonSociale,
        motif: 'déjà au répertoire, rien à compléter',
      })
      continue
    }

    await modifierEntreprise(client, dejaLa.id, fusionnee)
    completees += 1
  }

  return { creees, completees, ignorees }
}
