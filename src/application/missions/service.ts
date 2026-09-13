import { Prisma, type PrismaClient } from '@prisma/client'
import { MissionIntrouvable, recalculerMission } from '../chiffrage/service'
import { difference, journaliser } from '../audit/service'

/** Champs de mission dont une modification engage un chiffrage. */
const CHAMPS_MISSION_SUIVIS = {
  reference: true,
  nomOperation: true,
  maitreOuvrage: true,
  typeOuvrage: true,
  nature: true,
  typeMarche: true,
  surfaceShon: true,
  surfaceUtile: true,
  budgetPrevisionnelHt: true,
  statut: true,
  honorairesMissionHt: true,
  modeFacturation: true,
  coefficientLocalDefaut: true,
  precisionPu: true,
  tauxTva: true,
} as const

export interface EntreeMission {
  reference?: string
  nomOperation: string
  maitreOuvrage?: string | null
  maitreOeuvre?: string | null
  typeOuvrage: string
  nature: string
  typeMarche: string
  surfaceShon?: string | null
  surfaceUtile?: string | null
  budgetPrevisionnelHt?: string | null
  phasesContractuelles?: string[]
  dateDebut?: string | null
  dateFinPrevue?: string | null
  statut?: string
  honorairesMissionHt?: string | null
  modeFacturation?: string | null
  coefficientLocalDefaut?: string
  precisionPu?: number
  tauxTva?: string
  seuilDerivePourcent?: string
}

function decimalOuNull(valeur: string | null | undefined): Prisma.Decimal | null {
  if (valeur === null || valeur === undefined) return null
  const nettoye = valeur.trim().replace(',', '.')
  return nettoye === '' ? null : new Prisma.Decimal(nettoye)
}

function centimesOuNull(valeur: string | null | undefined): bigint | null {
  if (valeur === null || valeur === undefined) return null
  const nettoye = valeur.trim().replace(/\s/g, '').replace(',', '.')
  if (nettoye === '') return null
  const decimal = new Prisma.Decimal(nettoye)
  return BigInt(decimal.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toFixed(0))
}

