import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import * as Money from '../../domain/money/money'
import { construireComparatif, type OffreAComparer, type PosteComparatif } from '../../domain/offres/comparatif'
import { genererComparatifExcel, nomFichierComparatif, type InfoComparatif } from './comparatif-export'

/**
 * Le classeur produit est relu cellule par cellule. Un export qu'on ne relit
 * pas est une promesse : celui-ci part au maître d'ouvrage, et les montants
 * doivent y être des nombres, pas du texte.
 */

const euros = (valeur: string) => Money.depuisEuros(valeur)

const POSTES: PosteComparatif[] = [
  { posteId: 'p1', code: '02.01', designation: 'Voile béton', unite: 'M3', montantEstimeHt: euros('10000') },
  { posteId: 'p2', code: '02.02', designation: 'Dalle portée', unite: 'M2', montantEstimeHt: euros('5000') },
]

const offre = (
  id: string,
  entreprise: string,
  montant: string,
  extra: Partial<OffreAComparer> = {},
): OffreAComparer => ({
  offreId: id,
  entrepriseNom: entreprise,
  type: 'BASE',
  montantHt: euros(montant),
  remiseGlobaleHt: Money.ZERO,
  conforme: true,
  lignes: [],
  ...extra,
})

const INFO: InfoComparatif = {
  reference: '2026-001',
  nomOperation: 'Médiathèque du Lamentin',
  lotNumero: '02',
  lotIntitule: 'Gros œuvre',
  dateGeneration: new Date('2026-09-17T10:00:00Z'),
}

async function relire(tableau: Parameters<typeof genererComparatifExcel>[1]) {
  const donnees = await genererComparatifExcel(INFO, tableau)
  const classeur = new ExcelJS.Workbook()
  await classeur.xlsx.load(donnees as unknown as ArrayBuffer)
  return classeur
}

const TABLEAU = construireComparatif(POSTES, [
  offre('a', 'Antilles Structures', '16000', {
    lignes: [
      { posteId: 'p1', montantHt: euros('11000') },
      { posteId: 'p2', montantHt: euros('5000') },
    ],
  }),
  offre('b', 'Sud Construction', '14000'),
  offre('v', 'Bois des Îles', '9000', { type: 'VARIANTE', libelle: 'Ossature bois' }),
  offre('o', 'Antilles Structures', '2000', { type: 'OPTION', libelle: 'Éclairage extérieur' }),
])

describe('classeur produit', () => {
  it('contient les deux feuilles attendues', async () => {
    const classeur = await relire(TABLEAU)
    expect(classeur.worksheets.map((f) => f.name)).toEqual(['Synthèse', 'Détail par ouvrage'])
  })

  it('écrit les montants en nombres, pas en texte', async () => {
    // C'est tout l'intérêt de l'export : le destinataire recalcule sans retaper.
    const classeur = await relire(TABLEAU)
    const synthese = classeur.getWorksheet('Synthèse')
    // Ligne 6 : première offre (3 lignes d'en-tête + 1 vide + 1 d'en-tête).
    expect(typeof synthese?.getRow(6).getCell(4).value).toBe('number')
    expect(synthese?.getRow(6).getCell(4).value).toBe(16000)
  })

  it('donne à chaque offre sa nature et son intitulé', async () => {
    const classeur = await relire(TABLEAU)
    const synthese = classeur.getWorksheet('Synthèse')
    const natures = [6, 7, 8, 9].map((n) => synthese?.getRow(n).getCell(2).value)
    expect(natures).toEqual(['Base', 'Base', 'Variante', 'Option'])
    expect(synthese?.getRow(8).getCell(3).value).toBe('Ossature bois')
  })

  it('marque la moins-disante, et elle seule', async () => {
    const classeur = await relire(TABLEAU)
    const synthese = classeur.getWorksheet('Synthèse')
    const observations = [6, 7, 8, 9].map((n) => String(synthese?.getRow(n).getCell(11).value ?? ''))
    expect(observations.filter((o) => o.includes('Moins-disante'))).toHaveLength(1)
    // Sud Construction à 14 000 €, la moins chère des bases conformes.
    expect(observations[1]).toContain('Moins-disante')
  })

  it('signale les offres hors classement', async () => {
    const classeur = await relire(TABLEAU)
    const synthese = classeur.getWorksheet('Synthèse')
    expect(String(synthese?.getRow(8).getCell(11).value)).toContain('Hors classement')
    expect(String(synthese?.getRow(9).getCell(11).value)).toContain('Hors classement')
  })

  it('laisse vide l’écart d’une option, au lieu d’écrire un nombre faux', async () => {
    const classeur = await relire(TABLEAU)
    const synthese = classeur.getWorksheet('Synthèse')
    expect(synthese?.getRow(9).getCell(7).value).toBe(null)
    expect(synthese?.getRow(9).getCell(8).value).toBe(null)
    // Une offre de base garde bien le sien.
    expect(typeof synthese?.getRow(6).getCell(7).value).toBe('number')
  })
})

