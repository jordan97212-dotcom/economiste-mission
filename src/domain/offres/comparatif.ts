import * as Money from '../money/money'
import type { Money as MoneyValue } from '../money/money'
import {
  detecterAnomalies,
  ecartVsEstimatif,
  moinsDisante as calculerMoinsDisante,
  type Anomalie,
  type Ecart,
  type SeuilsAnomalie,
} from './ecarts'

/**
 * Tableau comparatif des offres — SPEC_APP_ECONOMISTE.md §5.5.
 *
 * Entreprises en colonnes, ouvrages en lignes. Une offre est soit globale
 * (un seul montant par lot), soit détaillée (l'entreprise a rendu un DPGF
 * rempli, ligne à ligne) — les deux se comparent, mais seule la seconde
 * autorise une comparaison poste par poste.
 *
 * Fonction pure : aucune I/O. L'application charge les données, ce module ne
 * fait que les mettre en forme et y appliquer les mêmes règles de détection
 * qu'un contrôle d'offre unique.
 */

export interface PosteComparatif {
  readonly posteId: string
  readonly code: string | null
  readonly designation: string
  readonly unite: string | null
  readonly montantEstimeHt: MoneyValue
}

export interface LigneOffreAComparer {
  readonly posteId: string
  readonly montantHt: MoneyValue
}

export interface OffreAComparer {
  readonly offreId: string
  readonly entrepriseNom: string
  /** Montant global déclaré par l'entreprise, avant remise. */
  readonly montantHt: MoneyValue
  /** Remise globale, à soustraire du montant pour la comparaison — point 10.8. */
  readonly remiseGlobaleHt: MoneyValue
  readonly conforme: boolean
  /** Présentes seulement si l'entreprise a rendu un DPGF rempli. */
  readonly lignes: readonly LigneOffreAComparer[]
}

export interface CelluleComparatif {
  readonly offreId: string
  /** Null : cette offre n'a pas de ligne pour ce poste (offre globale, ou poste omis). */
  readonly montantHt: MoneyValue | null
}

export interface LigneComparatif {
  readonly poste: PosteComparatif
  readonly cellules: readonly CelluleComparatif[]
  /** Écarts de prix anormaux entre offres détaillées, pour ce seul poste. */
  readonly anomalies: readonly Anomalie<string>[]
}

export interface ColonneComparatif {
  readonly offreId: string
  readonly entrepriseNom: string
  readonly montantHt: MoneyValue
  readonly remiseGlobaleHt: MoneyValue
  /** Montant net de remise : celui qui sert à la comparaison. */
  readonly montantNetHt: MoneyValue
  readonly ecart: Ecart
  readonly conforme: boolean
  readonly detaillee: boolean
  /** La moins chère parmi les offres conformes — jamais parmi les non conformes. */
  readonly moinsDisante: boolean
}

export interface TableauComparatif {
  readonly montantEstimeHt: MoneyValue
  readonly colonnes: readonly ColonneComparatif[]
  readonly lignes: readonly LigneComparatif[]
  /** Écarts anormaux du montant global de chaque offre, tous statuts confondus. */
  readonly anomaliesGlobales: readonly Anomalie<string>[]
}

function montantNet(offre: OffreAComparer): MoneyValue {
  return Money.soustraire(offre.montantHt, offre.remiseGlobaleHt)
}

export function construireComparatif(
  postes: readonly PosteComparatif[],
  offres: readonly OffreAComparer[],
  seuils: SeuilsAnomalie = {},
): TableauComparatif {
  const montantEstimeHt = Money.somme(postes.map((p) => p.montantEstimeHt))

  const conformes = offres.filter((o) => o.conforme)
  const gagnante =
    conformes.length > 0
      ? calculerMoinsDisante(conformes.map((o) => ({ reference: o.offreId, montantHt: montantNet(o) })))
      : null

  const anomaliesGlobales = detecterAnomalies(
    offres.map((o) => ({ reference: o.offreId, montantHt: montantNet(o) })),
    montantEstimeHt,
    seuils,
  )

  const colonnes: ColonneComparatif[] = offres.map((offre) => ({
    offreId: offre.offreId,
    entrepriseNom: offre.entrepriseNom,
    montantHt: offre.montantHt,
    remiseGlobaleHt: offre.remiseGlobaleHt,
    montantNetHt: montantNet(offre),
    ecart: ecartVsEstimatif(montantNet(offre), montantEstimeHt),
    conforme: offre.conforme,
    detaillee: offre.lignes.length > 0,
    moinsDisante: gagnante !== null && gagnante.reference === offre.offreId,
  }))

  const lignes: LigneComparatif[] = postes.map((poste) => {
    const cellules: CelluleComparatif[] = offres.map((offre) => {
      const ligne = offre.lignes.find((l) => l.posteId === poste.posteId)
      return { offreId: offre.offreId, montantHt: ligne ? ligne.montantHt : null }
    })

    // Les anomalies de ligne ne se calculent qu'entre offres qui ont
    // effectivement chiffré ce poste : comparer une absence n'a pas de sens.
    const offresAvecCetPoste = offres
      .map((offre) => ({
        offre,
        ligne: offre.lignes.find((l) => l.posteId === poste.posteId),
      }))
      .filter((x): x is { offre: OffreAComparer; ligne: LigneOffreAComparer } => x.ligne !== undefined)

    const anomalies = detecterAnomalies(
      offresAvecCetPoste.map(({ offre, ligne }) => ({ reference: offre.offreId, montantHt: ligne.montantHt })),
      poste.montantEstimeHt,
      seuils,
    )

    return { poste, cellules, anomalies }
  })

  return { montantEstimeHt, colonnes, lignes, anomaliesGlobales }
}
