import type { PrismaClient } from '@prisma/client'
import { MissionIntrouvable, chargerChiffrage, recalculerMission } from '../chiffrage/service'
import { journaliser } from '../audit/service'
import { analyserDpgf, type MappageDpgf, type OptionsAnalyse, type AnomalieDpgf } from './analyse-dpgf'
import type { ChiffrageDTO } from '../dto'

export * from './analyse-dpgf'

/**
 * Écriture d'un DPGF importé — SPEC_APP_ECONOMISTE.md §5.3.
 * L'analyse elle-même vit dans `analyse-dpgf.ts`, sans entrée-sortie.
 */

export interface ResultatImportDpgf {
  readonly chiffrage: ChiffrageDTO
  readonly nbOuvrages: number
  readonly nbSousLots: number
  readonly anomalies: readonly AnomalieDpgf[]
}

/**
 * Écrit l'aperçu dans un lot. Tout passe ou rien ne passe : un import à moitié
 * fait sur un DPGF serait pire que pas d'import du tout.
 */
export async function importerDpgf(
  client: PrismaClient,
  missionId: string,
  lotId: string,
  grille: readonly (readonly string[])[],
  mappage: MappageDpgf,
  options: OptionsAnalyse & { readonly remplacer?: boolean } = {},
): Promise<ResultatImportDpgf> {
  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { id: true, precisionPu: true },
  })
  if (!mission) throw new MissionIntrouvable(missionId)

  const lot = await client.lot.findFirst({ where: { id: lotId, missionId }, select: { id: true } })
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)

  const apercu = analyserDpgf(grille, mappage, {
    ...options,
    precisionPu: options.precisionPu ?? mission.precisionPu,
  })

  const bloquantes = apercu.anomalies.filter((a) => a.severite === 'bloquante')
  if (bloquantes.length > 0) {
    throw new Error(
      `Import refusé : ${bloquantes.length} ligne(s) bloquante(s). Corrigez le fichier ou le mappage des colonnes.`,
    )
  }

  await client.$transaction(async (tx) => {
    if (options.remplacer) {
      await tx.poste.deleteMany({ where: { lotId } })
    }

    const dernier = await tx.poste.findFirst({
      where: { lotId, parentId: null },
      orderBy: { ordre: 'desc' },
      select: { ordre: true },
    })

    let ordreRacine = (dernier?.ordre ?? -1) + 1
    let parentCourant: string | null = null
    let ordreEnfant = 0

    for (const ligne of apercu.lignes) {
      if (ligne.type === 'SOUS_LOT') {
        const cree = await tx.poste.create({
          data: {
            lotId,
            parentId: null,
            type: 'SOUS_LOT',
            ordre: ordreRacine,
            code: ligne.code,
            designation: ligne.designation,
          },
          select: { id: true },
        })
        ordreRacine += 1
        parentCourant = cree.id
        ordreEnfant = 0
        continue
      }

      await tx.poste.create({
        data: {
          lotId,
          parentId: parentCourant,
          type: 'OUVRAGE',
          ordre: parentCourant === null ? ordreRacine : ordreEnfant,
          code: ligne.code,
          designation: ligne.designation,
          unite: ligne.unite as never,
          quantite: ligne.quantite,
          prixUnitaireHtBase: ligne.prixUnitaireHt === null ? null : BigInt(ligne.prixUnitaireHt),
          sourcePrix: 'SAISIE_MANUELLE',
        },
      })

      if (parentCourant === null) ordreRacine += 1
      else ordreEnfant += 1
    }
  })

  await recalculerMission(client, missionId)

  // Une entrée de synthèse : mille lignes identiques n'apprendraient rien et
  // rendraient le journal illisible le jour où il sert vraiment.
  await journaliser(client, {
    entite: 'Import',
    entiteId: lotId,
    action: 'CREATION',
    apres: {
      lotId,
      ouvragesImportes: apercu.nbOuvrages,
      sousLotsImportes: apercu.nbSousLots,
      contenuRemplace: options.remplacer === true,
    },
  })

  return {
    chiffrage: await chargerChiffrage(client, missionId),
    nbOuvrages: apercu.nbOuvrages,
    nbSousLots: apercu.nbSousLots,
    anomalies: apercu.anomalies,
  }
}
