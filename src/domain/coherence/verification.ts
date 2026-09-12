import { estVide, unitesCitees } from '../texte/structure'

/**
 * Contrôle de cohérence avant export du DCE — SPEC_APP_ECONOMISTE.md §5.4.
 *
 * Fonction pure : elle reçoit l'état du chiffrage et rend une liste d'anomalies,
 * sans rien lire ni écrire. Elle tourne donc aussi bien à l'écran, à la frappe,
 * qu'au moment de générer les documents.
 *
 * Note sur un contrôle de la spécification. Le §5.4 demande de signaler « un
 * article CCTP sans ligne de DPGF associée ». Dans ce modèle, le texte
 * descriptif est porté par l'ouvrage lui-même : un article orphelin ne peut pas
 * exister, il disparaîtrait avec sa ligne. Le contrôle équivalent, et celui qui
 * a du sens ici, est l'ouvrage décrit au CCTP mais non chiffré : il apparaîtra
 * dans les pièces écrites sans apparaître dans le bordereau.
 */

export type SeveriteCoherence = 'bloquante' | 'avertissement'

export type CodeAnomalie =
  | 'ouvrage_sans_texte'
  | 'article_sans_ligne_chiffree'
  | 'designation_divergente'
  | 'unite_incoherente'
  | 'quantite_nulle'
  | 'prix_nul'
  | 'unite_absente'
  | 'lot_vide'
  | 'mission_sans_lot'

export interface AnomalieCoherence {
  readonly code: CodeAnomalie
  readonly severite: SeveriteCoherence
  readonly message: string
  readonly lotId: string | null
  readonly posteId: string | null
  /** Repère lisible, pour pointer la ligne dans l'interface. */
  readonly repere: string
}

export interface PosteVerif {
  readonly id: string
  readonly type: 'SOUS_LOT' | 'OUVRAGE'
  readonly code: string | null
  readonly designation: string
  readonly unite: string | null
  readonly quantite: string | null
  readonly prixUnitaireHtFinal: string | null
  readonly texteCctp: string | null
  readonly designationSource: string | null
}

export interface LotVerif {
  readonly id: string
  readonly numero: string
  readonly intitule: string
  readonly postes: readonly PosteVerif[]
}

function repereDe(lot: LotVerif, poste: PosteVerif): string {
  const code = poste.code ? `${poste.code} · ` : ''
  return `Lot ${lot.numero} — ${code}${poste.designation || '(sans désignation)'}`
}

function estNul(valeur: string | null): boolean {
  if (valeur === null || valeur.trim() === '') return false
  return Number(valeur) === 0
}

export function verifierCoherence(lots: readonly LotVerif[]): AnomalieCoherence[] {
  const anomalies: AnomalieCoherence[] = []

  if (lots.length === 0) {
    anomalies.push({
      code: 'mission_sans_lot',
      severite: 'bloquante',
      message: 'La mission ne contient aucun lot : il n’y a rien à produire.',
      lotId: null,
      posteId: null,
      repere: 'Mission',
    })
    return anomalies
  }

  for (const lot of lots) {
    const ouvrages = lot.postes.filter((poste) => poste.type === 'OUVRAGE')

    if (lot.postes.length === 0) {
      anomalies.push({
        code: 'lot_vide',
        severite: 'bloquante',
        message: `Le lot ${lot.numero} est déclaré mais ne contient aucun poste.`,
        lotId: lot.id,
        posteId: null,
        repere: `Lot ${lot.numero} — ${lot.intitule}`,
      })
      continue
    }

    for (const poste of lot.postes) {
      const repere = repereDe(lot, poste)
      const aTexte = !estVide(poste.texteCctp)

      if (poste.type === 'OUVRAGE' && !aTexte) {
        anomalies.push({
          code: 'ouvrage_sans_texte',
          severite: 'bloquante',
          message: 'Ouvrage présent au DPGF sans texte de CCTP.',
          lotId: lot.id,
          posteId: poste.id,
          repere,
        })
      }

      // Décrit au CCTP mais absent du bordereau chiffré : l'entreprise lirait
      // une prestation qu'elle n'a pas à chiffrer.
      if (poste.type === 'OUVRAGE' && aTexte && poste.quantite === null && poste.prixUnitaireHtFinal === null) {
        anomalies.push({
          code: 'article_sans_ligne_chiffree',
          severite: 'avertissement',
          message: 'Article décrit au CCTP mais ni quantité ni prix au DPGF.',
          lotId: lot.id,
          posteId: poste.id,
          repere,
        })
      }

      if (aTexte && poste.designationSource !== null && poste.designationSource !== poste.designation) {
        anomalies.push({
          code: 'designation_divergente',
          severite: 'avertissement',
          message: `La désignation a changé depuis l’écriture du texte : « ${poste.designationSource} » puis « ${poste.designation} ».`,
          lotId: lot.id,
          posteId: poste.id,
          repere,
        })
      }

      if (aTexte && poste.unite !== null) {
        const citees = unitesCitees(poste.texteCctp ?? '')
        if (citees.length > 0 && !citees.includes(poste.unite)) {
          anomalies.push({
            code: 'unite_incoherente',
            severite: 'avertissement',
            message: `Le texte cite ${citees.join(' et ')} alors que le DPGF compte en ${poste.unite}.`,
            lotId: lot.id,
            posteId: poste.id,
            repere,
          })
        }
      }

      if (poste.type === 'OUVRAGE') {
        if (poste.unite === null) {
          anomalies.push({
            code: 'unite_absente',
            severite: 'avertissement',
            message: 'Ouvrage sans unité.',
            lotId: lot.id,
            posteId: poste.id,
            repere,
          })
        }
        if (estNul(poste.quantite)) {
          anomalies.push({
            code: 'quantite_nulle',
            severite: 'avertissement',
            message: 'Quantité nulle.',
            lotId: lot.id,
            posteId: poste.id,
            repere,
          })
        }
        if (estNul(poste.prixUnitaireHtFinal)) {
          anomalies.push({
            code: 'prix_nul',
            severite: 'avertissement',
            message: 'Prix unitaire à zéro.',
            lotId: lot.id,
            posteId: poste.id,
            repere,
          })
        }
      }
    }

    if (ouvrages.length === 0) {
      anomalies.push({
        code: 'lot_vide',
        severite: 'bloquante',
        message: `Le lot ${lot.numero} ne contient que des chapitres, aucun ouvrage chiffrable.`,
        lotId: lot.id,
        posteId: null,
        repere: `Lot ${lot.numero} — ${lot.intitule}`,
      })
    }
  }

  return anomalies
}

export interface SyntheseCoherence {
  readonly anomalies: readonly AnomalieCoherence[]
  readonly nbBloquantes: number
  readonly nbAvertissements: number
  readonly exportPossible: boolean
}

export function synthetiser(anomalies: readonly AnomalieCoherence[]): SyntheseCoherence {
  const nbBloquantes = anomalies.filter((a) => a.severite === 'bloquante').length
  return {
    anomalies,
    nbBloquantes,
    nbAvertissements: anomalies.length - nbBloquantes,
    exportPossible: nbBloquantes === 0,
  }
}
