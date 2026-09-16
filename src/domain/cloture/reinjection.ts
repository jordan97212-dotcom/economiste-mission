import * as PU from '../money/prix-unitaire'
import type { PrixUnitaire } from '../money/prix-unitaire'

/**
 * Réinjection des prix réels dans la base personnelle — SPEC_APP_ECONOMISTE.md §5.7.
 *
 * C'est ce qui referme la boucle du projet : à la clôture, les prix
 * réellement pratiqués par l'entreprise retenue viennent enrichir la base, et
 * chaque chantier terminé rend l'estimation suivante plus juste.
 *
 * Deux règles non négociables, toutes deux dans la spécification :
 *
 *   — le prix versé vient de l'OFFRE RETENUE, jamais de l'estimatif. Verser
 *     son propre chiffrage reviendrait à se citer soi-même comme référence ;
 *   — rien n'entre en base sans que l'économiste l'ait voulu. Ce module
 *     propose une sélection, il n'écrit rien.
 *
 * Fonction pure : aucune I/O.
 */

export interface PosteChiffre {
  readonly posteId: string
  readonly code: string | null
  readonly designation: string
  readonly unite: string | null
  /** Prix unitaire de l'estimatif, pour montrer l'écart. Null si non chiffré. */
  readonly prixEstimeHt: PrixUnitaire | null
}

export interface LigneRetenue {
  readonly posteId: string
  readonly prixUnitaireHt: PrixUnitaire
}

export interface PrixExistant {
  readonly code: string | null
  readonly designation: string
}

export type MotifEcarte = 'non_chiffre_par_entreprise' | 'sans_unite' | 'prix_nul'

export interface CandidatReinjection {
  readonly posteId: string
  readonly code: string | null
  readonly designation: string
  readonly unite: string
  /** Prix réellement pratiqué, issu de l'offre retenue. */
  readonly prixReelHt: PrixUnitaire
  readonly prixEstimeHt: PrixUnitaire | null
  /** Vrai si la base porte déjà une entrée de même code, ou de même désignation. */
  readonly dejaEnBase: boolean
}

export interface PosteEcarte {
  readonly posteId: string
  readonly designation: string
  readonly motif: MotifEcarte
}

export interface SelectionReinjection {
  readonly candidats: readonly CandidatReinjection[]
  /** Les postes qu'on ne peut pas verser, et pourquoi — jamais en silence. */
  readonly ecartes: readonly PosteEcarte[]
}

function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Rapproche les postes chiffrés des lignes de l'offre retenue, et rend les
 * prix versables. Un poste que l'entreprise n'a pas chiffré ne produit aucun
 * candidat : on ne verse pas un prix qu'elle n'a pas donné.
 */
export function preparerReinjection(
  postes: readonly PosteChiffre[],
  lignesRetenues: readonly LigneRetenue[],
  existants: readonly PrixExistant[],
): SelectionReinjection {
  const parPoste = new Map(lignesRetenues.map((l) => [l.posteId, l]))

  const codesConnus = new Set(
    existants.filter((e) => e.code !== null).map((e) => normaliser(e.code as string)),
  )
  const designationsConnues = new Set(existants.map((e) => normaliser(e.designation)))

  const candidats: CandidatReinjection[] = []
  const ecartes: PosteEcarte[] = []

  for (const poste of postes) {
    const ligne = parPoste.get(poste.posteId)

    if (!ligne) {
      ecartes.push({
        posteId: poste.posteId,
        designation: poste.designation,
        motif: 'non_chiffre_par_entreprise',
      })
      continue
    }

    if (!poste.unite) {
      // Un prix sans unité n'est comparable à rien : il polluerait la base.
      ecartes.push({ posteId: poste.posteId, designation: poste.designation, motif: 'sans_unite' })
      continue
    }

    if (PU.estZero(ligne.prixUnitaireHt)) {
      ecartes.push({ posteId: poste.posteId, designation: poste.designation, motif: 'prix_nul' })
      continue
    }

    const dejaEnBase =
      (poste.code !== null && codesConnus.has(normaliser(poste.code))) ||
      designationsConnues.has(normaliser(poste.designation))

    candidats.push({
      posteId: poste.posteId,
      code: poste.code,
      designation: poste.designation,
      unite: poste.unite,
      prixReelHt: ligne.prixUnitaireHt,
      prixEstimeHt: poste.prixEstimeHt,
      dejaEnBase,
    })
  }

  return { candidats, ecartes }
}

/**
 * Écart entre le prix réellement pratiqué et celui qui avait été estimé, en
 * pourcentage. Null quand l'estimatif est absent ou nul : mieux vaut pas de
 * chiffre qu'un chiffre faux.
 */
export function ecartPrixPourcent(candidat: CandidatReinjection): string | null {
  if (candidat.prixEstimeHt === null || PU.estZero(candidat.prixEstimeHt)) return null
  const estime = PU.versEuros(candidat.prixEstimeHt)
  const reel = PU.versEuros(candidat.prixReelHt)
  return reel.minus(estime).div(estime).mul(100).toDecimalPlaces(2).toFixed(2)
}
