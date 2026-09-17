/**
 * Import du répertoire, vérifié sur une vraie base.
 *
 * Ce qui compte : qu'une entreprise déjà saisie à la main ne soit jamais
 * écrasée par un fichier venu d'ailleurs, et qu'un même fichier passé deux
 * fois ne double pas le répertoire.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../../infrastructure/prisma'
import { lireCsv } from '../../domain/csv/lecture'
import { analyserLignes, devinerMappage } from '../../domain/entreprises/import'
import { creerEntreprise, listerEntreprises } from './service'
import { importerEntreprises, type SurExistante } from './import'

const brut = new PrismaClient()
const SUFFIXE = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const EMAIL = `import-ent-${SUFFIXE}@local`

let owner = ''
const db = () => clientPour(owner)

const octets = (texte: string): Uint8Array => new TextEncoder().encode(texte)

/** Le chemin complet : des octets du fichier jusqu'aux entreprises écrites. */
async function importer(csv: string, surExistante: SurExistante = 'ignorer') {
  const lecture = lireCsv(octets(csv))
  const mappage = devinerMappage(lecture.grille[0] ?? [])
  const analyse = analyserLignes(lecture.grille.slice(1), mappage, 2)
  return {
    analyse,
    resultat: await importerEntreprises(db(), analyse.entreprises, surExistante),
  }
}

beforeAll(async () => {
  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste' } })
  owner = utilisateur.id
})

afterAll(async () => {
  await brut.user.deleteMany({ where: { email: EMAIL } })
  await brut.$disconnect()
})

describe('import d’un fichier ordinaire', () => {
  it('crée les entreprises avec leurs champs', async () => {
    const { resultat } = await importer(
      [
        'Raison sociale;SIRET;Contact;E-mail;Téléphone;Corps d’état;Zone',
        'Maçonnerie Créole;73282932000074;Jean Dupont;contact@mc.fr;0596 12 34 56;Gros œuvre, VRD;Nord',
        'Antilles Électricité;;Marie Léger;contact@ae.mq;0696 78 90 12;Électricité;Centre',
      ].join('\n'),
    )

    expect(resultat.creees).toBe(2)
    const repertoire = await listerEntreprises(db())
    const maconnerie = repertoire.find((e) => e.raisonSociale === 'Maçonnerie Créole')
    expect(maconnerie?.siret).toBe('73282932000074')
    expect(maconnerie?.email).toBe('contact@mc.fr')
    expect(maconnerie?.corpsEtatQualifies).toEqual(['Gros œuvre', 'VRD'])
    expect(maconnerie?.zoneIntervention).toBe('Nord')
  })

  it('ne double pas le répertoire quand on repasse le même fichier', async () => {
    const csv = [
      'Raison sociale;SIRET',
      'Maçonnerie Créole;73282932000074',
      'Antilles Électricité;',
    ].join('\n')
    const { resultat } = await importer(csv)

    expect(resultat.creees).toBe(0)
    expect(resultat.ignorees).toHaveLength(2)
    expect(resultat.ignorees[0]?.motif).toContain('déjà au répertoire')
    expect(await listerEntreprises(db())).toHaveLength(2)
  })
})

describe('entreprise déjà présente', () => {
  it('n’écrase pas ce que l’économiste a saisi', async () => {
    await creerEntreprise(db(), {
      raisonSociale: 'Charpente des Îles',
      contactNom: 'Contact vérifié à la main',
      email: 'bon@charpente.mq',
    })

    const { resultat } = await importer(
      [
        'Raison sociale;Contact;E-mail;Zone',
        'CHARPENTE DES ILES;Contact du fichier;mauvais@ailleurs.fr;Sud',
      ].join('\n'),
      'completer',
    )

    expect(resultat.completees).toBe(1)
    const charpente = (await listerEntreprises(db())).find(
      (e) => e.raisonSociale === 'Charpente des Îles',
    )
    // Ce qui était renseigné reste ; seul le vide se remplit.
    expect(charpente?.contactNom).toBe('Contact vérifié à la main')
    expect(charpente?.email).toBe('bon@charpente.mq')
    expect(charpente?.zoneIntervention).toBe('Sud')
  })

  it('ajoute les corps d’état sans retirer les anciens', async () => {
    await creerEntreprise(db(), {
      raisonSociale: 'Plomberie Caraïbe',
      corpsEtatQualifies: ['Plomberie'],
    })

    await importer(
      ['Raison sociale;Corps d’état', 'Plomberie Caraïbe;Chauffage, plomberie'].join('\n'),
      'completer',
    )

    const plomberie = (await listerEntreprises(db())).find(
      (e) => e.raisonSociale === 'Plomberie Caraïbe',
    )
    // « plomberie » est déjà là malgré la casse ; « Chauffage » s'ajoute.
    expect(plomberie?.corpsEtatQualifies).toEqual(['Plomberie', 'Chauffage'])
  })

  it('ne touche à rien en mode « ne pas y toucher »', async () => {
    const { resultat } = await importer(
      ['Raison sociale;Zone', 'Plomberie Caraïbe;Grand Sud'].join('\n'),
      'ignorer',
    )
    expect(resultat.completees).toBe(0)
    const plomberie = (await listerEntreprises(db())).find(
      (e) => e.raisonSociale === 'Plomberie Caraïbe',
    )
    expect(plomberie?.zoneIntervention).toBeNull()
  })

  it('reconnaît une entreprise au SIRET même sous un autre nom', async () => {
    const { resultat } = await importer(
      ['Raison sociale;SIRET', 'MACONNERIE CREOLE SARL;732 829 320 00074'].join('\n'),
    )
    expect(resultat.creees).toBe(0)
    expect(resultat.ignorees[0]?.motif).toContain('Maçonnerie Créole')
  })
})

