/**
 * Suivi financier de chantier, vérifié sur une vraie base.
 *
 * Ce qui compte ici : qu'un montant de période ne puisse jamais contredire ses
 * cumuls, même après un avenant, une modification ou une suppression au milieu
 * de la chaîne des situations.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import * as Money from '../../domain/money/money'
import { creerMission } from '../missions/service'
import { ajouterPoste, creerLot } from '../chiffrage/structure'
import { enregistrerModifications } from '../chiffrage/service'
import { creerEntreprise } from '../entreprises/service'
import { creerConsultation } from '../consultations/service'
import { enregistrerOffreGlobale } from '../offres/service'
import { annulerAttribution, chargerAttribution, retenirOffre } from '../marche/service'
import { creerAvenant, listerAvenants, modifierAvenant } from '../avenants/service'
import {
  creerSituation,
  listerSituations,
  marcheDuLot,
  modifierSituation,
  supprimerSituation,
  LotSansMarche,
} from '../situations/service'
import { chargerSuivi } from './service'
import * as PU from '../../domain/money/prix-unitaire'

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `suivi-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

const MISSION = {
  nomOperation: 'Médiathèque du Lamentin',
  typeOuvrage: 'TERTIAIRE',
  nature: 'CONSTRUCTION_NEUVE',
  typeMarche: 'PUBLIC',
  surfaceShon: '1500',
  coefficientLocalDefaut: '1.25',
  precisionPu: 2,
  maitreOuvrage: 'Ville du Lamentin',
}

let missionId = ''
let lotId = ''
let offreId = ''

/** Un lot chiffré, consulté, avec une offre à 100 000 € prête à être retenue. */
beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste test' } })
  owner = utilisateur.id

  missionId = await creerMission(db(), { ...MISSION, reference: `S-${SUFFIXE}` })
  lotId = await creerLot(db(), missionId, { numero: '02', intitule: 'Gros œuvre' })
  const posteId = await ajouterPoste(db(), missionId, { lotId, type: 'OUVRAGE' })
  await enregistrerModifications(db(), missionId, [
    {
      id: posteId,
      designation: 'Voile béton',
      unite: 'M3',
      quantite: '100',
      prixUnitaireHtBase: PU.depuisEuros('800').toString(),
    },
  ])

  const entrepriseId = await creerEntreprise(db(), { raisonSociale: 'Antilles Structures' })
  const consultationId = await creerConsultation(db(), missionId, { lotId, entrepriseId })
  offreId = await enregistrerOffreGlobale(db(), missionId, consultationId, {
    montantHt: '100000',
    dateReception: new Date('2026-10-01'),
  })
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

describe('attribution', () => {
  it('refuse une situation tant qu’aucune offre n’est retenue', async () => {
    await expect(
      creerSituation(db(), missionId, lotId, { periode: new Date('2026-11-30'), avancementPourcent: '30' }),
    ).rejects.toThrow(LotSansMarche)
  })

  it('retient une offre et en fait le marché du lot', async () => {
    await retenirOffre(db(), missionId, lotId, offreId)
    const attribution = await chargerAttribution(db(), missionId, lotId)

    expect(attribution.entrepriseNom).toBe('Antilles Structures')
    expect(attribution.montantRetenuHt).toBe('10000000') // 100 000,00 €
    expect(await marcheDuLot(db(), missionId, lotId)).toEqual(Money.depuisEuros('100000'))
  })
})

describe('situations de travaux', () => {
  it('calcule le cumul depuis l’avancement, et la période par différence', async () => {
    await creerSituation(db(), missionId, lotId, {
      periode: new Date('2026-11-30'),
      avancementPourcent: '30',
    })
    await creerSituation(db(), missionId, lotId, {
      periode: new Date('2026-12-31'),
      avancementPourcent: '50',
    })

    const situations = await listerSituations(db(), missionId, lotId)
    expect(situations).toHaveLength(2)
    expect(situations[0]?.montantCumuleHt).toBe('3000000') // 30 000 €
    expect(situations[1]?.montantCumuleHt).toBe('5000000') // 50 000 €
    expect(situations[1]?.montantPeriodeHt).toBe('2000000') // 20 000 € sur la période
  })

  it('déduit retenue, avance et prorata pour donner le net à payer', async () => {
    await creerSituation(db(), missionId, lotId, {
      periode: new Date('2027-01-31'),
      avancementPourcent: '60',
      retenueGarantieHt: '500',
      compteProrataHt: '200',
    })

    const situations = await listerSituations(db(), missionId, lotId)
    const troisieme = situations.find((s) => s.numeroSituation === 3)
    expect(troisieme?.montantPeriodeHt).toBe('1000000') // 10 000 €
    expect(troisieme?.netAPayerHt).toBe('930000') // 10 000 − 500 − 200 = 9 300 €
  })

  it('la somme des périodes retombe exactement sur le cumul final', async () => {
    const situations = await listerSituations(db(), missionId, lotId)
    const sommeDesPeriodes = Money.somme(
      situations.map((s) => Money.depuisCentimes(s.montantPeriodeHt)),
    )
    const dernier = situations[situations.length - 1]
    expect(sommeDesPeriodes).toEqual(Money.depuisCentimes(dernier!.montantCumuleHt))
  })

  it('modifier une situation rechaîne toutes celles qui la suivent', async () => {
    const avant = await listerSituations(db(), missionId, lotId)
    const premiere = avant.find((s) => s.numeroSituation === 1)!

    // La première passe de 30 000 à 40 000 : la deuxième doit rétrécir d'autant.
    await modifierSituation(db(), missionId, premiere.id, {
      periode: new Date('2026-11-30'),
      montantCumuleHt: '40000',
    })

    const apres = await listerSituations(db(), missionId, lotId)
    expect(apres[0]?.montantCumuleHt).toBe('4000000')
    expect(apres[0]?.montantPeriodeHt).toBe('4000000')
    expect(apres[1]?.montantPeriodeHt).toBe('1000000') // 50 000 − 40 000
    // Et la propriété tient toujours.
    const somme = Money.somme(apres.map((s) => Money.depuisCentimes(s.montantPeriodeHt)))
    expect(somme).toEqual(Money.depuisCentimes(apres[apres.length - 1]!.montantCumuleHt))
  })

  it('supprimer une situation du milieu renumérote et rechaîne', async () => {
    const avant = await listerSituations(db(), missionId, lotId)
    const deuxieme = avant.find((s) => s.numeroSituation === 2)!

    await supprimerSituation(db(), missionId, deuxieme.id)

    const apres = await listerSituations(db(), missionId, lotId)
    expect(apres.map((s) => s.numeroSituation)).toEqual([1, 2])
    const somme = Money.somme(apres.map((s) => Money.depuisCentimes(s.montantPeriodeHt)))
    expect(somme).toEqual(Money.depuisCentimes(apres[apres.length - 1]!.montantCumuleHt))
  })
})

