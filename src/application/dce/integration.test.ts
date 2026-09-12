/**
 * Tests d'intégration des pièces écrites. Ils ont besoin de PostgreSQL, et le
 * dernier a besoin de LibreOffice pour la conversion PDF.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import { creerMission } from '../missions/service'
import { ajouterPoste, creerLot } from '../chiffrage/structure'
import { enregistrerModifications } from '../chiffrage/service'
import { creerTrame } from '../trames/service'
import {
  appliquerTrame,
  chargerTextes,
  enregistrerTexte,
  preparerPiece,
  variablesMission,
  verifierMission,
} from './service'
import { genererCctp, genererPieceSimple } from '../../infrastructure/docx/pieces-ecrites'
import { conversionDisponible, convertirEnPdf } from '../../infrastructure/docx/pdf'
import { chargerChiffrage } from '../chiffrage/service'
import * as PU from '../../domain/money/prix-unitaire'

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `dce-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

const MISSION = {
  nomOperation: 'Groupe scolaire des Alizés',
  typeOuvrage: 'SCOLAIRE',
  nature: 'CONSTRUCTION_NEUVE',
  typeMarche: 'PUBLIC',
  surfaceShon: '2400',
  coefficientLocalDefaut: '1.25',
  precisionPu: 2,
  maitreOuvrage: 'Commune du Lamentin',
}

async function missionAvecUnOuvrage(reference: string): Promise<{ missionId: string; posteId: string }> {
  const client = db()
  const missionId = await creerMission(client, { ...MISSION, reference })
  const lotId = await creerLot(client, missionId, { numero: '02', intitule: 'Gros œuvre' })
  const posteId = await ajouterPoste(client, missionId, { lotId, type: 'OUVRAGE' })
  await enregistrerModifications(client, missionId, [
    {
      id: posteId,
      designation: 'Béton armé pour voiles',
      code: '02.03.01',
      unite: 'M3',
      quantite: '47.5',
      prixUnitaireHtBase: PU.depuisEuros('285.43').toString(),
    },
  ])
  return { missionId, posteId }
}

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL } })
  owner = utilisateur.id
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

describe('textes de CCTP', () => {
  it('enregistre le texte et mémorise la désignation du moment', async () => {
    const { missionId, posteId } = await missionAvecUnOuvrage(`T-${SUFFIXE}`)
    await enregistrerTexte(db(), missionId, posteId, 'Béton conforme à la norme en vigueur.')

    const textes = await chargerTextes(db(), missionId)
    expect(textes.get(posteId)?.contenu).toBe('Béton conforme à la norme en vigueur.')
    expect(textes.get(posteId)?.designationSource).toBe('Béton armé pour voiles')
  })

  it('efface le texte quand on vide la zone de saisie', async () => {
    const { missionId, posteId } = await missionAvecUnOuvrage(`T2-${SUFFIXE}`)
    await enregistrerTexte(db(), missionId, posteId, 'Un texte.')
    await enregistrerTexte(db(), missionId, posteId, '   ')

    expect((await chargerTextes(db(), missionId)).get(posteId)).toBeUndefined()
  })

  it('refuse d’écrire sur un poste d’une autre mission', async () => {
    const premier = await missionAvecUnOuvrage(`T3-${SUFFIXE}`)
    const second = await missionAvecUnOuvrage(`T4-${SUFFIXE}`)
    await expect(
      enregistrerTexte(db(), second.missionId, premier.posteId, 'Intrus'),
    ).rejects.toThrow(/hors de la mission/)
  })

  it('recopie une trame comme point de départ', async () => {
    const { missionId, posteId } = await missionAvecUnOuvrage(`T5-${SUFFIXE}`)
    const trameId = await creerTrame(db(), {
      type: 'CCTP',
      intitule: 'Béton armé — prescriptions',
      contenu: '## Origine\nBéton prêt à l’emploi certifié NF.',
    })

    await appliquerTrame(db(), missionId, posteId, trameId)
    const textes = await chargerTextes(db(), missionId)
    expect(textes.get(posteId)?.contenu).toContain('Béton prêt à l’emploi certifié NF.')
  })
})

describe('contrôle de cohérence sur une mission réelle', () => {
  it('bloque tant qu’un ouvrage n’a pas son texte, puis laisse passer', async () => {
    const { missionId, posteId } = await missionAvecUnOuvrage(`C-${SUFFIXE}`)

    const avant = await verifierMission(db(), missionId)
    expect(avant.exportPossible).toBe(false)
    expect(avant.anomalies.some((a) => a.code === 'ouvrage_sans_texte')).toBe(true)

    await enregistrerTexte(db(), missionId, posteId, 'Volume de béton en m3 en place.')

    const apres = await verifierMission(db(), missionId)
    expect(apres.exportPossible).toBe(true)
    expect(apres.anomalies).toHaveLength(0)
  })

  it('signale la désignation modifiée après l’écriture du texte', async () => {
    const { missionId, posteId } = await missionAvecUnOuvrage(`C2-${SUFFIXE}`)
    await enregistrerTexte(db(), missionId, posteId, 'Volume en m3.')
    await enregistrerModifications(db(), missionId, [
      { id: posteId, designation: 'Béton banché pour voiles' },
    ])

    const synthese = await verifierMission(db(), missionId)
    const divergence = synthese.anomalies.find((a) => a.code === 'designation_divergente')
    expect(divergence?.message).toContain('Béton armé pour voiles')
    expect(synthese.exportPossible).toBe(true)
  })
})

describe('variables de mission', () => {
  it('reprend les données réelles de l’opération', async () => {
    const { missionId } = await missionAvecUnOuvrage(`V-${SUFFIXE}`)
    const chiffrage = await chargerChiffrage(db(), missionId)
    const variables = variablesMission(chiffrage)

    expect(variables.nom_operation).toBe('Groupe scolaire des Alizés')
    expect(variables.maitre_ouvrage).toBe('Commune du Lamentin')
    expect(variables.type_marche).toBe('public')
    // La surface est rendue telle qu'elle est stockée, sans décimales inutiles.
    expect(variables.surface_shon).toBe('2400 m²')
    // 47,5 x 285,43 x 1,25 = 16 947,53
    expect(variables.montant_travaux_ht).toContain('16')
    expect(variables.maitre_oeuvre).toBeNull()
  })
})

describe('assemblage des pièces', () => {
  it('refuse un CCAP tant qu’aucune trame n’existe', async () => {
    const { missionId } = await missionAvecUnOuvrage(`P-${SUFFIXE}`)
    await expect(preparerPiece(db(), missionId, 'CCAP')).rejects.toThrow(/Aucune trame/)
  })

  it('résout les variables de la trame de CCAP', async () => {
    const { missionId } = await missionAvecUnOuvrage(`P2-${SUFFIXE}`)
    await creerTrame(db(), {
      type: 'CCAP',
      intitule: 'CCAP type marché public',
      contenu:
        '## Objet\nLe présent marché porte sur {{nom_operation}}, pour le compte de {{maitre_ouvrage}}.\nMontant : {{montant_travaux_ht}}. Contact : {{maitre_oeuvre}}.',
    })

    const preparation = await preparerPiece(db(), missionId, 'CCAP')
    expect(preparation.contenu).toContain('Groupe scolaire des Alizés')
    expect(preparation.contenu).toContain('Commune du Lamentin')
    // Le maître d'œuvre n'est pas renseigné : la marque reste visible.
    expect(preparation.contenu).toContain('{{maitre_oeuvre}}')
    expect(preparation.variablesManquantes).toContain('maitre_oeuvre')
  })

  it('rassemble les textes du CCTP', async () => {
    const { missionId, posteId } = await missionAvecUnOuvrage(`P3-${SUFFIXE}`)
    await enregistrerTexte(db(), missionId, posteId, 'Volume en m3 en place.')

    const preparation = await preparerPiece(db(), missionId, 'CCTP')
    expect(preparation.textes.get(posteId)).toBe('Volume en m3 en place.')

    const docx = await genererCctp(preparation.chiffrage, preparation.textes, preparation.contenu)
    expect(docx.length).toBeGreaterThan(5000)
    // Signature d'une archive zip, donc d'un vrai fichier Word.
    expect(docx.subarray(0, 2).toString()).toBe('PK')
  })
})

describe('conversion PDF', () => {
  it('produit un PDF depuis le document Word', async () => {
    if (!(await conversionDisponible())) {
      throw new Error('LibreOffice absent : la conversion PDF ne peut pas être vérifiée ici.')
    }

    const { missionId, posteId } = await missionAvecUnOuvrage(`PDF-${SUFFIXE}`)
    await enregistrerTexte(db(), missionId, posteId, 'Volume en m3 en place, coulé en une passe.')

    const preparation = await preparerPiece(db(), missionId, 'CCTP')
    const docx = await genererCctp(preparation.chiffrage, preparation.textes, preparation.contenu)
    const pdf = await convertirEnPdf(docx, 'essai-cctp')

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(2000)
  }, 180_000)

  it('produit aussi le CCAP en PDF', async () => {
    if (!(await conversionDisponible())) return

    const { missionId } = await missionAvecUnOuvrage(`PDF2-${SUFFIXE}`)
    await creerTrame(db(), {
      type: 'CCAP',
      intitule: 'CCAP essai',
      contenu: '## Objet\nMarché relatif à {{nom_operation}}.',
    })

    const preparation = await preparerPiece(db(), missionId, 'CCAP')
    const docx = await genererPieceSimple(preparation.chiffrage, 'CCAP', preparation.contenu ?? '')
    const pdf = await convertirEnPdf(docx, 'essai-ccap')

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 180_000)
})
