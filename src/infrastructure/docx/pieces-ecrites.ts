import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  TableOfContents,
  TextRun,
} from 'docx'
import { analyserTexte, type BlocTexte } from '../../domain/texte/structure'
import type { ChiffrageDTO, LotDTO, PosteDTO } from '../../application/dto'

/**
 * Génération des pièces écrites du DCE — SPEC_APP_ECONOMISTE.md §5.4.
 *
 * Le document Word est la source ; le PDF en est la conversion. Les deux ont
 * donc forcément la même mise en page, et le sommaire n'est calculé qu'une fois.
 *
 * Le CCTP est assemblé dans l'ordre des lots, chaque ouvrage apportant son texte
 * descriptif. Un ouvrage sans texte laisse une mention visible plutôt qu'un
 * blanc : sur une pièce contractuelle, un trou doit se voir.
 */

export type PieceEcrite = 'CCTP' | 'CCAP' | 'CCTG' | 'HONORAIRES'

const LIBELLES_PIECE: Record<PieceEcrite, string> = {
  CCTP: 'Cahier des clauses techniques particulières',
  CCAP: 'Cahier des clauses administratives particulières',
  CCTG: 'Cahier des clauses techniques générales',
  HONORAIRES: 'Proposition d’honoraires',
}

const TITRES_PAGE_DE_GARDE: Record<PieceEcrite, string> = {
  CCTP: 'CCTP',
  CCAP: 'CCAP',
  CCTG: 'CCTG',
  HONORAIRES: 'Proposition d’honoraires',
}

const POLICE = 'Calibri'

function paragrapheDepuisBloc(bloc: BlocTexte, niveauTitre: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  if (bloc.type === 'titre') {
    return new Paragraph({
      text: bloc.texte,
      heading: niveauTitre,
      spacing: { before: 200, after: 100 },
    })
  }

  if (bloc.type === 'puce') {
    return new Paragraph({
      text: bloc.texte,
      bullet: { level: 0 },
      spacing: { after: 60 },
    })
  }

  return new Paragraph({
    text: bloc.texte,
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 280 },
  })
}