describe('ce que le fichier ne dit pas correctement', () => {
  it('reprend les lignes valides et écarte celles sans nom', async () => {
    const { analyse, resultat } = await importer(
      ['Raison sociale;SIRET', ';99999999999999', 'Terrassement Sud;'].join('\n'),
    )
    expect(analyse.lignesRejetees).toBe(1)
    expect(resultat.creees).toBe(1)
  })

  it('importe malgré un SIRET douteux, en l’ayant signalé', async () => {
    const { analyse, resultat } = await importer(
      ['Raison sociale;SIRET', 'Peinture Atlantique;12345678901234'].join('\n'),
    )
    expect(analyse.anomalies.map((a) => a.code)).toContain('siret_cle')
    expect(resultat.creees).toBe(1)
    const peinture = (await listerEntreprises(db())).find(
      (e) => e.raisonSociale === 'Peinture Atlantique',
    )
    // La valeur du fichier est conservée telle quelle.
    expect(peinture?.siret).toBe('12345678901234')
  })

  it('ne reprend qu’une fois une entreprise répétée dans le fichier', async () => {
    const { resultat } = await importer(
      [
        'Raison sociale;Zone',
        'Menuiserie Trinité;Nord',
        'menuiserie  trinite;Sud',
      ].join('\n'),
    )
    expect(resultat.creees).toBe(1)
    expect(resultat.ignorees[0]?.motif).toContain('plus haut dans le fichier')
  })
})

describe('fichier venu d’un Excel français', () => {
  it('lit un export en Windows-1252 avec point-virgule', async () => {
    const texte = 'Entreprise;Spécialité\nÉtanchéité Créole;Étanchéité'
    const octets1252 = Uint8Array.from([...texte].map((c) => c.charCodeAt(0)))
    const lecture = lireCsv(octets1252)
    expect(lecture.encodage).toBe('windows-1252')

    const mappage = devinerMappage(lecture.grille[0] ?? [])
    const analyse = analyserLignes(lecture.grille.slice(1), mappage, 2)
    const resultat = await importerEntreprises(db(), analyse.entreprises, 'ignorer')

    expect(resultat.creees).toBe(1)
    const etancheite = (await listerEntreprises(db())).find((e) =>
      e.raisonSociale.startsWith('Étanchéité'),
    )
    expect(etancheite?.raisonSociale).toBe('Étanchéité Créole')
    expect(etancheite?.corpsEtatQualifies).toEqual(['Étanchéité'])
  })
})

describe('cloisonnement', () => {
  it('n’importe que pour son propriétaire', async () => {
    const autre = await brut.user.create({ data: { email: `autre-${SUFFIXE}@local` } })
    try {
      const lecture = lireCsv(octets('Raison sociale\nEntreprise du voisin'))
      const analyse = analyserLignes(
        lecture.grille.slice(1),
        devinerMappage(lecture.grille[0] ?? []),
        2,
      )
      await importerEntreprises(clientPour(autre.id), analyse.entreprises, 'ignorer')

      const ici = await listerEntreprises(db())
      expect(ici.map((e) => e.raisonSociale)).not.toContain('Entreprise du voisin')
    } finally {
      await brut.user.delete({ where: { id: autre.id } })
    }
  })
})
