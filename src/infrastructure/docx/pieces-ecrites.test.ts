/**
 * Le document Word produit est un conteneur zip. On le relit donc pour vérifier
 * que le texte des ouvrages s'y trouve vraiment, dans l'ordre des lots, et que
 * le sommaire et la pagination sont bien déclarés.
 */
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { genererCctp, genererPieceSimple, nomFichierPiece } from './pieces-ecrites'
import type { ChiffrageDTO, PosteDTO } from '../../application/dto'

function poste(partiel: Partial<PosteDTO> & { id: string; designation: string }): PosteDTO {
  return {
    parentId: null,
    type: 'OUVRAGE',
    ordre: 0,
    profondeur: 0,
    code: null,
    unite: 'M3',
    quantite: '10',
    prixUnitaireHtBase: null,
    coefficientApplique: null,
    prixUnitaireHtFinal: '3567900',
    montantHt: '100000',
    sourcePrix: 'SAISIE_MANUELLE',
    dateSourcePrix: null,
    aTexteCctp: true,
    ...partiel,
  }
}

const CHIFFRAGE: ChiffrageDTO = {
  mission: {
    id: 'm1',
    reference: '2026-014',
    nomOperation: 'Résidence Les Flamboyants',
    maitreOuvrage: 'SIMAR',
    maitreOeuvre: 'Atelier Caraïbe',
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
      montantEstimeHt: '100000',
      postes: [
        poste({ id: 'sl1', type: 'SOUS_LOT', designation: 'FONDATIONS', unite: null }),
        poste({
          id: 'p1',
          parentId: 'sl1',
          profondeur: 1,
          code: '02.03.01',
          designation: 'Béton armé pour voiles',
        }),
        poste({
          id: 'p2',
          parentId: 'sl1',
          profondeur: 1,
          ordre: 1,
          code: '02.03.02',
          designation: 'Coffrage de voiles',
        }),
      ],
    },
    {
      id: 'lot2',
      numero: '13',
      intitule: 'Climatisation',
      ordre: 1,
      corpsEtatId: null,
      coefficientLocal: null,
      montantEstimeHt: '0',
      postes: [poste({ id: 'p3', designation: 'Split mural', unite: 'U' })],
    },
  ],
  recapitulatif: {
    lots: [],
    totalTceHt: '100000',
    ratioEuroParM2: '5.43',
  },
}

async function texteDuDocument(fichier: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(fichier)
  const document = zip.file('word/document.xml')
  expect(document).not.toBeNull()
  return document ? document.async('string') : ''
}

describe('génération du CCTP', () => {
  const textes = new Map([
    ['p1', '## Origine\nBéton conforme à la norme.\n- classe de résistance C25/30'],
    ['p2', 'Coffrage soigné, parement lisse.'],
  ])

  it('reprend l’identité de l’opération en page de garde', async () => {
    const xml = await texteDuDocument(await genererCctp(CHIFFRAGE, textes))
    expect(xml).toContain('Résidence Les Flamboyants')
    expect(xml).toContain('2026-014')
    expect(xml).toContain('SIMAR')
  })

  it('assemble les textes des ouvrages dans l’ordre des lots', async () => {
    const xml = await texteDuDocument(await genererCctp(CHIFFRAGE, textes))
    expect(xml).toContain('Béton conforme à la norme.')
    expect(xml).toContain('classe de résistance C25/30')
    expect(xml).toContain('Coffrage soigné, parement lisse.')

    const positionLot02 = xml.indexOf('LOT 02')
    const positionLot13 = xml.indexOf('LOT 13')
    expect(positionLot02).toBeGreaterThan(-1)
    expect(positionLot13).toBeGreaterThan(positionLot02)
  })

  it('rend visible un ouvrage laissé sans texte', async () => {
    const xml = await texteDuDocument(await genererCctp(CHIFFRAGE, textes))
    // p3 n'a pas de texte : la mention doit apparaître, pas un blanc.
    expect(xml).toContain('Texte de CCTP à rédiger')
  })

  it('déclare un sommaire et demande le recalcul des champs', async () => {
    const fichier = await genererCctp(CHIFFRAGE, textes)
    const xml = await texteDuDocument(fichier)
    expect(xml).toContain('TOC')

    const zip = await JSZip.loadAsync(fichier)
    const parametres = await zip.file('word/settings.xml')?.async('string')
    expect(parametres).toContain('updateFields')
  })

  it('numérote les pages en pied de page', async () => {
    const zip = await JSZip.loadAsync(await genererCctp(CHIFFRAGE, textes))
    const pieds = Object.keys(zip.files).filter((nom) => /word\/footer\d*\.xml/.test(nom))
    expect(pieds.length).toBeGreaterThan(0)
    const contenu = await zip.file(pieds[0] as string)?.async('string')
    expect(contenu).toContain('PAGE')
  })

  it('inclut le préambule quand il est fourni', async () => {
    const xml = await texteDuDocument(
      await genererCctp(CHIFFRAGE, textes, '## Généralités\nPrescriptions communes à tous les lots.'),
    )
    expect(xml).toContain('Prescriptions communes à tous les lots.')
  })
})

describe('génération du CCAP', () => {
  it('met en forme la trame fournie', async () => {
    const xml = await texteDuDocument(
      await genererPieceSimple(
        CHIFFRAGE,
        'CCAP',
        '## Objet du marché\nLe présent marché a pour objet Résidence Les Flamboyants.',
      ),
    )
    expect(xml).toContain('Objet du marché')
    expect(xml).toContain('Le présent marché a pour objet')
    expect(xml).toContain('Cahier des clauses administratives particulières')
  })
})

describe('nom de fichier', () => {
  it('reste lisible et sans accent', () => {
    expect(nomFichierPiece(CHIFFRAGE, 'CCTP', 'docx')).toBe(
      '2026-014-Residence-Les-Flamboyants-CCTP.docx',
    )
    expect(nomFichierPiece(CHIFFRAGE, 'CCAP', 'pdf')).toBe(
      '2026-014-Residence-Les-Flamboyants-CCAP.pdf',
    )
  })
})
