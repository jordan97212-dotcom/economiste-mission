/**
 * Jeu de démonstration pour les illustrations du guide.
 *
 * Les captures du guide montrent l'application réelle, pas des maquettes : il
 * lui faut donc une opération crédible à afficher. Ce script en fabrique une,
 * sous un propriétaire dédié, et rend son identifiant de session.
 *
 *   npx tsx outils/demo-guide.ts            crée le jeu et affiche le jeton
 *   npx tsx outils/demo-guide.ts --effacer  retire tout
 *
 * Rien de ce qu'il crée ne survit à `--effacer` : le propriétaire est supprimé,
 * et tout ce qui lui appartient part avec lui.
 */
import { randomBytes, createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { clientPour } from '../src/infrastructure/prisma'
import { creerMission } from '../src/application/missions/service'
import { ajouterPoste, creerLot } from '../src/application/chiffrage/structure'
import { enregistrerModifications } from '../src/application/chiffrage/service'
import { creerEntreprise } from '../src/application/entreprises/service'
import { creerConsultation } from '../src/application/consultations/service'
import { enregistrerOffreGlobale } from '../src/application/offres/service'
import { creerPrix } from '../src/application/prix/service'
import { enregistrerMetrePoste, creerRepere, enregistrerRepere } from '../src/application/metre/service'
import { deposerPiece } from '../src/application/pieces/service'
import * as PU from '../src/domain/money/prix-unitaire'

const EMAIL = 'guide@demonstration.local'
const brut = new PrismaClient()

async function effacer(): Promise<void> {
  // Les rappels de repère sont retenus par un `Restrict` : on les défait avant
  // de laisser la cascade emporter le reste.
  await brut.ligneMetre.deleteMany({
    where: { rappelRepere: { mission: { owner: { email: EMAIL } } } },
  })
  const { count } = await brut.user.deleteMany({ where: { email: EMAIL } })
  console.log(count > 0 ? 'Jeu de démonstration effacé.' : 'Rien à effacer.')
}

const mesure = (champs: Record<string, unknown> = {}) => ({
  type: 'MESURE' as const,
  libelle: '',
  deduction: false,
  nombre: null,
  longueur: null,
  largeur: null,
  hauteur: null,
  rappelRepereId: null,
  ...champs,
})

async function creer(): Promise<void> {
  await effacer()

  const utilisateur = await brut.user.create({ data: { email: EMAIL, nom: 'Économiste 972' } })
  const db = clientPour(utilisateur.id)

  /* --- Base de prix : de quoi montrer l'assistance à la saisie --- */
  const prix: [string, string, string][] = [
    ['Béton de propreté dosé à 150 kg/m³', 'M3', '145.00'],
    ['Voile béton banché ép. 20 cm, parement ordinaire', 'M2', '98.50'],
    ['Dalle portée ép. 20 cm, y compris armatures', 'M2', '132.00'],
    ['Longrine béton armé 25 × 50 cm', 'ML', '186.00'],
    ['Maçonnerie de blocs creux ép. 20 cm', 'M2', '72.40'],
    ['Enduit monocouche gratté sur maçonnerie', 'M2', '41.20'],
    ['Cloison de distribution 72/48, 1 parement BA13', 'M2', '38.90'],
    ['Faux plafond dalles 600 × 600 sur ossature', 'M2', '52.00'],
  ]
  for (const [designation, unite, prixUnitaireHt] of prix) {
    await creerPrix(db, { designation, unite, prixUnitaireHt, zone: 'MARTINIQUE' })
  }

  /* --- La mission --- */
  const missionId = await creerMission(db, {
    nomOperation: 'Groupe scolaire du Lorrain',
    maitreOuvrage: 'Commune du Lorrain',
    maitreOeuvre: 'Atelier d’architecture Caraïbe',
    typeOuvrage: 'TERTIAIRE',
    nature: 'CONSTRUCTION_NEUVE',
    typeMarche: 'PUBLIC',
    surfaceShon: '1450',
    coefficientLocalDefaut: '1.18',
    precisionPu: 2,
  })

  /* --- Les lots --- */
  const lots: Record<string, string> = {}
  for (const [numero, intitule] of [
    ['02', 'Gros œuvre — Maçonnerie'],
    ['05', 'Cloisons — Doublages — Faux plafonds'],
    ['08', 'Plomberie — Sanitaires'],
  ] as const) {
    lots[numero] = await creerLot(db, missionId, { numero, intitule })
  }

  /* --- Le chiffrage du lot 02 --- */
  const ouvrages: [string, string, string, string, string][] = [
    ['02.01', 'Béton de propreté dosé à 150 kg/m³', 'M3', '18', '145.00'],
    ['02.02', 'Longrine béton armé 25 × 50 cm', 'ML', '186', '186.00'],
    ['02.03', 'Voile béton banché ép. 20 cm, parement ordinaire', 'M2', '', '98.50'],
    ['02.04', 'Dalle portée ép. 20 cm, y compris armatures', 'M2', '1450', '132.00'],
    ['02.05', 'Maçonnerie de blocs creux ép. 20 cm', 'M2', '620', '72.40'],
    ['02.06', 'Enduit monocouche gratté sur maçonnerie', 'M2', '620', '41.20'],
  ]
  const posteIds: string[] = []
  for (const _ of ouvrages) posteIds.push(await ajouterPoste(db, missionId, { lotId: lots['02'] as string, type: 'OUVRAGE' }))

  await enregistrerModifications(
    db,
    missionId,
    ouvrages.map(([code, designation, unite, quantite, pu], index) => ({
      id: posteIds[index] as string,
      code,
      designation,
      unite,
      ...(quantite === '' ? {} : { quantite }),
      prixUnitaireHtBase: PU.depuisEuros(pu).toString(),
    })),
  )

  /* --- Un repère, et le métré du voile qui le rappelle --- */
  const repereId = await creerRepere(db, missionId, { nom: 'Linéaire de façade', unite: 'ML' })
  await enregistrerRepere(db, missionId, repereId, {
    lignes: [
      mesure({ libelle: 'Façades nord et sud', nombre: '2', longueur: '42.50' }),
      mesure({ libelle: 'Pignons est et ouest', nombre: '2', longueur: '18.20' }),
    ],
  })

  await enregistrerMetrePoste(db, missionId, posteIds[2] as string, [
    mesure({ type: 'RAPPEL', libelle: '', rappelRepereId: repereId, hauteur: '3.20' }),
    mesure({ libelle: 'Retour hall d’entrée', nombre: '2', longueur: '4.80', hauteur: '3.20' }),
    mesure({ libelle: 'Baies vitrées préau', nombre: '6', longueur: '2.40', hauteur: '2.15', deduction: true }),
  ])

  /* --- Quelques ouvrages sur les autres lots --- */
  for (const [numero, lignes] of [
    ['05', [['05.01', 'Cloison de distribution 72/48, 1 parement BA13', 'M2', '480', '38.90'],
            ['05.02', 'Faux plafond dalles 600 × 600 sur ossature', 'M2', '1450', '52.00']]],
    ['08', [['08.01', 'Alimentation sanitaire en PER, par point', 'U', '34', '210.00']]],
  ] as const) {
    const ids: string[] = []
    for (const _ of lignes) ids.push(await ajouterPoste(db, missionId, { lotId: lots[numero] as string, type: 'OUVRAGE' }))
    await enregistrerModifications(
      db,
      missionId,
      lignes.map(([code, designation, unite, quantite, pu], i) => ({
        id: ids[i] as string,
        code,
        designation,
        unite,
        quantite,
        prixUnitaireHtBase: PU.depuisEuros(pu).toString(),
      })),
    )
  }

  /* --- Le répertoire d'entreprises --- */
  const entreprises: [string, string, string, string, string[]][] = [
    ['Maçonnerie Créole', '73282932000074', 'Jean-Marc Dupont', 'contact@maconnerie-creole.mq', ['Gros œuvre', 'VRD']],
    ['Antilles Structures', '', 'Sylvie Marin', 's.marin@antilles-structures.fr', ['Gros œuvre']],
    ['Bâti Sud Caraïbe', '', 'Patrick Elisabeth', 'contact@batisud.mq', ['Gros œuvre', 'Maçonnerie']],
    ['Cloisons de l’Est', '', 'Nadia Belfort', 'n.belfort@cloisons-est.mq', ['Cloisons', 'Plâtrerie']],
  ]
  const entrepriseIds: Record<string, string> = {}
  for (const [raisonSociale, siret, contactNom, email, corpsEtatQualifies] of entreprises) {
    entrepriseIds[raisonSociale] = await creerEntreprise(db, {
      raisonSociale,
      siret: siret || null,
      contactNom,
      email,
      corpsEtatQualifies,
      zoneIntervention: 'Martinique',
    })
  }

  /* --- La consultation du lot 02, et trois offres --- */
  const offres: [string, string, string | null, 'BASE' | 'VARIANTE'][] = [
    ['Maçonnerie Créole', '284500.00', null, 'BASE'],
    ['Antilles Structures', '312800.00', null, 'BASE'],
    ['Bâti Sud Caraïbe', '268900.00', 'Ossature métallique', 'VARIANTE'],
  ]
  for (const [nom, montantHt, libelle, type] of offres) {
    const consultationId = await creerConsultation(db, missionId, {
      lotId: lots['02'] as string,
      entrepriseId: entrepriseIds[nom] as string,
      dateEnvoiDce: new Date('2026-08-24'),
      dateLimiteRemise: new Date('2026-09-15'),
    })
    await enregistrerOffreGlobale(db, missionId, consultationId, {
      montantHt,
      type,
      libelle,
      dateReception: new Date('2026-09-12'),
      conforme: true,
    })
  }

  /* --- Une pièce au dossier --- */
  await deposerPiece(db, missionId, {
    nomFichier: 'PL-002-plan-de-masse.pdf',
    donnees: Buffer.from('%PDF-1.7\nplan de masse de demonstration\n%%EOF'),
    categorie: 'PLAN',
    libelle: 'Plan de masse',
    indice: 'C',
  })
  await deposerPiece(db, missionId, {
    nomFichier: 'Etude-geotechnique-G2.pdf',
    donnees: Buffer.from('%PDF-1.7\nsondages pressiometriques\n%%EOF'),
    categorie: 'RAPPORT_ETUDE',
    libelle: 'Étude géotechnique G2 AVP',
    lotId: lots['02'] as string,
  })

  /* --- Une session, pour que le navigateur puisse entrer --- */
  const jeton = randomBytes(32).toString('base64url')
  await brut.session.create({
    data: {
      jeton: createHash('sha256').update(jeton).digest('hex'),
      userId: utilisateur.id,
      expireLe: new Date(Date.now() + 3600_000),
    },
  })

  console.log(
    JSON.stringify({
      jeton,
      missionId,
      lotGrosOeuvre: lots['02'],
      posteVoile: posteIds[2],
    }),
  )
}

try {
  if (process.argv.includes('--effacer')) await effacer()
  else await creer()
} finally {
  await brut.$disconnect()
}
