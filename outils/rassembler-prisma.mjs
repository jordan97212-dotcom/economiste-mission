/**
 * Rassemble tout ce dont la ligne de commande Prisma a besoin pour tourner.
 *
 * L'image d'exécution n'emporte pas `node_modules` en entier — c'est tout
 * l'intérêt de la sortie autonome de Next. Mais elle doit appliquer les
 * migrations au démarrage, donc exécuter la CLI Prisma, qui a ses propres
 * dépendances : `@prisma/config` réclame `effect`, `c12`, `empathic`…
 *
 * Ces dépendances changent à chaque montée de version de Prisma. Les recopier
 * à la main, c'est se préparer à revoir « Cannot find module » le jour d'une
 * mise à jour, en production, sur le poste de l'économiste. On parcourt donc
 * l'arbre réellement installé et on copie sa fermeture, quoi qu'elle contienne.
 *
 *   node outils/rassembler-prisma.mjs <destination>
 */
import { cp, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const RACINE = resolve(process.cwd())
const DESTINATION = resolve(process.argv[2] ?? 'outils-prisma/node_modules')

/** Les paquets de départ : la CLI, ses moteurs, et le client engendré. */
const DEPART = ['prisma', '@prisma/engines', '.prisma']

/**
 * Résout un paquet comme le fait Node : on cherche dans le `node_modules` du
 * demandeur, puis on remonte. npm imbrique dès qu'il y a conflit de versions.
 */
function resoudre(nom, depuis) {
  let dossier = depuis
  for (;;) {
    const candidat = join(dossier, 'node_modules', nom)
    if (existsSync(join(candidat, 'package.json')) || existsSync(candidat)) return candidat
    const parent = dirname(dossier)
    if (parent === dossier || !dossier.startsWith(RACINE)) return null
    dossier = parent
  }
}

async function dependancesDe(chemin) {
  try {
    const manifeste = JSON.parse(await readFile(join(chemin, 'package.json'), 'utf8'))
    return [
      ...Object.keys(manifeste.dependencies ?? {}),
      // Les optionnelles ne sont copiées que si elles sont réellement là.
      ...Object.keys(manifeste.optionalDependencies ?? {}),
    ]
  } catch {
    return []
  }
}

const vus = new Set()
const aCopier = []

async function visiter(nom, depuis) {
  const chemin = resoudre(nom, depuis)
  if (chemin === null || !existsSync(chemin)) return
  if (vus.has(chemin)) return
  vus.add(chemin)
  aCopier.push({ nom, chemin })
  for (const dependance of await dependancesDe(chemin)) {
    await visiter(dependance, chemin)
  }
}

for (const nom of DEPART) await visiter(nom, RACINE)

await mkdir(DESTINATION, { recursive: true })
for (const { nom, chemin } of aCopier) {
  const cible = join(DESTINATION, nom)
  await mkdir(dirname(cible), { recursive: true })
  await cp(chemin, cible, { recursive: true, dereference: false })
}

console.log(`Outils Prisma rassemblés : ${aCopier.length} paquets dans ${DESTINATION}`)
