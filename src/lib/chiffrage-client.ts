import * as Money from '../domain/money/money'
import * as PU from '../domain/money/prix-unitaire'
import { calculerOuvrage } from '../domain/chiffrage/calcul'
import { resoudreCoefficient, type OrigineCoefficient } from '../domain/chiffrage/coefficient'
import type { PosteDTO } from '../application/dto'

/**
 * Recalcul côté navigateur, avec exactement les mêmes fonctions de domaine que
 * le serveur. La grille affiche donc des totaux justes à la frappe, sans
 * aller-retour, et sans risque de diverger de ce qui sera persisté.
 */
export interface LigneCalculee {
  readonly prixUnitaireHtFinal: string | null
  readonly montantHt: string
  readonly origineCoefficient: OrigineCoefficient
  readonly coefficientEffectif: string
  readonly erreur: string | null
}

export interface ResultatLot {
  readonly parPoste: ReadonlyMap<string, LigneCalculee>
  readonly totalHt: string
}

export function recalculerLot(
  postes: readonly PosteDTO[],
  coefficients: { mission: string; lot: string | null },
  precisionPu: number,
): ResultatLot {
  const enfantsDe = new Map<string | null, PosteDTO[]>()
  for (const poste of postes) {
    const liste = enfantsDe.get(poste.parentId) ?? []
    liste.push(poste)
    enfantsDe.set(poste.parentId, liste)
  }
  for (const liste of enfantsDe.values()) liste.sort((a, b) => a.ordre - b.ordre)

  const parPoste = new Map<string, LigneCalculee>()

  function visiter(poste: PosteDTO): bigint {
    if (poste.type === 'OUVRAGE') {
      try {
        const calcul = calculerOuvrage({
          quantite: poste.quantite,
          prixUnitaireHtBase:
            poste.prixUnitaireHtBase === null ? null : PU.depuisStockage(BigInt(poste.prixUnitaireHtBase)),
          coefficient: {
            mission: coefficients.mission,
            lot: coefficients.lot,
            ligne: poste.coefficientApplique,
          },
          precisionPu,
        })
        parPoste.set(poste.id, {
          prixUnitaireHtFinal: (calcul.prixUnitaireHtFinal as bigint).toString(),
          montantHt: (calcul.montantHt as bigint).toString(),
          origineCoefficient: calcul.coefficient.origine,
          coefficientEffectif: calcul.coefficient.valeur.toString(),
          erreur: null,
        })
        return calcul.montantHt as bigint
      } catch (erreur) {
        parPoste.set(poste.id, {
          prixUnitaireHtFinal: null,
          montantHt: '0',
          origineCoefficient: 'mission',
          coefficientEffectif: coefficients.mission,
          erreur: erreur instanceof Error ? erreur.message : 'Valeur invalide',
        })
        return 0n
      }
    }

    let sousTotal = 0n
    for (const enfant of enfantsDe.get(poste.id) ?? []) sousTotal += visiter(enfant)
    parPoste.set(poste.id, {
      prixUnitaireHtFinal: null,
      montantHt: sousTotal.toString(),
      origineCoefficient: resoudreCoefficient({
        mission: coefficients.mission,
        lot: coefficients.lot,
      }).origine,
      coefficientEffectif: coefficients.lot ?? coefficients.mission,
      erreur: null,
    })
    return sousTotal
  }

  let total = 0n
  for (const racine of enfantsDe.get(null) ?? []) total += visiter(racine)

  return { parPoste, totalHt: total.toString() }
}

export function sommeCentimes(valeurs: readonly string[]): string {
  return Money.somme(valeurs.map((v) => Money.depuisCentimes(v))).toString()
}
