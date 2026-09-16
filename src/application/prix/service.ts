import { Prisma, type PrismaClient } from '@prisma/client'
import * as PU from '../../domain/money/prix-unitaire'
import { lireNombre, normaliserUnite, lireDate } from '../saisie'

/**
 * Base de prix personnelle — SPEC_APP_ECONOMISTE.md §6.
 *
 * C'est l'actif principal de l'application : au bout de quelques dizaines de
 * missions, l'historique réel en zone Martinique vaut plus qu'une base
 * métropole générique. Rien n'y entre sans que l'utilisateur l'ait voulu.
 */

export interface EntreePrix {
  readonly code?: string | null
  readonly designation: string
  readonly unite: string
  readonly corpsEtatId?: string | null
  /** Prix en euros, tel que saisi. Converti ici vers l'échelle de stockage. */
  readonly prixUnitaireHt: string
  readonly dateReleve?: string | null
  readonly contexteTypeOuvrage?: string | null
  readonly contexteNature?: string | null
  readonly zone?: string | null
  /** Mission d'où le prix a été relevé, quand il vient d'une clôture — §5.7. */
  readonly origineMissionId?: string | null
}

export class PrixIntrouvable extends Error {
  constructor(id: string) {
    super(`Prix introuvable ou inaccessible : ${id}`)
    this.name = 'PrixIntrouvable'
  }
}

function prixVersStockage(euros: string): bigint {
  const nombre = lireNombre(euros)
  if (nombre === null) throw new Error(`Prix unitaire illisible : « ${euros} »`)
  return PU.depuisEuros(nombre) as bigint
}

type Unite = NonNullable<Prisma.PrixReferenceUncheckedCreateInput['unite']>
type TypeOuvrage = NonNullable<Prisma.PrixReferenceUncheckedCreateInput['contexteTypeOuvrage']>
type Nature = NonNullable<Prisma.PrixReferenceUncheckedCreateInput['contexteNature']>
type ZoneValeur = NonNullable<Prisma.PrixReferenceUncheckedCreateInput['zone']>

interface DonneesPrix {
  code: string | null
  designation: string
  unite: Unite
  corpsEtatId: string | null
  prixUnitaireHt: bigint
  dateReleve: Date
  contexteTypeOuvrage: TypeOuvrage | null
  contexteNature: Nature | null
  zone: ZoneValeur
  origineMissionId: string | null
}

function donnees(entree: EntreePrix): DonneesPrix {
  const unite = normaliserUnite(entree.unite) ?? entree.unite.trim().toUpperCase()
  const date = entree.dateReleve ? lireDate(entree.dateReleve) : null

  return {
    code: entree.code?.trim() || null,
    designation: entree.designation.trim(),
    unite: unite as Unite,
    corpsEtatId: entree.corpsEtatId || null,
    prixUnitaireHt: prixVersStockage(entree.prixUnitaireHt),
    dateReleve: date ?? new Date(),
    contexteTypeOuvrage: (entree.contexteTypeOuvrage || null) as TypeOuvrage | null,
    contexteNature: (entree.contexteNature || null) as Nature | null,
    zone: (entree.zone || 'MARTINIQUE') as ZoneValeur,
    origineMissionId: entree.origineMissionId ?? null,
  }
}

export interface FiltresPrix {
  readonly texte?: string
  readonly corpsEtatId?: string | null
  readonly zone?: string | null
  readonly limite?: number
}

export async function listerPrix(client: PrismaClient, filtres: FiltresPrix = {}) {
  const where: Prisma.PrixReferenceWhereInput = {}
  if (filtres.corpsEtatId) where.corpsEtatId = filtres.corpsEtatId
  if (filtres.zone) where.zone = filtres.zone as NonNullable<Prisma.PrixReferenceWhereInput['zone']>
  if (filtres.texte?.trim()) {
    const texte = filtres.texte.trim()
    where.OR = [
      { designation: { contains: texte, mode: 'insensitive' } },
      { code: { contains: texte, mode: 'insensitive' } },
    ]
  }

  return client.prixReference.findMany({
    where,
    orderBy: [{ dateReleve: 'desc' }, { designation: 'asc' }],
    take: Math.min(filtres.limite ?? 200, 1000),
    include: { corpsEtat: { select: { id: true, code: true, libelle: true } } },
  })
}

export async function creerPrix(client: PrismaClient, entree: EntreePrix): Promise<string> {
  if (!entree.designation.trim()) throw new Error('La désignation est obligatoire.')
  const cree = await client.prixReference.create({
    // ownerId est ajouté par le cloisonnement du client, d'où la conversion.
    data: donnees(entree) as unknown as Prisma.PrixReferenceCreateInput,
    select: { id: true },
  })
  return cree.id
}

