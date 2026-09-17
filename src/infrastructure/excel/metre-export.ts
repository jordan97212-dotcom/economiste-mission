import ExcelJS from 'exceljs'
import type { LigneMetreDTO, MetreMissionDTO } from '../../application/dto'

/**
 * Export Excel du métré — SPEC_APP_ECONOMISTE.md §5.2.
 *
 * Le métré est une pièce justificative : quand le maître d'ouvrage demande
 * d'où sortent 142,50 m², la réponse est ce classeur. On y retrouve chaque
 * mesure telle qu'elle a été saisie, et le total de chaque ouvrage.
 *
 * Les montants n'y figurent pas. Le métré justifie des quantités, pas des prix :
 * c'est le DPGF qui porte les seconds.
 */

const COULEUR_ENTETE = 'FF13211D'
const COULEUR_OUVRAGE = 'FFE2EFE9'
const COULEUR_DEDUCTION = 'FFF6EDDC'
const FORMAT_MESURE = '#,##0.000'

const LIBELLES_UNITE: Record<string, string> = {
  M2: 'm²',
  M3: 'm³',
  ML: 'ml',
  U: 'U',
  ENS: 'ens.',
  FORFAIT: 'forfait',
  KG: 'kg',
  T: 't',
  H: 'h',
  J: 'j',
}

function nombre(valeur: string | null): number | null {
  return valeur === null ? null : Number(valeur)
}

function enTete(feuille: ExcelJS.Worksheet, colonnes: string[]): void {
  const ligne = feuille.addRow(colonnes)
  ligne.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  for (let i = 1; i <= colonnes.length; i += 1) {
    ligne.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ENTETE } }
  }
}

export interface InfoMetre {
  readonly dateGeneration: Date
}

export async function genererMetreExcel(
  metre: MetreMissionDTO,
  info: InfoMetre,
): Promise<Buffer> {
  const classeur = new ExcelJS.Workbook()
  classeur.creator = 'Application de gestion de missions d’économiste'
  classeur.created = info.dateGeneration

  const nomsReperes = new Map(metre.reperes.map((repere) => [repere.id, repere.nom]))

  /** Ce qui a été mesuré, en toutes lettres : c'est la colonne qu'on relit. */
  function designerLigne(ligne: LigneMetreDTO): string {
    if (ligne.type !== 'RAPPEL') return ligne.libelle
    const nom = ligne.rappelRepereId === null ? null : nomsReperes.get(ligne.rappelRepereId)
    return nom === null || nom === undefined ? 'Rappel (repère absent)' : `Rappel · ${nom}`
  }

  const feuille = classeur.addWorksheet('Métré')
  feuille.columns = [
    { width: 34 }, { width: 34 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 8 }, { width: 14 },
  ]

  feuille.addRow([`${metre.reference} · ${metre.nomOperation}`]).font = { bold: true, size: 13 }
  feuille.addRow(['Métré détaillé — justification des quantités']).font = { italic: true }
  feuille.addRow([])

  for (const lot of metre.lots) {
    feuille.addRow([`Lot ${lot.numero} — ${lot.intitule}`]).font = { bold: true, size: 12 }

    for (const ouvrage of lot.ouvrages) {
      const titre = feuille.addRow([
        [ouvrage.code, ouvrage.designation].filter(Boolean).join(' · '),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ])
      titre.font = { bold: true }
      for (let i = 1; i <= 8; i += 1) {
        titre.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_OUVRAGE } }
      }

      enTete(feuille, [
        'Localisation / ouvrage mesuré',
        'Repère rappelé',
        'Nb',
        'Long.',
        'Larg.',
        'Haut.',
        'Déd.',
        'Résultat',
      ])

      for (const ligne of ouvrage.lignes) {
        const rangee = feuille.addRow([
          ligne.type === 'RAPPEL' ? '' : ligne.libelle,
          ligne.type === 'RAPPEL' ? designerLigne(ligne) : '',
          nombre(ligne.nombre),
          nombre(ligne.longueur),
          nombre(ligne.largeur),
          nombre(ligne.hauteur),
          ligne.deduction ? '−' : '',
          // Une ligne non calculable reste vide : on ne comble pas un trou par
          // un zéro, il se confondrait avec une mesure nulle.
          nombre(ligne.valeur),
        ])
        for (let i = 3; i <= 8; i += 1) rangee.getCell(i).numFmt = FORMAT_MESURE
        if (ligne.deduction) {
          for (let i = 1; i <= 8; i += 1) {
            rangee.getCell(i).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: COULEUR_DEDUCTION },
            }
          }
        }
      }

      const total = feuille.addRow([
        'Quantité retenue',
        ouvrage.unite ? LIBELLES_UNITE[ouvrage.unite] ?? ouvrage.unite : '',
        null,
        null,
        null,
        null,
        '',
        nombre(ouvrage.quantite),
      ])
      total.font = { bold: true }
      total.getCell(8).numFmt = FORMAT_MESURE

      for (const anomalie of ouvrage.anomalies) {
        feuille.addRow(['', anomalie.message]).font = { italic: true, size: 10 }
      }

      feuille.addRow([])
    }
  }

  if (metre.lots.length === 0) {
    feuille.addRow(['Aucun ouvrage n’est métré dans cette mission.']).font = { italic: true }
  }

  /* --- Repères : les sous-totaux nommés et leur propre détail --- */
  const feuilleReperes = classeur.addWorksheet('Repères')
  feuilleReperes.columns = [
    { width: 34 }, { width: 34 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 8 }, { width: 14 },
  ]
  feuilleReperes.addRow(['Repères de métré']).font = { bold: true, size: 13 }
  feuilleReperes.addRow([
    'Sous-totaux mesurés une fois et rappelés dans plusieurs ouvrages.',
  ]).font = { italic: true, size: 10 }
  feuilleReperes.addRow([])

  for (const repere of metre.reperes) {
    const titre = feuilleReperes.addRow([
      repere.nom,
      repere.unite ? LIBELLES_UNITE[repere.unite] ?? repere.unite : '',
      null,
      null,
      null,
      null,
      '',
      nombre(repere.valeur),
    ])
    titre.font = { bold: true }
    titre.getCell(8).numFmt = FORMAT_MESURE
    for (let i = 1; i <= 8; i += 1) {
      titre.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_OUVRAGE } }
    }

    for (const ligne of repere.lignes) {
      const rangee = feuilleReperes.addRow([
        ligne.type === 'RAPPEL' ? '' : ligne.libelle,
        ligne.type === 'RAPPEL' ? designerLigne(ligne) : '',
        nombre(ligne.nombre),
        nombre(ligne.longueur),
        nombre(ligne.largeur),
        nombre(ligne.hauteur),
        ligne.deduction ? '−' : '',
        nombre(ligne.valeur),
      ])
      for (let i = 3; i <= 8; i += 1) rangee.getCell(i).numFmt = FORMAT_MESURE
    }

    feuilleReperes.addRow([`Rappelé par ${repere.emplois} feuille(s) de métré.`]).font = {
      italic: true,
      size: 10,
    }
    feuilleReperes.addRow([])
  }

  if (metre.reperes.length === 0) {
    feuilleReperes.addRow(['Aucun repère dans cette mission.']).font = { italic: true }
  }

  return Buffer.from(await classeur.xlsx.writeBuffer())
}

export function nomFichierMetre(metre: MetreMissionDTO): string {
  const operation = metre.nomOperation
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return `${metre.reference}-${operation}-Metre.xlsx`
}
