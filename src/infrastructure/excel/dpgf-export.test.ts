/**
 * Aller-retour d'export : on génère le classeur, on le relit avec la même
 * bibliothèque, et on vérifie ce qui compte pour un document contractuel —
 * les quantités, les prix affichés, les formules de montant, et le verrouillage
 * de la version destinée à l'entreprise.
 */
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { genererDpgfExcel, nomFichierDpgf } from './dpgf-export'
import * as PU from '../../domain/money/prix-unitaire'
import type { ChiffrageDTO, PosteDTO } from '../../application/dto'

function ouvrage(partiel: Partial<PosteDTO> & { id: string; designation: string }): PosteDTO {
  return {
    parentId: null,
    type: 'OUVRAGE',
    ordre: 0,
    profondeur: 0,
    code: null,
    unite: 'M3',
    quantite: null,
    prixUnitaireHtBase: null,
    coefficientApplique: null,
    prixUnitaireHtFinal: null,
    montantHt: '0',
    sourcePrix: 'SAISIE_MANUELLE',
    dateSourcePrix: null,
    aTexteCctp: false,
    aMetre: false,
    ...partiel,
  }
}

const CHIFFRAGE: ChiffrageDTO = {
  mission: {
    id: 'm1',
    reference: '2026-014',
    nomOperation: 'Résidence Les Flamboyants',
    maitreOuvrage: 'SIMAR',
    maitreOeuvre: null,
    typeOuvrage: 'LOGEMENT_COLLECTIF',
    nature: 'CONSTRUCTION_NEUVE',
    typeMarche: 'PUBLIC',
    surfaceShon: '1840.00',
    surfaceUtile: null,
    budgetPrevisionnelHt: null,
    phasesContractuelles: ['DCE'],
    dateDebut: null,
    dateFinPrevue: null,
    statut: 'EN_COURS',
    honorairesMissionHt: null,
    modeFacturation: null,
    coefficientLocalDefaut: '1.2500',
    precisionPu: 2,
    tauxTva: '8.50',
    seuilDerivePourcent: '5.00',
  },
  lots: [
    {
      id: 'lot1',
      numero: '02',
      intitule: 'Gros œuvre — Maçonnerie',
      ordre: 0,
      corpsEtatId: null,
      coefficientLocal: null,
      montantEstimeHt: '1694753',
      postes: [
        ouvrage({
          id: 'sl1',
          type: 'SOUS_LOT',
          designation: 'FONDATIONS',
          unite: null,
          montantHt: '1694753',
        }),
        ouvrage({
          id: 'p1',
          parentId: 'sl1',
          profondeur: 1,
          code: '02.03.01',
          designation: 'Béton armé pour voiles',
          quantite: '47.500',
          prixUnitaireHtFinal: PU.depuisEuros('356.79').toString(),
          montantHt: '1694753',
        }),
      ],
    },
  ],
  recapitulatif: {
    lots: [
      { lotId: 'lot1', numero: '02', intitule: 'Gros œuvre — Maçonnerie', montantHt: '1694753', partPourcent: '100' },
    ],
    totalTceHt: '1694753',
    ratioEuroParM2: '9.21',
  },
}

async function relire(tampon: Buffer): Promise<ExcelJS.Workbook> {
  const classeur = new ExcelJS.Workbook()
  await classeur.xlsx.load(tampon as unknown as ExcelJS.Buffer)
  return classeur
}