export async function modifierPrix(
  client: PrismaClient,
  id: string,
  entree: EntreePrix,
): Promise<void> {
  const existant = await client.prixReference.findUnique({ where: { id }, select: { id: true } })
  if (!existant) throw new PrixIntrouvable(id)
  await client.prixReference.update({ where: { id }, data: donnees(entree) })
}

export async function supprimerPrix(client: PrismaClient, id: string): Promise<void> {
  const existant = await client.prixReference.findUnique({ where: { id }, select: { id: true } })
  if (!existant) throw new PrixIntrouvable(id)
  await client.prixReference.delete({ where: { id } })
}

// ---------------------------------------------------------------------------
// Import depuis un classeur Excel
// ---------------------------------------------------------------------------

export * from './analyse-import'
import type { ColonneBasePrix, MappagePrix, AnomalieImport, ResultatImportPrix } from './analyse-import'
import { COLONNES_BASE_PRIX } from './analyse-import'

/**
 * Importe une grille dans la base de prix. Transactionnel : soit toutes les
 * lignes valides entrent, soit aucune. Les lignes illisibles sont signalées
 * plutôt que devinées.
 */
export async function importerBasePrix(
  client: PrismaClient,
  grille: readonly (readonly string[])[],
  mappage: MappagePrix,
  options: { readonly premiereLigne?: number } = {},
): Promise<ResultatImportPrix> {
  if (mappage.designation === undefined) {
    throw new Error('La colonne de désignation est obligatoire pour importer.')
  }
  if (mappage.prixUnitaireHt === undefined) {
    throw new Error('La colonne de prix unitaire est obligatoire pour importer.')
  }

  const corpsEtats = await client.corpsEtat.findMany({ select: { id: true, code: true, libelle: true } })
  const parCode = new Map(corpsEtats.map((c) => [c.code.toLowerCase(), c.id]))
  const parLibelle = new Map(corpsEtats.map((c) => [c.libelle.toLowerCase(), c.id]))

  const anomalies: AnomalieImport[] = []
  const aCreer: Omit<Prisma.PrixReferenceCreateManyInput, 'ownerId'>[] = []
  const decalage = options.premiereLigne ?? 1
  let ignores = 0

  const cellule = (ligne: readonly string[], colonne: ColonneBasePrix): string => {
    const index = mappage[colonne]
    return index === undefined ? '' : (ligne[index] ?? '')
  }

  for (const [rang, ligne] of grille.entries()) {
    const numeroLigne = decalage + rang
    const designation = cellule(ligne, 'designation').trim()
    const prixBrut = cellule(ligne, 'prixUnitaireHt').trim()

    if (designation === '' && prixBrut === '') {
      ignores += 1
      continue
    }

    if (designation === '') {
      anomalies.push({ ligne: numeroLigne, message: 'Désignation absente.' })
      continue
    }

    const prix = lireNombre(prixBrut)
    if (prix === null) {
      anomalies.push({ ligne: numeroLigne, message: `Prix unitaire illisible : « ${prixBrut} ».` })
      continue
    }

    const uniteBrute = cellule(ligne, 'unite')
    const unite = normaliserUnite(uniteBrute)
    if (uniteBrute.trim() !== '' && unite === null) {
      anomalies.push({ ligne: numeroLigne, message: `Unité inconnue : « ${uniteBrute} ».` })
      continue
    }

    const corpsBrut = cellule(ligne, 'corpsEtat').trim().toLowerCase()
    const corpsEtatId = corpsBrut ? (parCode.get(corpsBrut) ?? parLibelle.get(corpsBrut) ?? null) : null

    const zoneBrute = cellule(ligne, 'zone').trim().toUpperCase()
    const zone = ['METROPOLE', 'MARTINIQUE', 'AUTRE'].includes(zoneBrute) ? zoneBrute : 'MARTINIQUE'

    aCreer.push({
      code: cellule(ligne, 'code').trim() || null,
      designation,
      unite: (unite ?? 'U') as Unite,
      corpsEtatId,
      prixUnitaireHt: PU.depuisEuros(prix) as bigint,
      dateReleve: lireDate(cellule(ligne, 'dateReleve')) ?? new Date(),
      zone: zone as ZoneValeur,
    })
  }

  if (aCreer.length > 0) {
    // Le cloisonnement du client renseigne ownerId sur chaque ligne.
    // Le cloisonnement du client ajoute ownerId sur chaque ligne.
    await client.prixReference.createMany({
      data: aCreer as Prisma.PrixReferenceCreateManyInput[],
    })
  }

  return { crees: aCreer.length, ignores, anomalies }
}