describe('feuille de détail', () => {
  it('croise les ouvrages et les entreprises', async () => {
    const classeur = await relire(TABLEAU)
    const detail = classeur.getWorksheet('Détail par ouvrage')
    // Ligne 3 : en-tête. Colonnes 5 et suivantes : les entreprises.
    expect(detail?.getRow(3).getCell(5).value).toBe('Antilles Structures')
    expect(detail?.getRow(3).getCell(6).value).toBe('Sud Construction')
  })

  it('reprend les montants de ligne de l’offre détaillée', async () => {
    const classeur = await relire(TABLEAU)
    const detail = classeur.getWorksheet('Détail par ouvrage')
    // Ligne 5 : premier ouvrage (titre, vide, en-tête, natures).
    expect(detail?.getRow(5).getCell(2).value).toBe('Voile béton')
    expect(detail?.getRow(5).getCell(4).value).toBe(10000)
    expect(detail?.getRow(5).getCell(5).value).toBe(11000)
  })

  it('laisse la cellule vide quand l’entreprise n’a pas chiffré l’ouvrage', async () => {
    // Une offre globale n'a pas de ligne : vide, et surtout pas zéro — règle 7.
    const classeur = await relire(TABLEAU)
    const detail = classeur.getWorksheet('Détail par ouvrage')
    expect(detail?.getRow(5).getCell(6).value).toBe(null)
  })

  it('totalise les montants nets de remise', async () => {
    const avecRemise = construireComparatif(POSTES, [
      offre('a', 'Antilles Structures', '16000', { remiseGlobaleHt: euros('1000') }),
    ])
    const classeur = await relire(avecRemise)
    const detail = classeur.getWorksheet('Détail par ouvrage')
    const total = detail?.getRow(7)
    expect(total?.getCell(2).value).toBe('TOTAL')
    expect(total?.getCell(5).value).toBe(15000)
  })
})

describe('cas limites', () => {
  it('produit un classeur lisible sans aucune offre', async () => {
    const classeur = await relire(construireComparatif(POSTES, []))
    expect(classeur.getWorksheet('Synthèse')).toBeDefined()
    expect(classeur.getWorksheet('Détail par ouvrage')?.getRow(5).getCell(2).value).toBe('Voile béton')
  })

  it('produit un classeur lisible sans aucun ouvrage', async () => {
    const classeur = await relire(construireComparatif([], [offre('a', 'Entreprise', '5000')]))
    expect(classeur.getWorksheet('Synthèse')?.getRow(6).getCell(1).value).toBe('Entreprise')
  })
})

describe('nom du fichier', () => {
  it('reprend référence, opération et lot, sans accent ni espace', () => {
    expect(nomFichierComparatif(INFO)).toBe('2026-001-Mediatheque-du-Lamentin-Lot-02-Comparatif.xlsx')
  })

  it('ne laisse pas de tiret en fin de nom', () => {
    const nom = nomFichierComparatif({ ...INFO, nomOperation: 'École ---' })
    expect(nom).toBe('2026-001-Ecole-Lot-02-Comparatif.xlsx')
  })
})