export function rendreTexte(contenu: string, niveauTitre: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph[] {
  return analyserTexte(contenu).map((bloc) => paragrapheDepuisBloc(bloc, niveauTitre))
}

function pageDeGarde(chiffrage: ChiffrageDTO, piece: PieceEcrite): Paragraph[] {
  const mission = chiffrage.mission
  const lignes: Paragraph[] = [
    new Paragraph({ text: '', spacing: { before: 1800 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: mission.nomOperation, bold: true, size: 36 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [new TextRun({ text: `Référence ${mission.reference}`, size: 24, color: '64736D' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: TITRES_PAGE_DE_GARDE[piece], bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
      children: [new TextRun({ text: LIBELLES_PIECE[piece], size: 24, italics: true })],
    }),
  ]

  const ajouterLigne = (libelle: string, valeur: string | null): void => {
    if (!valeur) return
    lignes.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new TextRun({ text: `${libelle} : `, color: '64736D' }),
          new TextRun({ text: valeur, bold: true }),
        ],
      }),
    )
  }

  ajouterLigne('Maître d’ouvrage', mission.maitreOuvrage)
  ajouterLigne('Maître d’œuvre', mission.maitreOeuvre)
  ajouterLigne(
    'Surface',
    mission.surfaceShon ? `${mission.surfaceShon.replace('.', ',')} m²` : null,
  )
  ajouterLigne(
    'Date',
    new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
  )

  lignes.push(new Paragraph({ children: [new PageBreak()] }))
  return lignes
}

function sommaire(): Paragraph[] {
  return [
    new Paragraph({ text: 'Sommaire', heading: HeadingLevel.HEADING_1 }),
    new TableOfContents('Sommaire', { hyperlink: true, headingStyleRange: '1-4' }) as unknown as Paragraph,
    new Paragraph({ children: [new PageBreak()] }),
  ]
}

function piedDePage(chiffrage: ChiffrageDTO, piece: PieceEcrite): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${chiffrage.mission.reference} — ${piece} — page `,
            size: 16,
            color: '64736D',
          }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64736D' }),
          new TextRun({ text: ' / ', size: 16, color: '64736D' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64736D' }),
        ],
      }),
    ],
  })
}

function enfantsParParent(postes: readonly PosteDTO[]): Map<string | null, PosteDTO[]> {
  const carte = new Map<string | null, PosteDTO[]>()
  for (const poste of postes) {
    const liste = carte.get(poste.parentId) ?? []
    liste.push(poste)
    carte.set(poste.parentId, liste)
  }
  for (const liste of carte.values()) liste.sort((a, b) => a.ordre - b.ordre)
  return carte
}

const NIVEAUX = [
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
] as const

/** Textes descriptifs, fournis par l'appelant, indexés par identifiant de poste. */
export type TextesParPoste = ReadonlyMap<string, string>

function ecrireLotCctp(lot: LotDTO, textes: TextesParPoste): Paragraph[] {
  const paragraphes: Paragraph[] = [
    new Paragraph({
      text: `LOT ${lot.numero} — ${lot.intitule}`,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 160 },
      pageBreakBefore: true,
    }),
  ]

  const enfants = enfantsParParent(lot.postes)

  const descendre = (parentId: string | null, profondeur: number): void => {
    for (const poste of enfants.get(parentId) ?? []) {
      const niveau = NIVEAUX[Math.min(profondeur, NIVEAUX.length - 1)] ?? HeadingLevel.HEADING_5
      const intitule = poste.code ? `${poste.code} — ${poste.designation}` : poste.designation

      paragraphes.push(
        new Paragraph({
          text: intitule,
          heading: niveau,
          spacing: { before: 200, after: 80 },
        }),
      )

      const texte = textes.get(poste.id)
      if (texte && texte.trim() !== '') {
        paragraphes.push(...rendreTexte(texte, HeadingLevel.HEADING_6))
      } else if (poste.type === 'OUVRAGE') {
        paragraphes.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: '[ Texte de CCTP à rédiger ]',
                italics: true,
                color: '9B2C2C',
              }),
            ],
          }),
        )
      }

      descendre(poste.id, profondeur + 1)
    }
  }

  descendre(null, 0)
  return paragraphes
}

function documentBase(
  chiffrage: ChiffrageDTO,
  piece: PieceEcrite,
  corps: Paragraph[],
): Document {
  return new Document({
    creator: 'Application de gestion de missions d’économiste',
    title: `${chiffrage.mission.reference} — ${piece}`,
    description: chiffrage.mission.nomOperation,
    // Demande à Word et à LibreOffice de recalculer le sommaire à l'ouverture.
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: POLICE, size: 22 } },
        heading1: {
          run: { font: POLICE, size: 30, bold: true, color: '13211D' },
          paragraph: { spacing: { before: 320, after: 160 } },
        },
        heading2: {
          run: { font: POLICE, size: 26, bold: true, color: '0B5546' },
          paragraph: { spacing: { before: 260, after: 120 } },
        },
        heading3: {
          run: { font: POLICE, size: 23, bold: true, color: '13211D' },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
        heading4: {
          run: { font: POLICE, size: 22, bold: true, color: '3D4E48' },
          paragraph: { spacing: { before: 160, after: 80 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        footers: { default: piedDePage(chiffrage, piece) },
        children: corps,
      },
    ],
  })
}

/** CCTP : les textes des ouvrages assemblés dans l'ordre des lots. */
export async function genererCctp(
  chiffrage: ChiffrageDTO,
  textes: TextesParPoste,
  preambule?: string | null,
): Promise<Buffer> {
  const corps: Paragraph[] = [...pageDeGarde(chiffrage, 'CCTP'), ...sommaire()]

  if (preambule && preambule.trim() !== '') {
    corps.push(
      new Paragraph({ text: 'Généralités', heading: HeadingLevel.HEADING_1 }),
      ...rendreTexte(preambule, HeadingLevel.HEADING_2),
    )
  }

  for (const lot of chiffrage.lots) {
    corps.push(...ecrireLotCctp(lot, textes))
  }

  return Buffer.from(await Packer.toBuffer(documentBase(chiffrage, 'CCTP', corps)))
}

/** CCAP et CCTG : une trame unique, variables déjà résolues par l'appelant. */
export async function genererPieceSimple(
  chiffrage: ChiffrageDTO,
  piece: 'CCAP' | 'CCTG' | 'HONORAIRES',
  contenu: string,
): Promise<Buffer> {
  const corps: Paragraph[] = [
    ...pageDeGarde(chiffrage, piece),
    ...sommaire(),
    ...rendreTexte(contenu, HeadingLevel.HEADING_1),
  ]
  return Buffer.from(await Packer.toBuffer(documentBase(chiffrage, piece, corps)))
}

export function nomFichierPiece(
  chiffrage: ChiffrageDTO,
  piece: PieceEcrite,
  extension: 'docx' | 'pdf',
): string {
  const operation = chiffrage.mission.nomOperation
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${chiffrage.mission.reference}-${operation}-${piece}.${extension}`
}
