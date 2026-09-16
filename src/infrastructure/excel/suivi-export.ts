import ExcelJS from 'exceljs'
import type { SuiviMission } from '../../application/suivi/service'

/**
 * Export Excel du tableau de suivi financier — SPEC_APP_ECONOMISTE.md §5.6.
 *
 * Deux feuilles : la synthèse de l'opération, et le détail lot par lot. Les
 * montants partent en nombres, pas en texte : le destinataire doit pouvoir
 * les reprendre dans ses propres calculs sans les retaper.
 */

const COULEUR_ENTETE = 'FF13211D'
const COULEUR_ALERTE = 'FFF6EDDC'
const FORMAT_EURO = '#,##0.00\\ "€"'
const FORMAT_POURCENT = '0.00\\ "%"'

/** Les montants sont stockés en centimes ; Excel veut des euros. */
function euros(centimes: string | null): number | null {
  if (centimes === null) return null
  return Number(centimes) / 100
}

function enTete(feuille: ExcelJS.Worksheet, colonnes: string[]): void {
  const ligne = feuille.addRow(colonnes)
  ligne.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  for (let i = 1; i <= colonnes.length; i += 1) {
    ligne.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ENTETE } }
  }
}

export interface InfoSuivi {
  readonly reference: string
  readonly nomOperation: string
  readonly dateGeneration: Date
}

