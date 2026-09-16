/**
 * Génération du CCTP depuis le DPGF, vérifiée sur une vraie base.
 *
 * Ce qui compte ici : que la trame appliquée soit bien celle qui a été cochée,
 * qu'un texte déjà écrit ne soit jamais écrasé, et qu'un ouvrage sans trame
 * ressorte comme étant à rédiger plutôt que de recevoir un texte approximatif.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import { creerMission } from '../missions/service'
import { ajouterPoste, creerLot } from '../chiffrage/structure'
import { enregistrerModifications } from '../chiffrage/service'
import { chargerTextes, enregistrerTexte } from './service'
import { creerTrame } from '../trames/service'
import { appliquerGeneration, proposerGeneration } from './generation'

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `generation-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

let missionId = ''
let lotId = ''
let corpsEtatId: string | null = null
let posteVoile = ''
let posteDalle = ''
let posteInedit = ''
let posteDejaRedige = ''

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste' } })
  owner = utilisateur.id

  const corps = await brut.corpsEtat.create({
    data: { ownerId: owner, code: '02', libelle: 'Gros œuvre', ordre: 2 },
  })
  corpsEtatId = corps.id

  missionId = await creerMission(db(), {
    nomOperation: 'Médiathèque',
    typeOuvrage: 'TERTIAIRE',
    nature: 'CONSTRUCTION_NEUVE',
    typeMarche: 'PUBLIC',
    surfaceShon: '900',
    coefficientLocalDefaut: '1.25',
    precisionPu: 2,
    reference: `G-${SUFFIXE}`,
  })

  lotId = await creerLot(db(), missionId, {
    numero: '02',
    intitule: 'Gros œuvre',
    corpsEtatId: corps.id,
  })

  posteVoile = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
  posteDalle = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
  posteInedit = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
  posteDejaRedige = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })

  await enregistrerModifications(db(), missionId, [
    { id: posteVoile, designation: 'Voile béton banché ép. 20 cm' },
    { id: posteDalle, designation: 'Dalle portée béton armé' },
    { id: posteInedit, designation: 'Signalisation horizontale de parking' },
    { id: posteDejaRedige, designation: 'Voile béton armé' },
  ])

  await enregistrerTexte(db(), missionId, posteDejaRedige, 'Texte que j’ai déjà écrit moi-même.')

  await creerTrame(db(), {
    type: 'CCTP',
    intitule: 'Voile béton armé',
    corpsEtatId: corps.id,
    contenu: 'Voiles coulés en place, béton dosé à 350 kg/m³.',
  })
  await creerTrame(db(), {
    type: 'CCTP',
    intitule: 'Dalle portée béton armé',
    corpsEtatId: corps.id,
    contenu: 'Dalle portée, épaisseur 20 cm, armatures suivant plans BET.',
  })
  // Trame d'un autre corps d'état : elle ne doit jamais être proposée ici.
  await creerTrame(db(), {
    type: 'CCTP',
    intitule: 'Peinture glycéro',
    corpsEtatId: null,
    contenu: '',
  })
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

const pour = (proposition: Awaited<ReturnType<typeof proposerGeneration>>, posteId: string) =>
  proposition.lots[0]?.appariements.find((a) => a.posteId === posteId)

describe('proposition de génération', () => {
  it('propose une trame pour chaque ouvrage qui en a une', async () => {
    const proposition = await proposerGeneration(db(), missionId)
    expect(pour(proposition, posteVoile)?.intituleTrame).toBe('Voile béton armé')
    expect(pour(proposition, posteDalle)?.intituleTrame).toBe('Dalle portée béton armé')
  })

  it('laisse à rédiger l’ouvrage dont aucune trame ne s’approche', async () => {
    // Le point le plus important : l'application n'invente pas de prescription.
    const proposition = await proposerGeneration(db(), missionId)
    expect(pour(proposition, posteInedit)?.trameId).toBe(null)
    expect(pour(proposition, posteInedit)?.motif).toBe('aucune_correspondance')
  })

  it('ne touche pas à un ouvrage déjà rédigé', async () => {
    const proposition = await proposerGeneration(db(), missionId)
    expect(pour(proposition, posteDejaRedige)?.motif).toBe('texte_deja_present')
  })

  it('écarte les trames sans texte exploitable', async () => {
    const proposition = await proposerGeneration(db(), missionId)
    const intitules = proposition.lots[0]?.appariements.map((a) => a.intituleTrame) ?? []
    expect(intitules).not.toContain('Peinture glycéro')
    expect(proposition.lots[0]?.nbTramesDisponibles).toBe(2)
  })

  it('rend une synthèse qui compte chaque cas une fois', async () => {
    const proposition = await proposerGeneration(db(), missionId)
    expect(proposition.synthese.nbPostes).toBe(4)
    expect(proposition.synthese.nbSansTrame).toBe(1)
    expect(proposition.synthese.nbDejaRediges).toBe(1)
    expect(proposition.synthese.nbSurs + proposition.synthese.nbIncertains).toBe(2)
  })

  it('n’écrit rien : proposer n’est pas appliquer', async () => {
    await proposerGeneration(db(), missionId)
    const textes = await chargerTextes(db(), missionId)
    expect(textes.has(posteVoile)).toBe(false)
  })
})

describe('application des trames retenues', () => {
  it('écrit le texte de la trame cochée, et lui seul', async () => {
    const proposition = await proposerGeneration(db(), missionId)
    const choix = pour(proposition, posteVoile)
    const resultat = await appliquerGeneration(db(), missionId, [
      { posteId: posteVoile, trameId: choix?.trameId ?? '' },
    ])

    expect(resultat.nbAppliquees).toBe(1)
    expect(resultat.echecs).toEqual([])

    const textes = await chargerTextes(db(), missionId)
    expect(textes.get(posteVoile)?.contenu).toBe('Voiles coulés en place, béton dosé à 350 kg/m³.')
    // Celui qu'on n'a pas coché reste vide.
    expect(textes.has(posteDalle)).toBe(false)
  })

  it('mémorise la désignation du moment, pour signaler un écart plus tard', async () => {
    const textes = await chargerTextes(db(), missionId)
    expect(textes.get(posteVoile)?.designationSource).toBe('Voile béton banché ép. 20 cm')
  })

  it('ne propose plus un ouvrage qu’on vient de rédiger', async () => {
    const proposition = await proposerGeneration(db(), missionId)
    expect(pour(proposition, posteVoile)?.motif).toBe('texte_deja_present')
  })

  it('ne s’arrête pas à la première erreur et la remonte', async () => {
    const resultat = await appliquerGeneration(db(), missionId, [
      { posteId: posteDalle, trameId: 'trame-inexistante' },
      { posteId: posteDalle, trameId: (await premiereTrame()) ?? '' },
    ])
    expect(resultat.nbAppliquees).toBe(1)
    expect(resultat.echecs).toHaveLength(1)
  })

  it('n’applique rien sur une sélection vide', async () => {
    const resultat = await appliquerGeneration(db(), missionId, [])
    expect(resultat).toEqual({ nbAppliquees: 0, echecs: [] })
  })
})

async function premiereTrame(): Promise<string | null> {
  const trame = await brut.trame.findFirst({
    where: { ownerId: owner, intitule: 'Dalle portée béton armé' },
    select: { id: true },
  })
  return trame?.id ?? null
}
