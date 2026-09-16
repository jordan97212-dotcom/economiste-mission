import type { PrismaClient } from '@prisma/client'
import { dec, arrondiCommercial } from '../../domain/money/decimal'
import { lireNombre, normaliserUnite } from '../saisie'
import * as PU from '../../domain/money/prix-unitaire'
import { MissionIntrouvable, enregistrerModifications, chargerChiffrage } from './service'
import { ajouterPoste } from './structure'

export { lireNombre, normaliserUnite } from '../saisie'
import type { ChiffrageDTO, ModificationPoste } from '../dto'

import { mappagePositionnel, type ColonneCollable } from './mappage-collage'

export {
  COLONNES_COLLABLES,
  LIBELLES_COLONNE,
  devinerMappageCollage,
  mappagePositionnel,
  type ColonneCollable,
  type MappageCollage,
  type PropositionColonne,
} from './mappage-collage'

export interface EntreeCollage {
  readonly lotId: string
  readonly posteDepartId: string
  readonly colonneDepart: ColonneCollable
  readonly lignes: readonly (readonly string[])[]
  /**
   * À quoi correspond chaque colonne collée, confirmé par l'économiste. Quand
   * elle manque, on retombe sur l'ordre de la grille depuis `colonneDepart` —
   * l'ancien comportement, conservé pour ne pas casser les appels existants.
   */
  readonly mappage?: readonly (ColonneCollable | null)[]
}

/** Limite de sécurité : un collage reste un geste d'édition, pas un import. */
export const LIGNES_MAX_COLLAGE = 2000

/**
 * Colle un bloc de cellules dans la grille, à partir d'une ligne et d'une
 * colonne données. Les lignes manquantes sont créées à la suite, au même niveau
 * d'arborescence que la ligne de départ.
 */
export async function collerBloc(
  client: PrismaClient,
  missionId: string,
  entree: EntreeCollage,
): Promise<ChiffrageDTO> {
  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { id: true, precisionPu: true },
  })
  if (!mission) throw new MissionIntrouvable(missionId)

  if (entree.lignes.length > LIGNES_MAX_COLLAGE) {
    throw new Error(
      `Collage trop volumineux : ${entree.lignes.length} lignes pour un maximum de ${LIGNES_MAX_COLLAGE}. Passez par l'import de DPGF.`,
    )
  }

  const lot = await client.lot.findFirst({
    where: { id: entree.lotId, missionId },
    select: { id: true },
  })
  if (!lot) throw new Error(`Lot hors de la mission : ${entree.lotId}`)

  const depart = await client.poste.findFirst({
    where: { id: entree.posteDepartId, lotId: entree.lotId },
    select: { id: true, parentId: true },
  })
  if (!depart) throw new Error(`Ligne de départ introuvable : ${entree.posteDepartId}`)

  const ordreAffichage = async (): Promise<string[]> => {
    const postes = await client.poste.findMany({
      where: { lotId: entree.lotId },
      orderBy: { ordre: 'asc' },
      select: { id: true, parentId: true, ordre: true },
    })
    const enfantsDe = new Map<string | null, typeof postes>()
    for (const poste of postes) {
      const liste = enfantsDe.get(poste.parentId) ?? []
      liste.push(poste)
      enfantsDe.set(poste.parentId, liste)
    }
    const plat: string[] = []
    const descendre = (parentId: string | null): void => {
      for (const poste of enfantsDe.get(parentId) ?? []) {
        plat.push(poste.id)
        descendre(poste.id)
      }
    }
    descendre(null)
    return plat
  }

  let ordre = await ordreAffichage()
  const indexDepart = ordre.indexOf(entree.posteDepartId)
  if (indexDepart === -1) throw new Error(`Ligne de départ introuvable : ${entree.posteDepartId}`)

  const disponibles = ordre.length - indexDepart
  const manquantes = entree.lignes.length - disponibles

  for (let i = 0; i < manquantes; i += 1) {
    await ajouterPoste(client, missionId, {
      lotId: entree.lotId,
      type: 'OUVRAGE',
      parentId: depart.parentId,
    })
  }

  if (manquantes > 0) ordre = await ordreAffichage()

  const largeur = entree.lignes.reduce((max, ligne) => Math.max(max, ligne.length), 0)
  const mappage =
    entree.mappage ?? mappagePositionnel(entree.colonneDepart, largeur).map((c) => c.colonne)
  const modifications: ModificationPoste[] = []

  for (const [indexLigne, ligne] of entree.lignes.entries()) {
    const posteId = ordre[indexDepart + indexLigne]
    if (!posteId) break

    const modification: { id: string } & Record<string, unknown> = { id: posteId }

    for (const [indexCellule, valeur] of ligne.entries()) {
      // Une colonne sans correspondance n'est pas collée : on passe à la
      // suivante plutôt que d'interrompre la ligne, car l'économiste peut avoir
      // écarté une colonne du milieu.
      const colonne = mappage[indexCellule]
      if (!colonne) continue

      switch (colonne) {
        case 'code':
          modification.code = valeur.trim() || null
          break
        case 'designation':
          modification.designation = valeur.trim()
          break
        case 'unite':
          modification.unite = normaliserUnite(valeur)
          break
        case 'quantite': {
          const nombre = lireNombre(valeur)
          modification.quantite = nombre === null ? null : arrondiCommercial(dec(nombre), 3).toString()
          break
        }
        case 'prixUnitaireHtBase': {
          const nombre = lireNombre(valeur)
          modification.prixUnitaireHtBase =
            nombre === null ? null : PU.depuisEuros(nombre, mission.precisionPu).toString()
          break
        }
        case 'coefficientApplique': {
          const nombre = lireNombre(valeur)
          if (nombre === null) {
            modification.coefficientApplique = null
          } else {
            const valeurDecimale = dec(nombre)
            modification.coefficientApplique =
              valeurDecimale.lessThanOrEqualTo(0) || valeurDecimale.greaterThan(10)
                ? null
                : arrondiCommercial(valeurDecimale, 4).toString()
          }
          break
        }
      }
    }

    modifications.push(modification as ModificationPoste)
  }

  if (modifications.length === 0) return chargerChiffrage(client, missionId)
  return enregistrerModifications(client, missionId, modifications)
}
