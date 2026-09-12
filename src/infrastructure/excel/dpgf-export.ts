import ExcelJS from 'exceljs'
import * as PU from '../../domain/money/prix-unitaire'
import type { ChiffrageDTO, LotDTO, PosteDTO } from '../../application/dto'

/**
 * Export Excel du DPGF — SPEC_APP_ECONOMISTE.md §5.3.
 *
 * Deux variantes issues du même générateur :
 *
 *  - « avec prix » : le bordereau chiffré, tel qu'il part au maître d'ouvrage ;
 *  - « à remplir » : les mêmes quantités, colonnes de prix vides, feuille
 *    protégée et cellules de saisie déverrouillées, pour l'entreprise.
 *
 * Le prix exporté est le prix unitaire FINAL, coefficient d'ajustement déjà
 * appliqué. Le prix de base et le coefficient restent internes à l'économiste :
 * ils ne sortent jamais dans un document destiné à un tiers.
 *
 * Les montants portent une formule Excel vivante plutôt qu'une valeur figée,
 * pour que le destinataire puisse vérifier le calcul. La formule arrondit au
 * centime, exactement comme le domaine.
 */

export type VarianteDpgf = 'avec-prix' | 'a-remplir'

const COULEUR_ENTETE = 'FF13211D'
const COULEUR_CHAPITRE = 'FFECF0EE'
const COULEUR_SAISIE = 'FFFFF7E0'
const FORMAT_EURO = '#,##0.00\\ "€"'
const FORMAT_QUANTITE = '#,##0.000'

const LARGEURS = [14, 62, 9, 13, 15, 17]
const EN_TETES = ['Code', 'Désignation', 'Unité', 'Quantité', 'Prix unitaire HT', 'Montant HT']

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

/** Excel refuse certains caractères et limite les noms d'onglet à 31 signes. */
function nomFeuilleValide(brut: string, deja: Set<string>): string {
  let nom = brut.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31)
  if (nom === '') nom = 'Lot'
  let candidat = nom
  let suffixe = 2
  while (deja.has(candidat)) {
    const base = nom.slice(0, 31 - String(suffixe).length - 1)
    candidat = `${base} ${suffixe}`
    suffixe += 1
  }
  deja.add(candidat)
  return candidat
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

interface ContexteEcriture {
  readonly feuille: ExcelJS.Worksheet
  readonly variante: VarianteDpgf
  readonly precision: number
  readonly identifiants: { feuille: string; ligne: number; posteId: string }[]
}

/** Écrit un sous-arbre et renvoie les numéros de ligne du niveau demandé. */
function ecrireNiveau(
  contexte: ContexteEcriture,
  enfants: Map<string | null, PosteDTO[]>,
  parentId: string | null,
  profondeur: number,
): number[] {
  const lignesDuNiveau: number[] = []

  for (const poste of enfants.get(parentId) ?? []) {
    const ligne = contexte.feuille.addRow([])
    const numero = ligne.number
    contexte.identifiants.push({ feuille: contexte.feuille.name, ligne: numero, posteId: poste.id })

    ligne.getCell(1).value = poste.code ?? ''
    ligne.getCell(2).value = `${'    '.repeat(profondeur)}${poste.designation}`

    if (poste.type === 'SOUS_LOT') {
      ligne.font = { bold: true }
      ligne.getCell(2).alignment = { indent: profondeur }
      for (let colonne = 1; colonne <= 6; colonne += 1) {
        ligne.getCell(colonne).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COULEUR_CHAPITRE },
        }
      }

      const lignesEnfants = ecrireNiveau(contexte, enfants, poste.id, profondeur + 1)
      if (lignesEnfants.length > 0) {
        ligne.getCell(6).value = {
          formula: lignesEnfants.map((n) => `F${n}`).join('+'),
          date1904: false,
        }
      } else {
        ligne.getCell(6).value = 0
      }
      ligne.getCell(6).numFmt = FORMAT_EURO
      lignesDuNiveau.push(numero)
      continue
    }

    ligne.getCell(2).alignment = { wrapText: true, indent: profondeur, vertical: 'top' }
    ligne.getCell(3).value = poste.unite ? (LIBELLES_UNITE[poste.unite] ?? poste.unite) : ''
    ligne.getCell(3).alignment = { horizontal: 'center' }

    if (poste.quantite !== null) {
      ligne.getCell(4).value = Number(poste.quantite)
      ligne.getCell(4).numFmt = FORMAT_QUANTITE
    }

    if (contexte.variante === 'avec-prix' && poste.prixUnitaireHtFinal !== null) {
      ligne.getCell(5).value = Number(PU.versEuros(PU.depuisStockage(BigInt(poste.prixUnitaireHtFinal))))
    } else if (contexte.variante === 'a-remplir') {
      ligne.getCell(5).protection = { locked: false }
      ligne.getCell(5).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COULEUR_SAISIE },
      }
    }
    ligne.getCell(5).numFmt = FORMAT_EURO

    // Le montant suit l'affichage : quantité fois prix affiché, arrondi au
    // centime. L'entreprise qui recalcule retombe sur le même total.
    ligne.getCell(6).value = { formula: `ROUND(D${numero}*E${numero},2)`, date1904: false }
    ligne.getCell(6).numFmt = FORMAT_EURO

    lignesDuNiveau.push(numero)
  }

  return lignesDuNiveau
}

