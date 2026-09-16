import {
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
} from 'docx'
import * as Money from '../../domain/money/money'
import { rendreTexte } from './pieces-ecrites'
import type { TableauComparatif } from '../../domain/offres/comparatif'

/**
 * Rapport d'analyse des offres — SPEC_APP_ECONOMISTE.md §5.5.
 *
 * Un brouillon, pas un document engageant : le tableau chiffré est reproduit
 * tel que calculé, mais la synthèse qui l'accompagne reste un texte modifiable
 * par l'économiste avant tout envoi. Rien ici ne désigne l'attributaire — cette
 * décision reste humaine.
 */

const POLICE = 'Calibri'
const COULEUR_ENCRE = '13211D'
const COULEUR_ACCENT = '0B5546'
const COULEUR_ALERTE = '8A550B'

function celluleEntete(texte: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: texte, bold: true, color: 'FFFFFF' })] })],
    shading: { fill: COULEUR_ENCRE },
    width: { size: 20, type: WidthType.PERCENTAGE },
  })
}

function celluleTexte(texte: string, options: { gras?: boolean; alignementDroite?: boolean } = {}): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: options.alignementDroite ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: texte, bold: options.gras ?? false })],
      }),
    ],
  })
}

function tableauOffres(tableau: TableauComparatif): Table {
  const enTete = new TableRow({
    children: [
      celluleEntete('Poste'),
      celluleEntete('Estimatif HT'),
      ...tableau.colonnes.map((c) => celluleEntete(`${c.entrepriseNom}${c.moinsDisante ? ' ★' : ''}`)),
    ],
  })

  const lignes = tableau.lignes.map(
    (ligne) =>
      new TableRow({
        children: [
          celluleTexte(`${ligne.poste.code ?? ''} ${ligne.poste.designation}`.trim()),
          celluleTexte(Money.formater(ligne.poste.montantEstimeHt), { alignementDroite: true }),
          ...ligne.cellules.map((cellule) =>
            celluleTexte(cellule.montantHt !== null ? Money.formater(cellule.montantHt) : '—', {
              alignementDroite: true,
            }),
          ),
        ],
      }),
  )

  const total = new TableRow({
    children: [
      celluleTexte('Total HT', { gras: true }),
      celluleTexte(Money.formater(tableau.montantEstimeHt), { gras: true, alignementDroite: true }),
      ...tableau.colonnes.map((c) =>
        celluleTexte(Money.formater(c.montantNetHt), { gras: true, alignementDroite: true }),
      ),
    ],
  })

  const ecarts = new TableRow({
    children: [
      celluleTexte('Écart vs estimatif'),
      celluleTexte(''),
      ...tableau.colonnes.map((c) =>
        celluleTexte(c.ecart.pourcent !== null ? `${c.ecart.pourcent.toFixed(2)} %` : '—', {
          alignementDroite: true,
        }),
      ),
    ],
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [enTete, ...lignes, total, ecarts],
  })
}

function paragrapheAnomalies(tableau: TableauComparatif, nomParOffre: Map<string, string>): Paragraph[] {
  const paragraphes: Paragraph[] = [
    new Paragraph({ text: 'Écarts à vérifier', heading: HeadingLevel.HEADING_2 }),
  ]

  const toutes = [
    ...tableau.anomaliesGlobales.map((a) => ({ ...a, repere: 'Montant global' })),
    ...tableau.lignes.flatMap((ligne) =>
      ligne.anomalies.map((a) => ({ ...a, repere: `${ligne.poste.code ?? ''} ${ligne.poste.designation}`.trim() })),
    ),
  ]

  if (toutes.length === 0) {
    paragraphes.push(new Paragraph({ text: 'Aucun écart signalé automatiquement.' }))
    return paragraphes
  }

  for (const anomalie of toutes) {
    const nom = nomParOffre.get(String(anomalie.reference)) ?? String(anomalie.reference)
    paragraphes.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [
          new TextRun({ text: `${nom} — ${anomalie.repere} : `, bold: true, color: COULEUR_ALERTE }),
          new TextRun({ text: anomalie.message }),
        ],
      }),
    )
  }
  return paragraphes
}

function piedDePage(reference: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `${reference} — Analyse des offres — Brouillon — page `, size: 18, color: '64736D' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '64736D' }),
          new TextRun({ text: ' / ', size: 18, color: '64736D' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '64736D' }),
        ],
      }),
    ],
  })
}

export interface InfoRapportOffres {
  readonly missionReference: string
  readonly nomOperation: string
  readonly lotNumero: string
  readonly lotIntitule: string
  readonly dateGeneration: Date
}

/** Assemble le rapport : tableau chiffré, écarts signalés, puis le brouillon de synthèse. */
export async function genererRapportOffres(
  info: InfoRapportOffres,
  tableau: TableauComparatif,
  brouillon: string,
): Promise<Buffer> {
  const nomParOffre = new Map(tableau.colonnes.map((c) => [c.offreId, c.entrepriseNom]))

  const corps: (Paragraph | Table)[] = [
    new Paragraph({ text: info.missionReference, spacing: { after: 40 } }),
    new Paragraph({
      text: `Analyse des offres — Lot ${info.lotNumero} ${info.lotIntitule}`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: info.nomOperation, spacing: { after: 60 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Document généré le ${info.dateGeneration.toLocaleDateString('fr-FR')} — brouillon à compléter et valider avant envoi.`,
          italics: true,
          color: '64736D',
          size: 20,
        }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({ text: 'Tableau comparatif', heading: HeadingLevel.HEADING_2 }),
    tableauOffres(tableau),
    new Paragraph({ text: '', spacing: { after: 160 } }),
    ...paragrapheAnomalies(tableau, nomParOffre),
    new Paragraph({ text: '', spacing: { after: 160 } }),
    new Paragraph({ text: 'Synthèse', heading: HeadingLevel.HEADING_2 }),
    ...(brouillon.trim() === ''
      ? [new Paragraph({ text: 'Synthèse non rédigée.', spacing: { after: 120 } })]
      : rendreTexte(brouillon, HeadingLevel.HEADING_3)),
  ]

  const document = new Document({
    creator: 'Application de gestion de missions d’économiste',
    title: `${info.missionReference} — Analyse des offres — Lot ${info.lotNumero}`,
    description: info.nomOperation,
    styles: {
      default: {
        document: { run: { font: POLICE, size: 22 } },
        heading1: { run: { font: POLICE, size: 30, bold: true, color: COULEUR_ENCRE } },
        heading2: { run: { font: POLICE, size: 26, bold: true, color: COULEUR_ACCENT } },
        heading3: { run: { font: POLICE, size: 23, bold: true, color: COULEUR_ENCRE } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: { default: piedDePage(info.missionReference) },
        children: corps,
      },
    ],
  })

  return Buffer.from(await Packer.toBuffer(document))
}