export async function genererSuiviExcel(info: InfoSuivi, suivi: SuiviMission): Promise<Buffer> {
  const classeur = new ExcelJS.Workbook()
  classeur.creator = 'Application de gestion de missions d’économiste'
  classeur.created = info.dateGeneration

  // --- Synthèse de l'opération ---
  const synthese = classeur.addWorksheet('Synthèse')
  synthese.columns = [{ width: 38 }, { width: 20 }]

  synthese.addRow([info.reference, '']).font = { bold: true, size: 13 }
  synthese.addRow([info.nomOperation, ''])
  synthese.addRow([`Suivi arrêté au ${info.dateGeneration.toLocaleDateString('fr-FR')}`, ''])
  synthese.addRow([])

  const lignesSynthese: [string, number | null, string][] = [
    ['Estimatif du chiffrage', euros(suivi.estimatifHt), FORMAT_EURO],
    ['Marché initial (offres retenues)', euros(suivi.marcheInitialHt), FORMAT_EURO],
    ['Avenants acceptés', euros(suivi.avenantsCumulesHt), FORMAT_EURO],
    ['Marché actuel', euros(suivi.marcheActuelHt), FORMAT_EURO],
    ['Travaux réalisés', euros(suivi.travauxRealisesHt), FORMAT_EURO],
    ['Reste à réaliser', euros(suivi.resteARealiserHt), FORMAT_EURO],
    ['Écart marché actuel / estimatif', euros(suivi.ecartVsEstimatifHt), FORMAT_EURO],
    [
      'Écart en pourcentage',
      suivi.ecartVsEstimatifPourcent !== null ? Number(suivi.ecartVsEstimatifPourcent) : null,
      FORMAT_POURCENT,
    ],
    [
      'Avancement',
      suivi.avancementPourcent !== null ? Number(suivi.avancementPourcent) : null,
      FORMAT_POURCENT,
    ],
    ['Retenue de garantie cumulée', euros(suivi.retenueGarantieCumuleeHt), FORMAT_EURO],
  ]

  for (const [libelle, valeur, format] of lignesSynthese) {
    const ligne = synthese.addRow([libelle, valeur])
    ligne.getCell(2).numFmt = format
    if (libelle === 'Marché actuel' || libelle === 'Travaux réalisés') ligne.font = { bold: true }
  }

  synthese.addRow([])
  const alerte = synthese.addRow([
    suivi.deriveDetectee
      ? `Dérive signalée : l'écart dépasse le seuil de ${suivi.seuilDerivePourcent} %`
      : `Aucune dérive : l'écart reste sous le seuil de ${suivi.seuilDerivePourcent} %`,
    '',
  ])
  if (suivi.deriveDetectee) {
    alerte.font = { bold: true, color: { argb: 'FF8A550B' } }
    alerte.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COULEUR_ALERTE } }
  }

  synthese.addRow([])
  synthese.addRow([
    `${suivi.nbLotsAttribues} lot(s) attribué(s) sur ${suivi.nbLots}. Les lots sans attribution n'ont pas de marché et ne portent aucune situation.`,
    '',
  ]).font = { italic: true, color: { argb: 'FF64736D' } }

  // --- Détail par lot ---
  const detail = classeur.addWorksheet('Lots')
  detail.columns = [
    { width: 8 },
    { width: 34 },
    { width: 26 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 13 },
    { width: 16 },
  ]

  enTete(detail, [
    'Lot',
    'Intitulé',
    'Entreprise retenue',
    'Estimatif HT',
    'Marché initial',
    'Avenants',
    'Marché actuel',
    'Réalisé',
    'Reste à réaliser',
    'Avancement',
    'Retenue cumulée',
  ])

  for (const lot of suivi.lots) {
    const ligne = detail.addRow([
      lot.numero,
      lot.intitule,
      lot.entrepriseNom ?? '—',
      euros(lot.estimatifHt),
      euros(lot.marcheInitialHt),
      euros(lot.avenantsAcceptesHt),
      euros(lot.marcheActuelHt),
      euros(lot.travauxRealisesHt),
      euros(lot.resteARealiserHt),
      lot.avancementPourcent !== null ? Number(lot.avancementPourcent) : null,
      euros(lot.retenueGarantieCumuleeHt),
    ])
    for (const colonne of [4, 5, 6, 7, 8, 9, 11]) ligne.getCell(colonne).numFmt = FORMAT_EURO
    ligne.getCell(10).numFmt = FORMAT_POURCENT
    if (!lot.attribue) ligne.font = { color: { argb: 'FF64736D' }, italic: true }
  }

  // Un avenant peut porter sur l'opération entière plutôt que sur un lot. Sans
  // cette ligne, la colonne « Avenants » du total ne s'additionnerait pas
  // visiblement, et le lecteur chercherait l'écart.
  const avenantsDesLots = suivi.lots.reduce((somme, lot) => somme + Number(lot.avenantsAcceptesHt), 0)
  const avenantsHorsLot = Number(suivi.avenantsCumulesHt) - avenantsDesLots
  if (avenantsHorsLot !== 0) {
    const ligne = detail.addRow(['', 'Avenants au niveau de l’opération', '', null, null, avenantsHorsLot / 100])
    ligne.getCell(6).numFmt = FORMAT_EURO
    ligne.font = { italic: true, color: { argb: 'FF64736D' } }
  }

  const total = detail.addRow([
    '',
    'TOTAL',
    '',
    euros(suivi.estimatifHt),
    euros(suivi.marcheInitialHt),
    euros(suivi.avenantsCumulesHt),
    euros(suivi.marcheActuelHt),
    euros(suivi.travauxRealisesHt),
    euros(suivi.resteARealiserHt),
    suivi.avancementPourcent !== null ? Number(suivi.avancementPourcent) : null,
    euros(suivi.retenueGarantieCumuleeHt),
  ])
  total.font = { bold: true }
  for (const colonne of [4, 5, 6, 7, 8, 9, 11]) {
    total.getCell(colonne).numFmt = FORMAT_EURO
    total.getCell(colonne).border = { top: { style: 'medium' } }
  }
  total.getCell(10).numFmt = FORMAT_POURCENT
  total.getCell(10).border = { top: { style: 'medium' } }

  detail.views = [{ state: 'frozen', ySplit: 1 }]

  return Buffer.from(await classeur.xlsx.writeBuffer())
}

export function nomFichierSuivi(info: InfoSuivi): string {
  const operation = info.nomOperation
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${info.reference}-${operation}-Suivi-chantier.xlsx`
}
