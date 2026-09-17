import ExcelJS from 'exceljs'
import type { TableauComparatif } from '../../domain/offres/comparatif'

/**
 * Export Excel du tableau comparatif des offres — SPEC_APP_ECONOMISTE.md §5.5.
 *
 * Le comparatif est ce qu'on envoie au maître d'ouvrage. Il partait jusqu'ici
 * en Word, à l'intérieur du rapport d'analyse : lisible, mais impossible à
 * reprendre. Ici les montants sont des nombres, pas du texte, et le
 * destinataire peut trier, filtrer et recalculer sans rien retaper.
 *
 * Deux feuilles. La **synthèse** donne une ligne par offre, avec sa nature et
 * son écart. Le **détail** croise les ouvrages et les entreprises, une colonne
 * par offre, pour voir d'où vient un écart.
 *
 * Ce qui n'y figure pas : ni prix de base, ni coefficient d'ajustement. Ce sont
 * des données internes à l'économiste, et le comparatif sort de chez lui —
 * règle 8.
 */

const COULEUR_ENTETE = 'FF13211D'
const COULEUR_MIEUX_DISANT = 'FFE2EFE9'
const COULEUR_HORS_CLASSEMENT = 'FFF6EDDC'
const FORMAT_EURO = '#,##0.00\\ "€"'
const FORMAT_POURCENT = '0.00\\ "%"'

const LIBELLES_TYPE: Record<string, string> = {
  BASE: 'Base',
  VARIANTE: 'Variante',
  OPTION: 'Option',
}

/** Les montants sont stockés en centimes ; Excel veut des euros. */
function euros(centimes: bigint | string | null): number | null {
  if (centimes === null) return null
  return Number(centimes) / 100
}

function enTete(feuille: ExcelJS.Worksheet, colonnes: string[]): ExcelJS.Row {
  const ligne = feuille.addRow(colonnes)
  ligne.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  for (let i = 1; i <= colonnes.length; i += 1) {
    ligne.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ENTETE } }
  }
  return ligne
}

export interface InfoComparatif {
  readonly reference: string
  readonly nomOperation: string
  readonly lotNumero: string
  readonly lotIntitule: string
  readonly dateGeneration: Date
}

