/**
 * Reconstitue l'historique des migrations d'une base existante.
 *
 * Prisma refuse d'appliquer des migrations sur une base qui contient déjà des
 * tables mais aucun historique : c'est l'erreur P3005, et c'est une bonne
 * prudence — sans historique, il ne sait pas ce qui a déjà été fait, et
 * rejouer une migration déjà passée casserait le schéma.
 *
 * Ce script répond à sa place, en regardant la base elle-même. Chaque
 * migration a laissé une trace reconnaissable : une table, une colonne. Si la
 * trace est là, la migration est marquée comme appliquée ; sinon on s'arrête,
 * et le démarrage normal applique le reste.
 *
 * Il ne crée, ne modifie et n'efface aucune donnée. Il n'écrit que dans la
 * table d'historique de Prisma.
 */
import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'node:child_process'

const CLI = process.env.PRISMA_CLI ?? './outils-prisma/node_modules/prisma/build/index.js'

/**
 * Dans l'ordre. Le marqueur est la trace la plus caractéristique laissée par
 * la migration : si elle est là, la migration est passée.
 */
const MIGRATIONS = [
  {
    nom: '20260912160140_socle_initial',
    resume: 'socle : missions, lots, postes, base de prix',
    marqueur: { table: 'mission' },
  },
  {
    nom: '20260912200015_recherche_plein_texte_prix',
    resume: 'recherche plein texte sur la base de prix',
    marqueur: { table: 'prix_reference', colonne: 'recherche' },
  },
  {
    nom: '20260912203700_trames_pieces_ecrites',
    resume: 'trames de pièces écrites',
    marqueur: { table: 'trame_cctp', colonne: 'type' },
  },
  {
    nom: '20260913194539_referentiel_normes',
    resume: 'référentiel des normes',
    marqueur: { table: 'reference_normative' },
  },
  {
    nom: '20260916141114_rapport_offres_brouillon',
    resume: 'brouillon de rapport d’analyse des offres',
    marqueur: { table: 'lot', colonne: 'rapport_offres_brouillon' },
  },
  {
    nom: '20260916150000_offre_retenue',
    resume: 'offre retenue par lot',
    marqueur: { table: 'lot', colonne: 'offre_retenue_id' },
  },
  {
    nom: '20260917015924_metre_par_ouvrage',
    resume: 'métré par ouvrage et repères',
    marqueur: { table: 'ligne_metre' },
  },
  {
    nom: '20260917125620_pieces_du_dossier',
    resume: 'pièces du dossier de consultation',
    marqueur: { table: 'piece_jointe', colonne: 'categorie' },
  },
]

/** Tables dont le contenu dit s'il y a quelque chose à perdre. */
const TABLES_PARLANTES = [
  ['mission', 'missions'],
  ['lot', 'lots'],
  ['poste', 'lignes de chiffrage'],
  ['prix_reference', 'prix en base'],
  ['entreprise', 'entreprises'],
  ['trame_cctp', 'trames de CCTP'],
  ['piece_jointe', 'pièces déposées'],
]

const db = new PrismaClient()

async function tableExiste(nom) {
  const [{ existe }] = await db.$queryRawUnsafe(
    'SELECT to_regclass($1) IS NOT NULL AS existe',
    `public.${nom}`,
  )
  return existe === true
}

async function colonneExiste(table, colonne) {
  const [{ existe }] = await db.$queryRawUnsafe(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS existe`,
    table,
    colonne,
  )
  return existe === true
}

async function marqueurPresent(marqueur) {
  if (!(await tableExiste(marqueur.table))) return false
  if (marqueur.colonne === undefined) return true
  return colonneExiste(marqueur.table, marqueur.colonne)
}

async function compter(table) {
  if (!(await tableExiste(table))) return null
  const [{ n }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}"`)
  return n
}

function marquerAppliquee(nom) {
  execFileSync('node', [CLI, 'migrate', 'resolve', '--applied', nom], { stdio: 'inherit' })
}

async function principal() {
  console.log('')
  console.log('  Réparation de l’historique des migrations')
  console.log('  ─────────────────────────────────────────')
  console.log('')

  console.log('  Ce que contient la base aujourd’hui :')
  let total = 0
  for (const [table, libelle] of TABLES_PARLANTES) {
    const n = await compter(table)
    if (n === null) {
      console.log(`    ${libelle.padEnd(22)} table absente`)
    } else {
      console.log(`    ${libelle.padEnd(22)} ${n}`)
      total += n
    }
  }
  console.log('')
  if (total === 0) {
    console.log('  Aucune donnée métier : la base a été créée mais jamais remplie.')
  } else {
    console.log(`  ${total} enregistrement(s) au total — il y a quelque chose à préserver.`)
  }
  console.log('')

  if (await tableExiste('_prisma_migrations')) {
    const [{ n }] = await db.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
    )
    if (n > 0) {
      console.log(`  L’historique existe déjà (${n} migration(s) enregistrée(s)).`)
      console.log('  Il n’y a rien à réparer ici.')
      console.log('')
      return
    }
  }

  console.log('  Aucun historique : je le reconstitue d’après le schéma réel.')
  console.log('')

  const aMarquer = []
  for (const migration of MIGRATIONS) {
    if (await marqueurPresent(migration.marqueur)) {
      aMarquer.push(migration)
    } else {
      // Dès qu'une trace manque, on s'arrête : les migrations suivantes seront
      // appliquées normalement au prochain démarrage.
      break
    }
  }

  if (aMarquer.length === 0) {
    console.log('  Le schéma ne porte la trace d’aucune migration connue.')
    console.log('  Il ne vient donc pas de cette application : je ne touche à rien.')
    console.log('  Envoyez-moi cette fenêtre.')
    process.exitCode = 1
    return
  }

  for (const migration of aMarquer) {
    console.log(`  Déjà en place : ${migration.resume}`)
    marquerAppliquee(migration.nom)
  }

  const restantes = MIGRATIONS.slice(aMarquer.length)
  console.log('')
  if (restantes.length === 0) {
    console.log('  Le schéma est complet. Historique reconstitué.')
  } else {
    console.log(`  ${restantes.length} migration(s) restent à appliquer :`)
    for (const migration of restantes) console.log(`    · ${migration.resume}`)
    console.log('  Elles le seront au prochain démarrage.')
  }
  console.log('')
}

try {
  await principal()
} finally {
  await db.$disconnect()
}