function dateOuNull(valeur: string | null | undefined): Date | null {
  if (valeur === null || valeur === undefined || valeur.trim() === '') return null
  const d = new Date(valeur)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Référence interne au format `2026-014` : l'année en cours, puis un compteur
 * sur trois chiffres qui reprend au plus haut numéro déjà attribué cette année.
 */
export async function genererReference(client: PrismaClient, annee = new Date().getFullYear()): Promise<string> {
  const prefixe = `${annee}-`
  const existantes = await client.mission.findMany({
    where: { reference: { startsWith: prefixe } },
    select: { reference: true },
  })

  let maximum = 0
  for (const { reference } of existantes) {
    const suffixe = reference.slice(prefixe.length)
    if (/^\d+$/.test(suffixe)) maximum = Math.max(maximum, Number.parseInt(suffixe, 10))
  }

  return `${prefixe}${String(maximum + 1).padStart(3, '0')}`
}

export async function listerMissions(client: PrismaClient) {
  return client.mission.findMany({
    orderBy: [{ statut: 'asc' }, { reference: 'desc' }],
    select: {
      id: true,
      reference: true,
      nomOperation: true,
      maitreOuvrage: true,
      typeOuvrage: true,
      statut: true,
      dateFinPrevue: true,
      budgetPrevisionnelHt: true,
      honorairesMissionHt: true,
      coefficientLocalDefaut: true,
      surfaceShon: true,
      _count: { select: { lots: true } },
      lots: { select: { montantEstimeHt: true } },
    },
  })
}

function donneesCommunes(entree: EntreeMission) {
  const donnees: Record<string, unknown> = {
    nomOperation: entree.nomOperation.trim(),
    maitreOuvrage: entree.maitreOuvrage?.trim() || null,
    maitreOeuvre: entree.maitreOeuvre?.trim() || null,
    typeOuvrage: entree.typeOuvrage,
    nature: entree.nature,
    typeMarche: entree.typeMarche,
    surfaceShon: decimalOuNull(entree.surfaceShon),
    surfaceUtile: decimalOuNull(entree.surfaceUtile),
    budgetPrevisionnelHt: centimesOuNull(entree.budgetPrevisionnelHt),
    dateDebut: dateOuNull(entree.dateDebut),
    dateFinPrevue: dateOuNull(entree.dateFinPrevue),
    honorairesMissionHt: centimesOuNull(entree.honorairesMissionHt),
    modeFacturation: entree.modeFacturation || null,
  }
  if (entree.phasesContractuelles) donnees.phasesContractuelles = entree.phasesContractuelles
  if (entree.statut) donnees.statut = entree.statut
  if (entree.coefficientLocalDefaut) donnees.coefficientLocalDefaut = decimalOuNull(entree.coefficientLocalDefaut)
  if (entree.precisionPu !== undefined) donnees.precisionPu = entree.precisionPu
  if (entree.tauxTva) donnees.tauxTva = decimalOuNull(entree.tauxTva)
  if (entree.seuilDerivePourcent) donnees.seuilDerivePourcent = decimalOuNull(entree.seuilDerivePourcent)
  return donnees
}

export async function creerMission(client: PrismaClient, entree: EntreeMission): Promise<string> {
  const reference = entree.reference?.trim() || (await genererReference(client))
  const mission = await client.mission.create({
    data: { ...donneesCommunes(entree), reference } as Prisma.MissionCreateInput,
    select: { id: true },
  })
  await journaliser(client, {
    entite: 'Mission',
    entiteId: mission.id,
    action: 'CREATION',
    apres: { reference, nomOperation: entree.nomOperation },
  })
  return mission.id
}

export async function modifierMission(
  client: PrismaClient,
  id: string,
  entree: EntreeMission,
): Promise<void> {
  const avant = await client.mission.findUnique({
    where: { id },
    select: { id: true, ...CHAMPS_MISSION_SUIVIS },
  })
  if (!avant) throw new MissionIntrouvable(id)

  const donnees = donneesCommunes(entree)
  if (entree.reference?.trim()) donnees.reference = entree.reference.trim()

  const apres = await client.mission.update({
    where: { id },
    data: donnees as Prisma.MissionUpdateInput,
    select: { id: true, ...CHAMPS_MISSION_SUIVIS },
  })

  const ecart = difference(
    avant as unknown as Record<string, unknown>,
    apres as unknown as Record<string, unknown>,
  )
  if (ecart) {
    await journaliser(client, {
      entite: 'Mission',
      entiteId: id,
      action: 'MODIFICATION',
      avant: ecart.avant,
      apres: ecart.apres,
    })
  }

  // Le coefficient ou la précision ont pu changer : tout le chiffrage en dépend.
  await recalculerMission(client, id)
}

export interface OptionsDuplication {
  readonly nomOperation?: string
  readonly reference?: string
  /** Reprendre les prix, ou ne garder que la structure et les quantités. */
  readonly reprendreLesPrix?: boolean
}

/**
 * Duplique une mission comme point de départ d'une opération similaire.
 * La copie repart en prospect, sans dates, avec une référence neuve.
 * L'arborescence des postes est recopiée à l'identique, liens de parenté compris.
 */
export async function dupliquerMission(
  client: PrismaClient,
  sourceId: string,
  options: OptionsDuplication = {},
): Promise<string> {
  const source = await client.mission.findUnique({
    where: { id: sourceId },
    include: { lots: { include: { postes: true }, orderBy: { ordre: 'asc' } } },
  })
  if (!source) throw new MissionIntrouvable(sourceId)

  const reprendreLesPrix = options.reprendreLesPrix ?? true
  const reference = options.reference?.trim() || (await genererReference(client))

  const copie = await client.mission.create({
    data: {
      reference,
      nomOperation: options.nomOperation?.trim() || `${source.nomOperation} (copie)`,
      maitreOuvrage: source.maitreOuvrage,
      maitreOeuvre: source.maitreOeuvre,
      typeOuvrage: source.typeOuvrage,
      nature: source.nature,
      typeMarche: source.typeMarche,
      surfaceShon: source.surfaceShon,
      surfaceUtile: source.surfaceUtile,
      budgetPrevisionnelHt: source.budgetPrevisionnelHt,
      phasesContractuelles: source.phasesContractuelles,
      statut: 'PROSPECT',
      honorairesMissionHt: source.honorairesMissionHt,
      modeFacturation: source.modeFacturation,
      coefficientLocalDefaut: source.coefficientLocalDefaut,
      precisionPu: source.precisionPu,
      tauxTva: source.tauxTva,
      seuilDerivePourcent: source.seuilDerivePourcent,
    } as Prisma.MissionCreateInput,
    select: { id: true },
  })

  for (const lot of source.lots) {
    const nouveauLot = await client.lot.create({
      data: {
        missionId: copie.id,
        numero: lot.numero,
        intitule: lot.intitule,
        ordre: lot.ordre,
        corpsEtatId: lot.corpsEtatId,
        coefficientLocal: lot.coefficientLocal,
      },
      select: { id: true },
    })

    // On recopie l'arbre par niveaux, en gardant la correspondance des
    // identifiants pour que les liens de parenté suivent.
    const correspondance = new Map<string, string>()
    const enfantsDe = new Map<string | null, typeof lot.postes>()
    for (const poste of lot.postes) {
      const liste = enfantsDe.get(poste.parentId) ?? []
      liste.push(poste)
      enfantsDe.set(poste.parentId, liste)
    }
    for (const liste of enfantsDe.values()) liste.sort((a, b) => a.ordre - b.ordre)

    const file: (string | null)[] = [null]
    while (file.length > 0) {
      const parentSource = file.shift() as string | null
      for (const poste of enfantsDe.get(parentSource) ?? []) {
        const cree = await client.poste.create({
          data: {
            lotId: nouveauLot.id,
            parentId: parentSource === null ? null : (correspondance.get(parentSource) ?? null),
            type: poste.type,
            ordre: poste.ordre,
            code: poste.code,
            designation: poste.designation,
            unite: poste.unite,
            quantite: poste.quantite,
            prixUnitaireHtBase: reprendreLesPrix ? poste.prixUnitaireHtBase : null,
            coefficientApplique: poste.coefficientApplique,
            sourcePrix: reprendreLesPrix ? poste.sourcePrix : 'SAISIE_MANUELLE',
            dateSourcePrix: reprendreLesPrix ? poste.dateSourcePrix : null,
            texteCctp: poste.texteCctp ?? Prisma.DbNull,
          },
          select: { id: true },
        })
        correspondance.set(poste.id, cree.id)
        file.push(poste.id)
      }
    }
  }

  await recalculerMission(client, copie.id)
  await journaliser(client, {
    entite: 'Mission',
    entiteId: copie.id,
    action: 'CREATION',
    apres: { reference, dupliqueeDepuis: source.reference },
  })
  return copie.id
}

export async function supprimerMission(client: PrismaClient, id: string): Promise<void> {
  const existante = await client.mission.findUnique({
    where: { id },
    select: { id: true, reference: true, nomOperation: true },
  })
  if (!existante) throw new MissionIntrouvable(id)
  await client.mission.delete({ where: { id } })
  await journaliser(client, {
    entite: 'Mission',
    entiteId: id,
    action: 'SUPPRESSION',
    avant: { reference: existante.reference, nomOperation: existante.nomOperation },
  })
}
