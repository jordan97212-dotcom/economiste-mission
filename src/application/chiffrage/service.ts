import { Prisma, type PrismaClient } from '@prisma/client'
import * as Money from '../../domain/money/money'
import type { Money as MoneyValue } from '../../domain/money/money'
import * as PU from '../../domain/money/prix-unitaire'
import { calculerOuvrage, recapituler } from '../../domain/chiffrage/calcul'
import type { ChiffrageDTO, LotDTO, PosteDTO, MissionDTO, RecapitulatifDTO, ModificationPoste } from '../dto'
import { difference, journaliserPlusieurs, type EntreeAudit } from '../audit/service'

/** Champs saisis d'un poste : ce sont eux, et eux seuls, que le journal suit. */
const CHAMPS_SUIVIS = {
  code: true,
  designation: true,
  unite: true,
  quantite: true,
  prixUnitaireHtBase: true,
  coefficientApplique: true,
  sourcePrix: true,
} as const

/** Prisma renvoie ses propres décimaux : on les traverse toujours en chaîne. */
function texte(valeur: { toString(): string } | null | undefined): string | null {
  return valeur === null || valeur === undefined ? null : valeur.toString()
}

export class QuantiteCalculee extends Error {
  constructor(designations: readonly string[]) {
    super(
      `La quantité de ${designations.length} ouvrage(s) vient de leur métré : ${designations.join(
        ', ',
      )}. Modifiez le métré, ou supprimez-le pour reprendre la saisie directe.`,
    )
    this.name = 'QuantiteCalculee'
  }
}

export class MissionIntrouvable extends Error {
  constructor(id: string) {
    super(`Mission introuvable ou inaccessible : ${id}`)
    this.name = 'MissionIntrouvable'
  }
}

interface PosteBrut {
  id: string
  parentId: string | null
  type: 'SOUS_LOT' | 'OUVRAGE'
  ordre: number
  code: string | null
  designation: string
  unite: string | null
  quantite: Prisma.Decimal | null
  prixUnitaireHtBase: bigint | null
  coefficientApplique: Prisma.Decimal | null
  prixUnitaireHtFinal: bigint | null
  montantHt: bigint
  sourcePrix: string
  dateSourcePrix: Date | null
  texteCctp: Prisma.JsonValue | null
  _count?: { lignesMetre: number }
}

interface ResultatCalcul {
  readonly id: string
  readonly prixUnitaireHtFinal: bigint | null
  readonly montantHt: bigint
}

/**
 * Applique le domaine à l'arbre de postes d'un lot, de bas en haut.
 * Un ouvrage porte son propre montant, un sous-lot porte la somme des siens.
 */
function calculerLot(
  postes: readonly PosteBrut[],
  coefficients: { mission: string; lot: string | null },
  precisionPu: number,
): { resultats: ResultatCalcul[]; total: MoneyValue } {
  const enfantsDe = new Map<string | null, PosteBrut[]>()
  for (const poste of postes) {
    const cle = poste.parentId
    const liste = enfantsDe.get(cle) ?? []
    liste.push(poste)
    enfantsDe.set(cle, liste)
  }
  for (const liste of enfantsDe.values()) liste.sort((a, b) => a.ordre - b.ordre)

  const resultats: ResultatCalcul[] = []

  function visiter(poste: PosteBrut): MoneyValue {
    if (poste.type === 'OUVRAGE') {
      const calcul = calculerOuvrage({
        quantite: texte(poste.quantite),
        prixUnitaireHtBase:
          poste.prixUnitaireHtBase === null ? null : PU.depuisStockage(poste.prixUnitaireHtBase),
        coefficient: {
          mission: coefficients.mission,
          lot: coefficients.lot,
          ligne: texte(poste.coefficientApplique),
        },
        precisionPu,
      })
      resultats.push({
        id: poste.id,
        prixUnitaireHtFinal: calcul.prixUnitaireHtFinal as bigint,
        montantHt: calcul.montantHt as bigint,
      })
      return calcul.montantHt
    }

    const sousTotal = Money.somme((enfantsDe.get(poste.id) ?? []).map(visiter))
    resultats.push({ id: poste.id, prixUnitaireHtFinal: null, montantHt: sousTotal as bigint })
    return sousTotal
  }

  const total = Money.somme((enfantsDe.get(null) ?? []).map(visiter))
  return { resultats, total }
}

