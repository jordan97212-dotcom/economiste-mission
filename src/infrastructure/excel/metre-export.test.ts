/**
 * Le classeur de métré est relu cellule par cellule. C'est une pièce
 * justificative : les mesures doivent y être des nombres qu'on recalcule, et
 * une ligne non calculable doit rester vide plutôt que de passer pour un zéro.
 */
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import type { LigneMetreDTO, MetreMissionDTO } from '../../application/dto'
import { genererMetreExcel, nomFichierMetre } from './metre-export'

const ligne = (partiel: Partial<LigneMetreDTO> & { id: string }): LigneMetreDTO => ({
  ordre: 0,
  type: 'MESURE',
  libelle: '',
  deduction: false,
  nombre: null,
  longueur: null,
  largeur: null,
  hauteur: null,
  rappelRepereId: null,
  valeur: null,
  ignoree: false,
  ...partiel,
})

const METRE: MetreMissionDTO = {
  reference: '2026-004',
  nomOperation: 'Groupe scolaire du Lorrain',
  lots: [
    {
      lotId: 'l1',
      numero: '02',
      intitule: 'Gros œuvre',
      ouvrages: [
        {
          posteId: 'p1',
          code: '02.01',
          designation: 'Voile béton',
          unite: 'M2',
          quantite: '64.840',
          total: '64.84',
          lignes: [
            ligne({ id: 'a', libelle: 'RDC — mur nord', longueur: '12.5', hauteur: '2.8', valeur: '35' }),
            ligne({
              id: 'b',
              libelle: 'Baie séjour',
              longueur: '2.4',
              hauteur: '2.15',
              deduction: true,
              valeur: '5.16',
            }),
          ],
          anomalies: [],
        },
      ],
    },
  ],
  reperes: [
    {
      id: 'r1',
      nom: 'Surface étage courant',
      unite: 'M2',
      ordre: 0,
      valeur: '320',
      degre: 2,
      emplois: 2,
      anomalies: [],
      total: '320',
      lignes: [ligne({ id: 'c', libelle: 'Emprise', longueur: '20', largeur: '16', valeur: '320' })],
    },
  ],
}

async function relire(metre: MetreMissionDTO) {
  const donnees = await genererMetreExcel(metre, { dateGeneration: new Date('2026-09-17T10:00:00Z') })
  const classeur = new ExcelJS.Workbook()
  await classeur.xlsx.load(donnees as unknown as ArrayBuffer)
  return classeur
}

describe('classeur de métré', () => {
  it('sépare le métré des repères', async () => {
    const classeur = await relire(METRE)
    expect(classeur.worksheets.map((f) => f.name)).toEqual(['Métré', 'Repères'])
  })

  it('reprend chaque mesure en nombres', async () => {
    const classeur = await relire(METRE)
    const feuille = classeur.getWorksheet('Métré')
    // 1 titre, 2 sous-titre, 3 vide, 4 lot, 5 ouvrage, 6 en-tête, 7 première mesure.
    expect(feuille?.getRow(5).getCell(1).value).toBe('02.01 · Voile béton')
    expect(feuille?.getRow(7).getCell(1).value).toBe('RDC — mur nord')
    expect(feuille?.getRow(7).getCell(4).value).toBe(12.5)
    expect(feuille?.getRow(7).getCell(6).value).toBe(2.8)
    expect(feuille?.getRow(7).getCell(8).value).toBe(35)
  })

  it('marque les déductions', async () => {
    const classeur = await relire(METRE)
    const feuille = classeur.getWorksheet('Métré')
    expect(feuille?.getRow(8).getCell(7).value).toBe('−')
    expect(feuille?.getRow(8).getCell(8).value).toBe(5.16)
  })

  it('porte la quantité réellement retenue par l’ouvrage', async () => {
    const classeur = await relire(METRE)
    const feuille = classeur.getWorksheet('Métré')
    expect(feuille?.getRow(9).getCell(1).value).toBe('Quantité retenue')
    expect(feuille?.getRow(9).getCell(2).value).toBe('m²')
    expect(feuille?.getRow(9).getCell(8).value).toBe(64.84)
  })

  it('laisse vide une ligne non calculable, au lieu d’écrire zéro', async () => {
    const casse: MetreMissionDTO = {
      ...METRE,
      lots: [
        {
          ...METRE.lots[0]!,
          ouvrages: [
            {
              ...METRE.lots[0]!.ouvrages[0]!,
              quantite: null,
              lignes: [ligne({ id: 'x', type: 'RAPPEL', rappelRepereId: 'disparu' })],
              anomalies: [{ code: 'repere_inconnu', ligneId: 'x', message: 'Repère introuvable.' }],
            },
          ],
        },
      ],
    }
    const feuille = (await relire(casse)).getWorksheet('Métré')
    expect(feuille?.getRow(7).getCell(8).value).toBe(null)
    expect(feuille?.getRow(8).getCell(8).value).toBe(null)
    // L'anomalie est écrite noir sur blanc sous l'ouvrage.
    expect(String(feuille?.getRow(9).getCell(2).value)).toContain('Repère introuvable.')
  })

  it('nomme le repère rappelé plutôt que son identifiant', async () => {
    const avecRappel: MetreMissionDTO = {
      ...METRE,
      lots: [
        {
          ...METRE.lots[0]!,
          ouvrages: [
            {
              ...METRE.lots[0]!.ouvrages[0]!,
              lignes: [ligne({ id: 'y', type: 'RAPPEL', rappelRepereId: 'r1', nombre: '3', valeur: '960' })],
            },
          ],
        },
      ],
    }
    const feuille = (await relire(avecRappel)).getWorksheet('Métré')
    expect(feuille?.getRow(7).getCell(2).value).toBe('Rappel · Surface étage courant')
  })

  it('détaille les repères et compte leurs emplois', async () => {
    const feuille = (await relire(METRE)).getWorksheet('Repères')
    expect(feuille?.getRow(4).getCell(1).value).toBe('Surface étage courant')
    expect(feuille?.getRow(4).getCell(8).value).toBe(320)
    expect(feuille?.getRow(5).getCell(1).value).toBe('Emprise')
    expect(String(feuille?.getRow(6).getCell(1).value)).toContain('2 feuille(s)')
  })

  it('reste lisible quand rien n’est métré', async () => {
    const vide: MetreMissionDTO = { ...METRE, lots: [], reperes: [] }
    const classeur = await relire(vide)
    expect(String(classeur.getWorksheet('Métré')?.getRow(4).getCell(1).value)).toContain(
      'Aucun ouvrage',
    )
    expect(String(classeur.getWorksheet('Repères')?.getRow(4).getCell(1).value)).toContain(
      'Aucun repère',
    )
  })
})

describe('nom du fichier', () => {
  it('reprend référence et opération, sans accent ni espace', () => {
    expect(nomFichierMetre(METRE)).toBe('2026-004-Groupe-scolaire-du-Lorrain-Metre.xlsx')
  })
})
