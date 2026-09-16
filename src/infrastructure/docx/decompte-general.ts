import {
  AlignmentType,
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
} from 'docx'
import type { DecompteMissionDTO } from '../../application/cloture/service'

/**
 * Projet de décompte général — SPEC_APP_ECONOMISTE.md §5.7.
 *
 * Le document reprend ce que l'application détient : marché, avenants
 * acceptés, travaux exécutés, retenue de garantie et net réglé. Il ne contient
 * ni révision de prix, ni intérêts moratoires, ni pénalités : aucun n'est
 * modélisé, et les inventer produirait un document faux sur un sujet
 * contractuel. Le document le dit lui-même, en tête.
 */

const POLICE = 'Calibri'
const COULEUR_ENCRE = '13211D'
const COULEUR_ACCENT = '0B5546'

/** Les montants sont en centimes ; le document est en euros. */
function euros(centimes: string): string {
  const negatif = centimes.startsWith('-')
  const absolu = negatif ? centimes.slice(1) : centimes
  const entier = absolu.padStart(3, '0')
  const partieEntiere = entier.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${negatif ? '-' : ''}${partieEntiere},${entier.slice(-2)} €`
}

function cellule(texte: string, options: { gras?: boolean; droite?: boolean; entete?: boolean } = {}): TableCell {
  return new TableCell({
    ...(options.entete ? { shading: { fill: COULEUR_ENCRE } } : {}),
    children: [
      new Paragraph({
        alignment: options.droite ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: texte,
            bold: options.gras ?? options.entete ?? false,
            ...(options.entete ? { color: 'FFFFFF' } : {}),
          }),
        ],
      }),
    ],
  })
}

function tableauDesLots(decompte: DecompteMissionDTO): Table {
  const enTete = new TableRow({
    children: [
      cellule('Lot', { entete: true }),
      cellule('Entreprise', { entete: true }),
      cellule('Marché actuel', { entete: true }),
      cellule('Travaux exécutés', { entete: true }),
      cellule('Retenue à restituer', { entete: true }),
      cellule('Net réglé', { entete: true }),
    ],
  })

  const lignes = decompte.lots.map(
    (lot) =>
      new TableRow({
        children: [
          cellule(`${lot.numero} · ${lot.intitule}`),
          cellule(lot.entrepriseNom ?? 'non attribué'),
          cellule(euros(lot.marcheActuelHt), { droite: true }),
          cellule(euros(lot.travauxExecutesHt), { droite: true }),
          cellule(euros(lot.retenueGarantieARestituerHt), { droite: true }),
          cellule(euros(lot.netRegleHt), { droite: true }),
        ],
      }),
  )

  const total = new TableRow({
    children: [
      cellule('TOTAL', { gras: true }),
      cellule(''),
      cellule(euros(decompte.marcheActuelHt), { gras: true, droite: true }),
      cellule(euros(decompte.travauxExecutesHt), { gras: true, droite: true }),
      cellule(euros(decompte.retenueGarantieARestituerHt), { gras: true, droite: true }),
      cellule(euros(decompte.netRegleHt), { gras: true, droite: true }),
    ],
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [enTete, ...lignes, total],
  })
}

export interface InfoDecompte {
  readonly reference: string
  readonly nomOperation: string
  readonly maitreOuvrage: string | null
  readonly dateGeneration: Date
}

export async function genererDecompteGeneral(
  info: InfoDecompte,
  decompte: DecompteMissionDTO,
): Promise<Buffer> {
  const corps: (Paragraph | Table)[] = [
    new Paragraph({ text: info.reference, spacing: { after: 40 } }),
    new Paragraph({ text: 'Projet de décompte général', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: info.nomOperation }),
    ...(info.maitreOuvrage
      ? [new Paragraph({ text: `Maître d’ouvrage : ${info.maitreOuvrage}`, spacing: { after: 60 } })]
      : []),
    new Paragraph({
      children: [
        new TextRun({
          text: `Établi le ${info.dateGeneration.toLocaleDateString('fr-FR')}.`,
          italics: true,
          color: '64736D',
          size: 20,
        }),
      ],
      spacing: { after: 200 },
    }),

    new Paragraph({ text: 'Ce que ce document contient', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({
      text:
        'Les montants ci-dessous sont ceux enregistrés dans le suivi de l’opération : marché attribué, avenants acceptés, travaux exécutés au fil des situations, retenue de garantie et net réglé.',
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'Ce document ne comporte ni révision de prix, ni actualisation, ni intérêts moratoires, ni pénalités de retard : ces éléments ne sont pas tenus par l’application. Il s’agit d’un projet de décompte, à compléter avant toute signature.',
          bold: true,
        }),
      ],
      spacing: { after: 200 },
    }),

    new Paragraph({ text: 'Récapitulatif par lot', heading: HeadingLevel.HEADING_2 }),
    tableauDesLots(decompte),
    new Paragraph({ text: '', spacing: { after: 160 } }),

    new Paragraph({ text: 'Synthèse de l’opération', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: `Marché actuel, avenants acceptés compris : ${euros(decompte.marcheActuelHt)} HT.` }),
    new Paragraph({ text: `Travaux exécutés : ${euros(decompte.travauxExecutesHt)} HT${decompte.executePourcent !== null ? `, soit ${decompte.executePourcent.replace('.', ',')} % du marché` : ''}.` }),
    new Paragraph({ text: `Part de marché non exécutée : ${euros(decompte.soldeNonExecuteHt)} HT.` }),
    new Paragraph({
      text: `Retenue de garantie conservée : ${euros(decompte.retenueGarantieARestituerHt)} HT, à restituer à la levée des réserves.`,
    }),
    new Paragraph({ text: `Net réglé aux entreprises : ${euros(decompte.netRegleHt)} HT.`, spacing: { after: 200 } }),

    new Paragraph({ text: 'Signatures', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: 'Le maître d’ouvrage', spacing: { before: 200, after: 400 } }),
    new Paragraph({ text: 'L’économiste de la construction', spacing: { after: 400 } }),
  ]

  const document = new Document({
    creator: 'Application de gestion de missions d’économiste',
    title: `${info.reference} — Projet de décompte général`,
    description: info.nomOperation,
    styles: {
      default: {
        document: { run: { font: POLICE, size: 22 } },
        heading1: { run: { font: POLICE, size: 30, bold: true, color: COULEUR_ENCRE } },
        heading2: { run: { font: POLICE, size: 26, bold: true, color: COULEUR_ACCENT } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `${info.reference} — Projet de décompte général — page `, size: 18, color: '64736D' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '64736D' }),
                  new TextRun({ text: ' / ', size: 18, color: '64736D' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '64736D' }),
                ],
              }),
            ],
          }),
        },
        children: corps,
      },
    ],
  })

  return Buffer.from(await Packer.toBuffer(document))
}

export function nomFichierDecompte(info: InfoDecompte): string {
  const operation = info.nomOperation
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${info.reference}-${operation}-Decompte-general.docx`
}