/**
 * Recalcule l'intégralité du chiffrage d'une mission et persiste les valeurs
 * dérivées. Il ne doit jamais exister en base un total qui contredit ses lignes.
 */
export async function recalculerMission(client: PrismaClient, missionId: string): Promise<void> {
  const mission = await client.mission.findUnique({
    where: { id: missionId },
    select: { id: true, coefficientLocalDefaut: true, precisionPu: true },
  })
  if (!mission) throw new MissionIntrouvable(missionId)

  const lots = await client.lot.findMany({
    where: { missionId },
    select: {
      id: true,
      coefficientLocal: true,
      postes: {
        select: {
          id: true,
          parentId: true,
          type: true,
          ordre: true,
          quantite: true,
          prixUnitaireHtBase: true,
          coefficientApplique: true,
        },
      },
    },
  })

  const tousResultats: ResultatCalcul[] = []
  const totauxLots: { id: string; total: bigint }[] = []

  for (const lot of lots) {
    const { resultats, total } = calculerLot(
      lot.postes as unknown as PosteBrut[],
      {
        mission: mission.coefficientLocalDefaut.toString(),
        lot: texte(lot.coefficientLocal),
      },
      mission.precisionPu,
    )
    tousResultats.push(...resultats)
    totauxLots.push({ id: lot.id, total: total as bigint })
  }

  await client.$transaction(async (tx) => {
    // Mise à jour en masse : un DPGF réel porte facilement plusieurs milliers
    // de lignes, une requête par ligne serait intenable.
    for (const tranche of decouper(tousResultats, 500)) {
      const valeurs = tranche.map(
        (r) => Prisma.sql`(${r.id}::text, ${r.prixUnitaireHtFinal}::bigint, ${r.montantHt}::bigint)`,
      )
      await tx.$executeRaw`
        UPDATE poste AS p
        SET prix_unitaire_ht_final = v.pu, montant_ht = v.montant
        FROM (VALUES ${Prisma.join(valeurs)}) AS v(id, pu, montant)
        WHERE p.id = v.id
      `
    }

    for (const lot of totauxLots) {
      await tx.lot.update({ where: { id: lot.id }, data: { montantEstimeHt: lot.total } })
    }
  })
}

function decouper<T>(liste: readonly T[], taille: number): T[][] {
  const tranches: T[][] = []
  for (let i = 0; i < liste.length; i += taille) tranches.push(liste.slice(i, i + taille))
  return tranches
}

/** Aplatit l'arbre dans l'ordre d'affichage, en portant la profondeur. */
function aplatir(postes: readonly PosteBrut[]): PosteDTO[] {
  const enfantsDe = new Map<string | null, PosteBrut[]>()
  for (const poste of postes) {
    const liste = enfantsDe.get(poste.parentId) ?? []
    liste.push(poste)
    enfantsDe.set(poste.parentId, liste)
  }
  for (const liste of enfantsDe.values()) liste.sort((a, b) => a.ordre - b.ordre)

  const plat: PosteDTO[] = []
  function descendre(parentId: string | null, profondeur: number): void {
    for (const poste of enfantsDe.get(parentId) ?? []) {
      plat.push({
        id: poste.id,
        parentId: poste.parentId,
        type: poste.type,
        ordre: poste.ordre,
        profondeur,
        code: poste.code,
        designation: poste.designation,
        unite: poste.unite,
        quantite: texte(poste.quantite),
        prixUnitaireHtBase: poste.prixUnitaireHtBase === null ? null : poste.prixUnitaireHtBase.toString(),
        coefficientApplique: texte(poste.coefficientApplique),
        prixUnitaireHtFinal:
          poste.prixUnitaireHtFinal === null ? null : poste.prixUnitaireHtFinal.toString(),
        montantHt: poste.montantHt.toString(),
        sourcePrix: poste.sourcePrix,
        dateSourcePrix: poste.dateSourcePrix?.toISOString() ?? null,
        aTexteCctp: poste.texteCctp !== null,
        aMetre: (poste._count?.lignesMetre ?? 0) > 0,
      })
      descendre(poste.id, profondeur + 1)
    }
  }
  descendre(null, 0)
  return plat
}