describe('export du DPGF chiffré', () => {
  it('produit un onglet par lot, plus le récapitulatif', async () => {
    const classeur = await relire(await genererDpgfExcel(CHIFFRAGE, { variante: 'avec-prix' }))
    const noms = classeur.worksheets.map((f) => f.name)
    expect(noms).toContain('Récapitulatif')
    expect(noms).toContain('02 Gros œuvre — Maçonnerie')
  })

  it('écrit la quantité et le prix unitaire final, pas le prix de base', async () => {
    const classeur = await relire(await genererDpgfExcel(CHIFFRAGE, { variante: 'avec-prix' }))
    const feuille = classeur.getWorksheet('02 Gros œuvre — Maçonnerie')
    expect(feuille).toBeDefined()

    let trouvee = false
    feuille?.eachRow((ligne) => {
      if (String(ligne.getCell(1).value ?? '') === '02.03.01') {
        trouvee = true
        expect(ligne.getCell(4).value).toBe(47.5)
        expect(ligne.getCell(5).value).toBe(356.79)
      }
    })
    expect(trouvee).toBe(true)
  })

  it('laisse une formule vivante sur le montant, arrondie au centime', async () => {
    const classeur = await relire(await genererDpgfExcel(CHIFFRAGE, { variante: 'avec-prix' }))
    const feuille = classeur.getWorksheet('02 Gros œuvre — Maçonnerie')

    let formule: string | undefined
    feuille?.eachRow((ligne) => {
      if (String(ligne.getCell(1).value ?? '') === '02.03.01') {
        const valeur = ligne.getCell(6).value
        if (valeur && typeof valeur === 'object' && 'formula' in valeur) formule = valeur.formula
      }
    })

    expect(formule).toMatch(/^ROUND\(D\d+\*E\d+,2\)$/)
  })

  it('cache l’onglet de correspondance des identifiants', async () => {
    const classeur = await relire(await genererDpgfExcel(CHIFFRAGE, { variante: 'avec-prix' }))
    const technique = classeur.getWorksheet('_identifiants')
    expect(technique).toBeDefined()
    expect(technique?.state).toBe('veryHidden')

    const identifiants: string[] = []
    technique?.eachRow((ligne) => identifiants.push(String(ligne.getCell(3).value ?? '')))
    expect(identifiants).toContain('p1')
  })
})

describe('export de la version à remplir par l’entreprise', () => {
  it('laisse la colonne de prix vide', async () => {
    const classeur = await relire(await genererDpgfExcel(CHIFFRAGE, { variante: 'a-remplir' }))
    const feuille = classeur.getWorksheet('02 Gros œuvre — Maçonnerie')

    feuille?.eachRow((ligne) => {
      if (String(ligne.getCell(1).value ?? '') === '02.03.01') {
        expect(ligne.getCell(5).value).toBeNull()
        // La quantité reste, elle : c'est le métré de l'économiste.
        expect(ligne.getCell(4).value).toBe(47.5)
      }
    })
  })

  it('protège la feuille et ne déverrouille que les cellules de prix', async () => {
    const classeur = await relire(await genererDpgfExcel(CHIFFRAGE, { variante: 'a-remplir' }))
    const feuille = classeur.getWorksheet('02 Gros œuvre — Maçonnerie')
    expect(feuille?.protect).toBeDefined()

    feuille?.eachRow((ligne) => {
      if (String(ligne.getCell(1).value ?? '') === '02.03.01') {
        expect(ligne.getCell(5).protection?.locked).toBe(false)
        expect(ligne.getCell(4).protection?.locked).not.toBe(false)
      }
    })
  })

  it('garde la formule de montant pour que le total se construise à la saisie', async () => {
    const classeur = await relire(await genererDpgfExcel(CHIFFRAGE, { variante: 'a-remplir' }))
    const feuille = classeur.getWorksheet('02 Gros œuvre — Maçonnerie')

    let formule: string | undefined
    feuille?.eachRow((ligne) => {
      if (String(ligne.getCell(1).value ?? '') === '02.03.01') {
        const valeur = ligne.getCell(6).value
        if (valeur && typeof valeur === 'object' && 'formula' in valeur) formule = valeur.formula
      }
    })
    expect(formule).toMatch(/^ROUND\(/)
  })
})

describe('nom de fichier', () => {
  it('reste lisible et sans caractère gênant', () => {
    expect(nomFichierDpgf(CHIFFRAGE, 'avec-prix')).toBe('2026-014-Residence-Les-Flamboyants-DPGF.xlsx')
    expect(nomFichierDpgf(CHIFFRAGE, 'a-remplir')).toBe(
      '2026-014-Residence-Les-Flamboyants-DPGF-a-remplir.xlsx',
    )
  })
})