function ecrireLot(
  classeur: ExcelJS.Workbook,
  chiffrage: ChiffrageDTO,
  lot: LotDTO,
  variante: VarianteDpgf,
  nomsPris: Set<string>,
  identifiants: { feuille: string; ligne: number; posteId: string }[],
): { nomFeuille: string; celluleTotal: string } {
  const nom = nomFeuilleValide(`${lot.numero} ${lot.intitule}`, nomsPris)
  const feuille = classeur.addWorksheet(nom, {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  feuille.columns = LARGEURS.map((largeur) => ({ width: largeur }))

  const titre = feuille.addRow([chiffrage.mission.nomOperation])
  titre.font = { bold: true, size: 13 }
  feuille.mergeCells(titre.number, 1, titre.number, 6)

  const sousTitre = feuille.addRow([
    `${chiffrage.mission.reference} — Lot ${lot.numero} : ${lot.intitule}`,
  ])
  sousTitre.font = { size: 11, color: { argb: 'FF64736D' } }
  feuille.mergeCells(sousTitre.number, 1, sousTitre.number, 6)

  const mention = feuille.addRow([
    variante === 'a-remplir'
      ? 'Document à compléter : renseignez uniquement la colonne Prix unitaire HT. Les montants se calculent seuls.'
      : 'Décomposition du prix global et forfaitaire — montants hors taxes.',
  ])
  mention.font = { italic: true, size: 10, color: { argb: 'FF64736D' } }
  feuille.mergeCells(mention.number, 1, mention.number, 6)

  feuille.addRow([])

  const entete = feuille.addRow(EN_TETES)
  entete.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
  entete.alignment = { vertical: 'middle' }
  entete.height = 22
  for (let colonne = 1; colonne <= 6; colonne += 1) {
    entete.getCell(colonne).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COULEUR_ENTETE },
    }
  }

  const racines = ecrireNiveau(
    { feuille, variante, precision: chiffrage.mission.precisionPu, identifiants },
    enfantsParParent(lot.postes),
    null,
    0,
  )

  const total = feuille.addRow([])
  total.getCell(2).value = `TOTAL LOT ${lot.numero} HT`
  total.font = { bold: true }
  total.getCell(6).value =
    racines.length > 0 ? { formula: racines.map((n) => `F${n}`).join('+'), date1904: false } : 0
  total.getCell(6).numFmt = FORMAT_EURO
  for (let colonne = 1; colonne <= 6; colonne += 1) {
    total.getCell(colonne).border = { top: { style: 'medium' } }
  }

  // Filets légers sur toute la zone de tableau
  for (let numero = entete.number; numero <= total.number; numero += 1) {
    for (let colonne = 1; colonne <= 6; colonne += 1) {
      const cellule = feuille.getRow(numero).getCell(colonne)
      cellule.border = {
        ...cellule.border,
        left: { style: 'hair', color: { argb: 'FFD8DFDA' } },
        right: { style: 'hair', color: { argb: 'FFD8DFDA' } },
        bottom: { style: 'hair', color: { argb: 'FFD8DFDA' } },
      }
    }
  }

  return { nomFeuille: nom, celluleTotal: `'${nom}'!F${total.number}` }
}

export interface OptionsExport {
  readonly variante: VarianteDpgf
}