export function missionVersDTO(mission: {
  id: string
  reference: string
  nomOperation: string
  maitreOuvrage: string | null
  maitreOeuvre: string | null
  typeOuvrage: string
  nature: string
  typeMarche: string
  surfaceShon: Prisma.Decimal | null
  surfaceUtile: Prisma.Decimal | null
  budgetPrevisionnelHt: bigint | null
  phasesContractuelles: string[]
  dateDebut: Date | null
  dateFinPrevue: Date | null
  statut: string
  honorairesMissionHt: bigint | null
  modeFacturation: string | null
  coefficientLocalDefaut: Prisma.Decimal
  precisionPu: number
  tauxTva: Prisma.Decimal
  seuilDerivePourcent: Prisma.Decimal
}): MissionDTO {
  return {
    id: mission.id,
    reference: mission.reference,
    nomOperation: mission.nomOperation,
    maitreOuvrage: mission.maitreOuvrage,
    maitreOeuvre: mission.maitreOeuvre,
    typeOuvrage: mission.typeOuvrage,
    nature: mission.nature,
    typeMarche: mission.typeMarche,
    surfaceShon: texte(mission.surfaceShon),
    surfaceUtile: texte(mission.surfaceUtile),
    budgetPrevisionnelHt: mission.budgetPrevisionnelHt?.toString() ?? null,
    phasesContractuelles: mission.phasesContractuelles,
    dateDebut: mission.dateDebut?.toISOString() ?? null,
    dateFinPrevue: mission.dateFinPrevue?.toISOString() ?? null,
    statut: mission.statut,
    honorairesMissionHt: mission.honorairesMissionHt?.toString() ?? null,
    modeFacturation: mission.modeFacturation,
    coefficientLocalDefaut: mission.coefficientLocalDefaut.toString(),
    precisionPu: mission.precisionPu,
    tauxTva: mission.tauxTva.toString(),
    seuilDerivePourcent: mission.seuilDerivePourcent.toString(),
  }
}

/** Charge le chiffrage complet d'une mission, prêt à traverser vers le navigateur. */
export async function chargerChiffrage(client: PrismaClient, missionId: string): Promise<ChiffrageDTO> {
  const mission = await client.mission.findUnique({ where: { id: missionId } })
  if (!mission) throw new MissionIntrouvable(missionId)

  const lots = await client.lot.findMany({
    where: { missionId },
    orderBy: [{ ordre: 'asc' }, { numero: 'asc' }],
    include: { postes: { include: { _count: { select: { lignesMetre: true } } } } },
  })

  const lotsDTO: LotDTO[] = lots.map((lot) => ({
    id: lot.id,
    numero: lot.numero,
    intitule: lot.intitule,
    ordre: lot.ordre,
    corpsEtatId: lot.corpsEtatId,
    coefficientLocal: texte(lot.coefficientLocal),
    montantEstimeHt: lot.montantEstimeHt.toString(),
    postes: aplatir(lot.postes as unknown as PosteBrut[]),
  }))

  const recap = recapituler(
    lots.map((lot) => ({
      lotId: lot.id,
      numero: lot.numero,
      intitule: lot.intitule,
      montantHt: Money.depuisCentimes(lot.montantEstimeHt),
    })),
    texte(mission.surfaceShon) ?? texte(mission.surfaceUtile),
  )

  const recapitulatif: RecapitulatifDTO = {
    lots: recap.lots.map((l) => ({
      lotId: l.lotId,
      numero: l.numero,
      intitule: l.intitule,
      montantHt: (l.montantHt as bigint).toString(),
      partPourcent: l.partPourcent?.toString() ?? null,
    })),
    totalTceHt: (recap.totalTceHt as bigint).toString(),
    ratioEuroParM2: recap.ratioEuroParM2?.toString() ?? null,
  }

  return { mission: missionVersDTO(mission), lots: lotsDTO, recapitulatif }
}

