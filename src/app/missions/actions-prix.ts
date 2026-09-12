'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../session'
import { creerSourcePrixPersonnelle } from '../../infrastructure/sources-prix/base-personnelle'
import { SEUIL_FIABILITE_REFERENCES } from '../../application/ports/source-prix'
import { chargerChiffrage } from '../../application/chiffrage/service'
import type { ChiffrageDTO } from '../../application/dto'

/** Une proposition de prix, mise en forme pour traverser vers le navigateur. */
export interface PropositionPrixDTO {
  readonly code: string | null
  readonly designation: string
  readonly unite: string
  /** Dix-millièmes d'euro, comme le stockage. */
  readonly prixUnitaireHt: string
  readonly dateReleve: string
  readonly contexteTypeOuvrage: string | null
  readonly contexteNature: string | null
  readonly zone: string | null
  readonly nbReferences: number
  readonly fiable: boolean
  readonly dispersion: {
    readonly minimum: string
    readonly mediane: string
    readonly maximum: string
    readonly ecartRelatif: string | null
  } | null
}

/**
 * Assistance au prix — SPEC_APP_ECONOMISTE.md §5.3.
 *
 * La proposition n'est jamais appliquée d'office : elle s'affiche avec sa date,
 * son contexte d'origine, le nombre de références derrière elle et la dispersion
 * des prix connus. L'économiste choisit, ou ignore.
 */
export async function actionRechercherPrix(
  texte: string,
  corpsEtatId: string | null,
): Promise<PropositionPrixDTO[]> {
  const { db, utilisateur } = await contexte()
  const source = creerSourcePrixPersonnelle(db, utilisateur.id)

  const propositions = await source.rechercher({
    texte,
    corpsEtatId,
    limite: 8,
  })

  return propositions.map((proposition) => ({
    code: proposition.code,
    designation: proposition.designation,
    unite: proposition.unite,
    prixUnitaireHt: (proposition.prixUnitaireHt as bigint).toString(),
    dateReleve: proposition.dateReleve.toISOString(),
    contexteTypeOuvrage: proposition.contexte?.typeOuvrage ?? null,
    contexteNature: proposition.contexte?.nature ?? null,
    zone: proposition.contexte?.zone ?? null,
    nbReferences: proposition.nbReferences,
    fiable: proposition.nbReferences >= SEUIL_FIABILITE_REFERENCES,
    dispersion: proposition.dispersion
      ? {
          minimum: (proposition.dispersion.minimum as bigint).toString(),
          mediane: (proposition.dispersion.mediane as bigint).toString(),
          maximum: (proposition.dispersion.maximum as bigint).toString(),
          ecartRelatif: proposition.dispersion.ecartRelatif?.toString() ?? null,
        }
      : null,
  }))
}

/**
 * Applique un prix venu de la base personnelle à une ligne de DPGF, en traçant
 * son origine et sa date — exigence de traçabilité du §2.3.
 */
export async function actionAppliquerPrix(
  missionId: string,
  posteId: string,
  prixUnitaireHt: string,
  dateReleve: string,
  unite: string | null,
): Promise<ChiffrageDTO> {
  const { db } = await contexte()

  const poste = await db.poste.findFirst({
    where: { id: posteId, lot: { missionId } },
    select: { id: true, unite: true },
  })
  if (!poste) throw new Error(`Poste hors de la mission : ${posteId}`)

  await db.poste.update({
    where: { id: posteId },
    data: {
      prixUnitaireHtBase: BigInt(prixUnitaireHt),
      sourcePrix: 'BASE_PERSONNELLE',
      dateSourcePrix: new Date(dateReleve),
      // L'unité de la base ne s'impose que si la ligne n'en a pas encore.
      ...(poste.unite === null && unite ? { unite: unite as never } : {}),
    },
  })

  const { recalculerMission } = await import('../../application/chiffrage/service')
  await recalculerMission(db, missionId)

  revalidatePath(`/missions/${missionId}/chiffrage`)
  revalidatePath(`/missions/${missionId}`)
  return chargerChiffrage(db, missionId)
}