export async function genererDpgfExcel(
  chiffrage: ChiffrageDTO,
  options: OptionsExport,
): Promise<Buffer> {
  const classeur = new ExcelJS.Workbook()
  classeur.creator = 'Application de gestion de missions d’économiste'
  classeur.created = new Date()

  const recapitulatif = classeur.addWorksheet('Récapitulatif', {
    views: [{ state: 'frozen', ySplit: 6 }],
  })
  recapitulatif.columns = [{ width: 12 }, { width: 56 }, { width: 20 }]

  const nomsPris = new Set<string>(['Récapitulatif'])
  const identifiants: { feuille: string; ligne: number; posteId: string }[] = []

  const feuilles = chiffrage.lots.map((lot) =>
    ecrireLot(classeur, chiffrage, lot, options.variante, nomsPris, identifiants),
  )

  // Récapitulatif rempli après les lots, pour pointer vers leurs totaux.
  const titre = recapitulatif.addRow([chiffrage.mission.nomOperation])
  titre.font = { bold: true, size: 14 }
  recapitulatif.mergeCells(titre.number, 1, titre.number, 3)

  const reference = recapitulatif.addRow([
    `${chiffrage.mission.reference}${chiffrage.mission.maitreOuvrage ? ` — ${chiffrage.mission.maitreOuvrage}` : ''}`,
  ])
  reference.font = { size: 11, color: { argb: 'FF64736D' } }
  recapitulatif.mergeCells(reference.number, 1, reference.number, 3)

  const surface = chiffrage.mission.surfaceShon ?? chiffrage.mission.surfaceUtile
  if (surface) {
    const ligneSurface = recapitulatif.addRow([`Surface prise en compte : ${surface.replace('.', ',')} m²`])
    ligneSurface.font = { size: 10, color: { argb: 'FF64736D' } }
    recapitulatif.mergeCells(ligneSurface.number, 1, ligneSurface.number, 3)
  }

  recapitulatif.addRow([])

  const enteteRecap = recapitulatif.addRow(['Lot', 'Intitulé', 'Montant HT'])
  enteteRecap.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
  enteteRecap.height = 22
  for (let colonne = 1; colonne <= 3; colonne += 1) {
    enteteRecap.getCell(colonne).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COULEUR_ENTETE },
    }
  }

  const lignesLots: number[] = []
  for (const [index, lot] of chiffrage.lots.entries()) {
    const feuille = feuilles[index]
    const ligne = recapitulatif.addRow([lot.numero, lot.intitule])
    ligne.getCell(1).alignment = { horizontal: 'left' }
    if (feuille) {
      ligne.getCell(3).value = { formula: feuille.celluleTotal, date1904: false }
    }
    ligne.getCell(3).numFmt = FORMAT_EURO
    lignesLots.push(ligne.number)
  }

  const totalGeneral = recapitulatif.addRow([])
  totalGeneral.getCell(2).value = 'TOTAL TOUS CORPS D’ÉTAT HT'
  totalGeneral.font = { bold: true, size: 12 }
  totalGeneral.getCell(3).value =
    lignesLots.length > 0 ? { formula: lignesLots.map((n) => `C${n}`).join('+'), date1904: false } : 0
  totalGeneral.getCell(3).numFmt = FORMAT_EURO
  for (let colonne = 1; colonne <= 3; colonne += 1) {
    totalGeneral.getCell(colonne).border = { top: { style: 'medium' } }
  }

  if (options.variante === 'avec-prix') {
    const ratio = chiffrage.recapitulatif.ratioEuroParM2
    if (ratio && chiffrage.recapitulatif.totalTceHt !== '0') {
      recapitulatif.addRow([])
      const ligneRatio = recapitulatif.addRow(['', 'Ratio au mètre carré', Number(ratio)])
      ligneRatio.getCell(3).numFmt = FORMAT_EURO
      ligneRatio.font = { color: { argb: 'FF64736D' } }
    }
  }

  // Onglet technique : la correspondance ligne vers poste rend fiable la
  // reprise ultérieure d'une offre remplie par une entreprise.
  const technique = classeur.addWorksheet('_identifiants', { state: 'veryHidden' })
  technique.columns = [{ width: 34 }, { width: 10 }, { width: 30 }]
  technique.addRow(['feuille', 'ligne', 'poste'])
  for (const entree of identifiants) {
    technique.addRow([entree.feuille, entree.ligne, entree.posteId])
  }

  if (options.variante === 'a-remplir') {
    // Verrouillage : quantités et désignations figées, prix unitaires ouverts.
    for (const feuille of classeur.worksheets) {
      if (feuille.name === '_identifiants') continue
      await feuille.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        insertRows: false,
        deleteRows: false,
      })
    }
  }

  const tampon = await classeur.xlsx.writeBuffer()
  return Buffer.from(tampon)
}

/** Nom de fichier lisible et sans caractère gênant. */
export function nomFichierDpgf(chiffrage: ChiffrageDTO, variante: VarianteDpgf): string {
  const operation = chiffrage.mission.nomOperation
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const suffixe = variante === 'a-remplir' ? 'DPGF-a-remplir' : 'DPGF'
  return `${chiffrage.mission.reference}-${operation}-${suffixe}.xlsx`
}