export async function genererComparatifExcel(
  info: InfoComparatif,
  tableau: TableauComparatif,
): Promise<Buffer> {
  const classeur = new ExcelJS.Workbook()
  classeur.creator = 'Application de gestion de missions d’économiste'
  classeur.created = info.dateGeneration

  const anomaliesParOffre = new Map<string, string[]>()
  for (const anomalie of tableau.anomaliesGlobales) {
    const liste = anomaliesParOffre.get(anomalie.reference) ?? []
    liste.push(anomalie.message)
    anomaliesParOffre.set(anomalie.reference, liste)
  }

  /* --- Synthèse : une ligne par offre --- */
  const synthese = classeur.addWorksheet('Synthèse')
  synthese.columns = [
    { width: 32 }, { width: 12 }, { width: 24 }, { width: 16 },
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 12 },
    { width: 12 }, { width: 16 }, { width: 46 },
  ]

  synthese.addRow([`${info.reference} · ${info.nomOperation}`]).font = { bold: true, size: 13 }
  synthese.addRow([`Lot ${info.lotNumero} — ${info.lotIntitule}`]).font = { bold: true }
  synthese.addRow([`Estimatif du lot`, euros(tableau.montantEstimeHt as unknown as bigint)])
  synthese.getRow(3).getCell(2).numFmt = FORMAT_EURO
  synthese.addRow([])

  enTete(synthese, [
    'Entreprise', 'Nature', 'Intitulé', 'Montant HT', 'Remise HT',
    'Montant net HT', 'Écart estimatif', 'Écart %', 'Conforme', 'Détail', 'Observations',
  ])

  for (const colonne of tableau.colonnes) {
    const ligne = synthese.addRow([
      colonne.entrepriseNom,
      LIBELLES_TYPE[colonne.type] ?? colonne.type,
      colonne.libelle ?? '',
      euros(colonne.montantHt as unknown as bigint),
      euros(colonne.remiseGlobaleHt as unknown as bigint),
      euros(colonne.montantNetHt as unknown as bigint),
      // Une option chiffre un complément : l'écart vis-à-vis de l'estimatif
      // entier n'aurait pas de sens, et un nombre faux vaut moins que rien.
      colonne.ecartComparable ? euros(colonne.ecart.montantHt as unknown as bigint) : null,
      colonne.ecartComparable && colonne.ecart.pourcent !== null
        ? Number(colonne.ecart.pourcent)
        : null,
      colonne.conforme ? 'Oui' : 'Non',
      colonne.detaillee ? 'Ligne à ligne' : 'Montant global',
      [
        colonne.moinsDisante ? 'Moins-disante' : '',
        !colonne.classee && colonne.conforme ? 'Hors classement' : '',
        ...(anomaliesParOffre.get(colonne.offreId) ?? []),
      ]
        .filter(Boolean)
        .join(' · '),
    ])

    for (const index of [4, 5, 6, 7]) ligne.getCell(index).numFmt = FORMAT_EURO
    ligne.getCell(8).numFmt = FORMAT_POURCENT

    if (colonne.moinsDisante) {
      ligne.font = { bold: true }
      for (let i = 1; i <= 11; i += 1) {
        ligne.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_MIEUX_DISANT } }
      }
    } else if (!colonne.classee) {
      // Variantes, options et offres écartées : présentes, mais visiblement
      // hors du classement.
      for (let i = 1; i <= 11; i += 1) {
        ligne.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_HORS_CLASSEMENT } }
      }
    }
  }

  synthese.addRow([])
  const note = synthese.addRow([
    'Le classement ne retient que les offres de base conformes : une variante propose autre chose, une option complète.',
  ])
  note.font = { italic: true, size: 10 }

  /* --- Détail : ouvrages en lignes, offres en colonnes --- */
  const detail = classeur.addWorksheet('Détail par ouvrage')
  detail.columns = [
    { width: 14 },
    { width: 52 },
    { width: 10 },
    { width: 16 },
    ...tableau.colonnes.map(() => ({ width: 18 })),
  ]

  detail.addRow([`Lot ${info.lotNumero} — ${info.lotIntitule}`]).font = { bold: true, size: 13 }
  detail.addRow([])

  // Deux lignes d'en-tête : l'entreprise, puis la nature de son offre.
  enTete(detail, [
    'Code', 'Désignation', 'Unité', 'Estimatif HT',
    ...tableau.colonnes.map((c) => c.entrepriseNom),
  ])
  const ligneNature = detail.addRow([
    '', '', '', '',
    ...tableau.colonnes.map((c) =>
      [LIBELLES_TYPE[c.type] ?? c.type, c.libelle].filter(Boolean).join(' — '),
    ),
  ])
  ligneNature.font = { italic: true, size: 10 }

  for (const ligne of tableau.lignes) {
    const rangee = detail.addRow([
      ligne.poste.code ?? '',
      ligne.poste.designation,
      ligne.poste.unite ?? '',
      euros(ligne.poste.montantEstimeHt as unknown as bigint),
      ...tableau.colonnes.map((colonne) => {
        const cellule = ligne.cellules.find((c) => c.offreId === colonne.offreId)
        // Null plutôt que zéro : l'entreprise n'a pas chiffré ce poste, elle ne
        // l'a pas chiffré à zéro — règle 7.
        return cellule?.montantHt === null || cellule === undefined
          ? null
          : euros(cellule.montantHt as unknown as bigint)
      }),
    ])
    for (let i = 4; i <= 4 + tableau.colonnes.length; i += 1) {
      rangee.getCell(i).numFmt = FORMAT_EURO
    }
  }

  const total = detail.addRow([
    '', 'TOTAL', '',
    euros(tableau.montantEstimeHt as unknown as bigint),
    ...tableau.colonnes.map((c) => euros(c.montantNetHt as unknown as bigint)),
  ])
  total.font = { bold: true }
  for (let i = 4; i <= 4 + tableau.colonnes.length; i += 1) {
    total.getCell(i).numFmt = FORMAT_EURO
  }

  const rappel = detail.addRow([
    '',
    'Les totaux sont nets de remise globale. Une cellule vide signifie que l’entreprise n’a pas chiffré cet ouvrage.',
  ])
  rappel.font = { italic: true, size: 10 }

  const donnees = await classeur.xlsx.writeBuffer()
  return Buffer.from(donnees)
}

export function nomFichierComparatif(info: InfoComparatif): string {
  const operation = info.nomOperation
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return `${info.reference}-${operation}-Lot-${info.lotNumero}-Comparatif.xlsx`
}