describe('avenants', () => {
  it('un avenant proposé ne déplace pas le marché', async () => {
    await creerAvenant(db(), missionId, {
      lotId,
      objet: 'Reprise de fondations',
      montantHt: '10000',
      date: new Date('2027-02-01'),
    })
    expect(await marcheDuLot(db(), missionId, lotId)).toEqual(Money.depuisEuros('100000'))
  })

  it('accepté, il élargit le marché du lot', async () => {
    const avenants = await listerAvenants(db(), missionId)
    await modifierAvenant(db(), missionId, avenants[0]!.id, { statut: 'ACCEPTE' })
    expect(await marcheDuLot(db(), missionId, lotId)).toEqual(Money.depuisEuros('110000'))
  })

  it('une situation déjà validée garde son montant, seul son pourcentage se relit', async () => {
    // Le marché vient de passer de 100 000 à 110 000 : un cumul de 40 000
    // ne vaut plus 40 % mais 36,36 %. Le montant, lui, ne bouge pas.
    const situations = await listerSituations(db(), missionId, lotId)
    expect(situations[0]?.montantCumuleHt).toBe('4000000')
    expect(situations[0]?.avancementPourcent).toBe('40')

    // Le rechaînage a lieu à la prochaine écriture sur le lot.
    await modifierSituation(db(), missionId, situations[0]!.id, { periode: new Date('2026-11-30') })
    const apres = await listerSituations(db(), missionId, lotId)
    expect(apres[0]?.montantCumuleHt).toBe('4000000')
    expect(Number(apres[0]?.avancementPourcent)).toBeCloseTo(36.36, 2)
  })

  it('accepte une moins-value, qui réduit le marché', async () => {
    await creerAvenant(db(), missionId, {
      lotId,
      objet: 'Suppression d’un ouvrage',
      montantHt: '-5000',
      date: new Date('2027-03-01'),
      statut: 'ACCEPTE',
    })
    expect(await marcheDuLot(db(), missionId, lotId)).toEqual(Money.depuisEuros('105000'))
  })
})

describe('tableau de bord financier', () => {
  it('rassemble marché, réalisé, reste et écart vis-à-vis de l’estimatif', async () => {
    const suivi = await chargerSuivi(db(), missionId)

    expect(suivi.marcheInitialHt).toBe('10000000') // 100 000 €
    expect(suivi.avenantsCumulesHt).toBe('500000') // +10 000 − 5 000
    expect(suivi.marcheActuelHt).toBe('10500000') // 105 000 €
    expect(suivi.nbLotsAttribues).toBe(1)
    expect(suivi.nbLots).toBe(1)

    // Estimatif : 100 m³ × 800 € × 1,25 = 100 000 €. L'écart vient des avenants.
    expect(suivi.estimatifHt).toBe('10000000')
    expect(suivi.ecartVsEstimatifHt).toBe('500000')
    expect(suivi.ecartVsEstimatifPourcent).toBe('5.00')
  })

  it('signale la dérive au-delà du seuil de la mission', async () => {
    // Seuil par défaut à 5 % : un écart de 5 % ne le dépasse pas encore.
    const avant = await chargerSuivi(db(), missionId)
    expect(avant.deriveDetectee).toBe(false)

    await creerAvenant(db(), missionId, {
      lotId,
      objet: 'Aléa de sol',
      montantHt: '8000',
      date: new Date('2027-04-01'),
      statut: 'ACCEPTE',
    })

    const apres = await chargerSuivi(db(), missionId)
    expect(apres.ecartVsEstimatifPourcent).toBe('13.00')
    expect(apres.deriveDetectee).toBe(true)
  })

  it('refuse d’annuler une attribution qui porte déjà des situations', async () => {
    await expect(annulerAttribution(db(), missionId, lotId)).rejects.toThrow(/situation/)
  })
})

describe('cloisonnement', () => {
  it('ne laisse pas voir le suivi d’un autre propriétaire', async () => {
    const autre = await brut.user.create({ data: { email: `autre-${EMAIL}` } })
    const clientAutre = clientPour(autre.id)

    await expect(chargerSuivi(clientAutre, missionId)).rejects.toThrow(/introuvable/)

    await brut.user.delete({ where: { id: autre.id } })
  })
})