function decimalOuNull(valeur: string | null | undefined): Prisma.Decimal | null {
  if (valeur === null || valeur === undefined) return null
  const nettoye = valeur.trim().replace(',', '.')
  if (nettoye === '') return null
  return new Prisma.Decimal(nettoye)
}

function entierOuNull(valeur: string | null | undefined): bigint | null {
  if (valeur === null || valeur === undefined) return null
  const nettoye = valeur.trim()
  if (nettoye === '') return null
  return BigInt(nettoye)
}

/**
 * Enregistre un lot de modifications venues de la grille, puis recalcule.
 * L'écriture et le recalcul sont dans la même transaction logique : on ne peut
 * pas se retrouver avec des lignes à jour et des totaux périmés.
 */
export async function enregistrerModifications(
  client: PrismaClient,
  missionId: string,
  modifications: readonly ModificationPoste[],
): Promise<ChiffrageDTO> {
  const mission = await client.mission.findUnique({ where: { id: missionId }, select: { id: true } })
  if (!mission) throw new MissionIntrouvable(missionId)

  if (modifications.length > 0) {
    const identifiants = modifications.map((m) => m.id)
    const autorises = await client.poste.findMany({
      where: { id: { in: identifiants }, lot: { missionId } },
      select: { id: true },
    })
    const ensemble = new Set(autorises.map((p) => p.id))
    const refuses = identifiants.filter((id) => !ensemble.has(id))
    if (refuses.length > 0) {
      throw new Error(`Postes hors de la mission : ${refuses.join(', ')}`)
    }

    // Une quantité calculée par un métré ne se retape pas : les deux valeurs
    // divergeraient en silence, et c'est le métré qui gagnerait au recalcul
    // suivant. Mieux vaut le dire que le laisser arriver.
    const quantitesDemandees = modifications.filter((m) => m.quantite !== undefined).map((m) => m.id)
    if (quantitesDemandees.length > 0) {
      const metres = await client.poste.findMany({
        where: { id: { in: quantitesDemandees }, lignesMetre: { some: {} } },
        select: { designation: true },
      })
      if (metres.length > 0) throw new QuantiteCalculee(metres.map((p) => p.designation))
    }

    const avant = await client.poste.findMany({
      where: { id: { in: identifiants } },
      select: { id: true, ...CHAMPS_SUIVIS },
    })

    await client.$transaction(
      modifications.map((m) => {
        const donnees: Prisma.PosteUpdateInput = {}
        if (m.code !== undefined) donnees.code = m.code === '' ? null : m.code
        if (m.designation !== undefined) donnees.designation = m.designation
        if (m.unite !== undefined) {
          donnees.unite =
            m.unite === null || m.unite === ''
              ? null
              : (m.unite as NonNullable<Prisma.PosteUpdateInput['unite']>)
        }
        if (m.quantite !== undefined) donnees.quantite = decimalOuNull(m.quantite)
        if (m.prixUnitaireHtBase !== undefined) donnees.prixUnitaireHtBase = entierOuNull(m.prixUnitaireHtBase)
        if (m.coefficientApplique !== undefined) donnees.coefficientApplique = decimalOuNull(m.coefficientApplique)
        return client.poste.update({ where: { id: m.id }, data: donnees })
      }),
    )

    // Le journal compare l'état réel avant et après, plutôt que ce qui a été
    // demandé : une valeur rejetée à la conversion ne doit pas y figurer.
    const apres = await client.poste.findMany({
      where: { id: { in: identifiants } },
      select: { id: true, ...CHAMPS_SUIVIS },
    })
    const parId = new Map(avant.map((poste) => [poste.id, poste]))

    const entrees: EntreeAudit[] = []
    for (const poste of apres) {
      const precedent = parId.get(poste.id)
      if (!precedent) continue
      const ecart = difference(
        precedent as unknown as Record<string, unknown>,
        poste as unknown as Record<string, unknown>,
      )
      if (ecart) {
        entrees.push({
          entite: 'Poste',
          entiteId: poste.id,
          action: 'MODIFICATION',
          avant: ecart.avant,
          apres: ecart.apres,
        })
      }
    }
    await journaliserPlusieurs(client, entrees)
  }

  await recalculerMission(client, missionId)
  return chargerChiffrage(client, missionId)
}
