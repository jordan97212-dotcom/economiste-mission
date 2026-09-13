/**
 * Journal d'audit et export complet, vérifiés sur une vraie base.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import JSZip from 'jszip'
import { clientPour } from '../../infrastructure/prisma'
import { creerMission, modifierMission, supprimerMission } from '../missions/service'
import { ajouterPoste, creerLot, supprimerLot, supprimerPoste } from '../chiffrage/structure'
import { enregistrerModifications } from '../chiffrage/service'
import { importerDpgf } from '../import/dpgf'
import { enregistrerTexte } from '../dce/service'
import { creerPrix } from '../prix/service'
import { creerTrame } from '../trames/service'
import { listerJournal } from '../audit/service'
import { construireArchive } from './archive'
import * as PU from '../../domain/money/prix-unitaire'

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `audit-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

const MISSION = {
  nomOperation: 'Réhabilitation du marché couvert',
  typeOuvrage: 'TERTIAIRE',
  nature: 'REHABILITATION',
  typeMarche: 'PUBLIC',
  surfaceShon: '900',
  coefficientLocalDefaut: '1.25',
  precisionPu: 2,
  maitreOuvrage: 'Ville de Fort-de-France',
}

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste test' } })
  owner = utilisateur.id
  // La nomenclature est nécessaire pour rattacher un prix à un corps d'état.
  await brut.corpsEtat.create({
    data: { ownerId: owner, code: '02', libelle: 'Gros œuvre — Maçonnerie', ordre: 0 },
  })
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

describe('journal d’audit', () => {
  it('enregistre la création d’une mission', async () => {
    const missionId = await creerMission(db(), { ...MISSION, reference: `J-${SUFFIXE}` })
    const journal = await listerJournal(db(), { entite: 'Mission' })
    const entree = journal.find((e) => e.entiteId === missionId)

    expect(entree?.action).toBe('CREATION')
    expect((entree?.apres as Record<string, unknown>).reference).toBe(`J-${SUFFIXE}`)
  })

  it('enregistre les champs modifiés d’une mission, et eux seuls', async () => {
    const missionId = await creerMission(db(), { ...MISSION, reference: `J2-${SUFFIXE}` })
    await modifierMission(db(), missionId, {
      ...MISSION,
      reference: `J2-${SUFFIXE}`,
      coefficientLocalDefaut: '1.35',
    })

    const journal = await listerJournal(db(), { entite: 'Mission' })
    const modification = journal.find(
      (e) => e.entiteId === missionId && e.action === 'MODIFICATION',
    )
    const apres = modification?.apres as Record<string, unknown>

    expect(apres.coefficientLocalDefaut).toBe('1.35')
    expect(Object.keys(apres)).toEqual(['coefficientLocalDefaut'])
  })

  it('enregistre une modification de ligne de DPGF', async () => {
    const missionId = await creerMission(db(), { ...MISSION, reference: `J3-${SUFFIXE}` })
    const lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
    const posteId = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })

    await enregistrerModifications(db(), missionId, [
      {
        id: posteId,
        designation: 'Béton armé',
        quantite: '10',
        prixUnitaireHtBase: PU.depuisEuros('285.43').toString(),
      },
    ])

    const journal = await listerJournal(db(), { entite: 'Poste' })
    const entree = journal.find((e) => e.entiteId === posteId)
    const apres = entree?.apres as Record<string, unknown>

    expect(entree?.action).toBe('MODIFICATION')
    expect(apres.designation).toBe('Béton armé')
    expect(apres.prixUnitaireHtBase).toBe('2854300')
    // Les valeurs recalculées ne doivent pas polluer le journal.
    expect(apres.prixUnitaireHtFinal).toBeUndefined()
    expect(apres.montantHt).toBeUndefined()
  })

  it('ne journalise rien quand une écriture ne change rien', async () => {
    const missionId = await creerMission(db(), { ...MISSION, reference: `J4-${SUFFIXE}` })
    const lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
    const posteId = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })

    await enregistrerModifications(db(), missionId, [{ id: posteId, designation: 'Poste' }])
    const avant = (await listerJournal(db(), { entite: 'Poste' })).length

    await enregistrerModifications(db(), missionId, [{ id: posteId, designation: 'Poste' }])
    const apres = (await listerJournal(db(), { entite: 'Poste' })).length

    expect(apres).toBe(avant)
  })

  it('laisse une entrée de synthèse pour un import, pas une par ligne', async () => {
    const missionId = await creerMission(db(), { ...MISSION, reference: `J5-${SUFFIXE}` })
    const lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })

    await importerDpgf(
      db(),
      missionId,
      lotId,
      Array.from({ length: 30 }, (_, i) => [`Poste ${i + 1}`, 'u', '1', '10']),
      { designation: 0, unite: 1, quantite: 2, prixUnitaireHt: 3 },
    )

    const imports = await listerJournal(db(), { entite: 'Import' })
    const entree = imports.find((e) => e.entiteId === lotId)
    expect((entree?.apres as Record<string, unknown>).ouvragesImportes).toBe(30)

    // Les trente lignes ne doivent pas produire trente entrées de poste.
    const postes = await listerJournal(db(), { entite: 'Poste', limite: 1000 })
    expect(postes.filter((e) => e.survenuLe >= (entree?.survenuLe ?? new Date()))).toHaveLength(0)
  })

  it('garde trace d’une suppression et de ce qu’elle emporte', async () => {
    const missionId = await creerMission(db(), { ...MISSION, reference: `J6-${SUFFIXE}` })
    const lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
    const posteId = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
    await enregistrerModifications(db(), missionId, [
      {
        id: posteId,
        designation: 'Poste supprimé',
        quantite: '10',
        prixUnitaireHtBase: PU.depuisEuros('100').toString(),
      },
    ])

    await supprimerPoste(db(), missionId, posteId)
    const postes = await listerJournal(db(), { entite: 'Poste' })
    const suppression = postes.find((e) => e.entiteId === posteId && e.action === 'SUPPRESSION')
    // 10 x 100 x 1,25 = 1 250,00
    expect((suppression?.avant as Record<string, unknown>).montantSupprimeHt).toBe('125000')

    await supprimerLot(db(), missionId, lotId)
    const lots = await listerJournal(db(), { entite: 'Lot' })
    expect(lots.some((e) => e.entiteId === lotId && e.action === 'SUPPRESSION')).toBe(true)

    await supprimerMission(db(), missionId)
    const missions = await listerJournal(db(), { entite: 'Mission' })
    expect(missions.some((e) => e.entiteId === missionId && e.action === 'SUPPRESSION')).toBe(true)
  })

  it('trace l’écriture d’un texte de CCTP sans recopier son contenu', async () => {
    const missionId = await creerMission(db(), { ...MISSION, reference: `J7-${SUFFIXE}` })
    const lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
    const posteId = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
    await enregistrerModifications(db(), missionId, [{ id: posteId, designation: 'Béton' }])

    await enregistrerTexte(db(), missionId, posteId, 'Un texte descriptif de quarante signes.')

    const textes = await listerJournal(db(), { entite: 'TexteCctp' })
    const entree = textes.find((e) => e.entiteId === posteId)
    const apres = entree?.apres as Record<string, unknown>

    expect(apres.designation).toBe('Béton')
    expect(apres.longueur).toBe(39)
    expect(JSON.stringify(apres)).not.toContain('descriptif')
  })
})

describe('archive complète', () => {
  it('contient les missions, la base de prix, les trames et le mode d’emploi', async () => {
    const missionId = await creerMission(db(), { ...MISSION, reference: `A-${SUFFIXE}` })
    const lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
    const posteId = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
    await enregistrerModifications(db(), missionId, [
      {
        id: posteId,
        designation: 'Béton armé pour voiles',
        code: '02.03.01',
        unite: 'M3',
        quantite: '47.5',
        prixUnitaireHtBase: PU.depuisEuros('285.43').toString(),
      },
    ])
    await enregistrerTexte(db(), missionId, posteId, 'Béton conforme à la norme.')
    await creerPrix(db(), {
      designation: 'Prix archivé',
      unite: 'm3',
      prixUnitaireHt: '123,45',
    })
    await creerTrame(db(), {
      type: 'CCAP',
      intitule: 'CCAP archivé',
      contenu: '## Objet\nMarché relatif à {{nom_operation}}.',
    })

    const archive = await construireArchive(db(), { email: EMAIL, nom: 'Économiste test' })
    const zip = await JSZip.loadAsync(archive.fichier)
    const chemins = Object.keys(zip.files)

    expect(chemins.some((c) => c.endsWith('LISEZ-MOI.txt'))).toBe(true)
    expect(chemins.some((c) => c.includes('base-prix/base-prix.xlsx'))).toBe(true)
    expect(chemins.some((c) => c.includes('base-prix/base-prix.json'))).toBe(true)
    expect(chemins.some((c) => c.includes('trames/') && c.endsWith('.txt'))).toBe(true)
    expect(chemins.some((c) => c.endsWith('journal-audit.json'))).toBe(true)

    const dossierMission = chemins.find((c) => c.includes(`A-${SUFFIXE}`) && c.endsWith('dpgf.xlsx'))
    expect(dossierMission).toBeDefined()

    const cheminJson = chemins.find((c) => c.includes(`A-${SUFFIXE}`) && c.endsWith('mission.json'))
    const contenu = JSON.parse((await zip.file(cheminJson as string)?.async('string')) ?? '{}')
    expect(contenu.mission.reference).toBe(`A-${SUFFIXE}`)
    // 47,5 x 285,43 x 1,25 = 16 947,53
    expect(contenu.recapitulatif.totalTceHt).toBe('1694753')

    // Bien chercher dans le dossier de CETTE mission : d'autres missions du
    // même test portent aussi des textes.
    const cheminTexte = chemins.find(
      (c) => c.includes(`A-${SUFFIXE}`) && c.includes('/cctp/') && c.endsWith('.txt'),
    )
    expect(await zip.file(cheminTexte as string)?.async('string')).toBe('Béton conforme à la norme.')

    const lisezMoi = await zip.file('LISEZ-MOI.txt')?.async('string')
    expect(lisezMoi).toContain('Économiste test')
    expect(lisezMoi).toContain('centimes entiers')

    expect(archive.resume.nbPrix).toBeGreaterThan(0)
    expect(archive.nom).toMatch(/^export-donnees-\d{4}-\d{2}-\d{2}\.zip$/)
  }, 60_000)

  it('ne contient jamais les données d’un autre propriétaire', async () => {
    const autre = await brut.user.create({ data: { email: `autre-${SUFFIXE}@local` } })
    try {
      await creerMission(clientPour(autre.id), {
        ...MISSION,
        reference: `AUTRE-${SUFFIXE}`,
        nomOperation: 'Opération confidentielle',
      })

      const archive = await construireArchive(db(), { email: EMAIL, nom: null })
      const zip = await JSZip.loadAsync(archive.fichier)
      const chemins = Object.keys(zip.files).join(' ')

      expect(chemins).not.toContain('Operation-confidentielle')
      expect(chemins).not.toContain(`AUTRE-${SUFFIXE}`)
    } finally {
      await brut.user.delete({ where: { id: autre.id } })
    }
  }, 60_000)
})
