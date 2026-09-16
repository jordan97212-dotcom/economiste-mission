import type { PrismaClient, TypeOffre as TypeOffrePrisma } from '@prisma/client'
import ExcelJS from 'exceljs'
import { dec } from '../../domain/money/decimal'
import * as Money from '../../domain/money/money'
import * as PU from '../../domain/money/prix-unitaire'
import { lireNombre } from '../saisie'
import { valeurEnTexte } from '../../infrastructure/excel/lecture'
import { journaliser } from '../audit/service'
import {
  construireComparatif,
  type OffreAComparer,
  type PosteComparatif,
  type TableauComparatif,
} from '../../domain/offres/comparatif'

/**
 * Offres reçues des entreprises — SPEC_APP_ECONOMISTE.md §5.5.
 *
 * Deux façons de saisir une offre : un montant global par lot, ou une reprise
 * ligne à ligne quand l'entreprise a rendu le DPGF « à remplir ». La seconde
 * s'appuie sur l'onglet technique `_identifiants` que l'export pose déjà :
 * chaque ligne se rattache à son poste par identifiant, jamais par un
 * rapprochement approximatif sur la désignation.
 */

export class ConsultationIntrouvable extends Error {
  constructor(id: string) {
    super(`Consultation introuvable ou hors de la mission : ${id}`)
    this.name = 'ConsultationIntrouvable'
  }
}

export class OffreIntrouvable extends Error {
  constructor(id: string) {
    super(`Offre introuvable : ${id}`)
    this.name = 'OffreIntrouvable'
  }
}

async function chargerConsultation(client: PrismaClient, missionId: string, consultationId: string) {
  const consultation = await client.consultation.findFirst({
    where: { id: consultationId, lot: { missionId } },
    include: { entreprise: { select: { raisonSociale: true } }, lot: { select: { id: true } } },
  })
  if (!consultation) throw new ConsultationIntrouvable(consultationId)
  return consultation
}

/* --------------------------------------------------------------------------
   Saisie d'une offre globale : un seul montant par lot.
   -------------------------------------------------------------------------- */

export interface EntreeOffreGlobale {
  readonly type?: TypeOffrePrisma
  readonly libelle?: string | null
  readonly montantHt: string
  readonly remiseGlobaleHt?: string
  readonly dateReception: Date
  readonly conforme?: boolean
  readonly observationsTechniques?: string | null
}

function lireMontant(brut: string, champ: string): bigint {
  const nombre = lireNombre(brut)
  if (nombre === null) throw new Error(`${champ} illisible : « ${brut} »`)
  return Money.depuisEuros(nombre) as bigint
}

export async function enregistrerOffreGlobale(
  client: PrismaClient,
  missionId: string,
  consultationId: string,
  entree: EntreeOffreGlobale,
): Promise<string> {
  const consultation = await chargerConsultation(client, missionId, consultationId)

  const montantHt = lireMontant(entree.montantHt, 'Montant de l’offre')
  const remiseGlobaleHt = entree.remiseGlobaleHt ? lireMontant(entree.remiseGlobaleHt, 'Remise globale') : 0n

  const offre = await client.offre.create({
    data: {
      consultationId,
      type: entree.type ?? 'BASE',
      libelle: entree.libelle?.trim() || null,
      montantHt,
      remiseGlobaleHt,
      dateReception: entree.dateReception,
      conforme: entree.conforme ?? true,
      observationsTechniques: entree.observationsTechniques?.trim() || null,
    },
    select: { id: true },
  })

  await client.consultation.update({
    where: { id: consultationId },
    data: { statut: 'OFFRE_RECUE', dateReceptionOffre: entree.dateReception },
  })

  await journaliser(client, {
    entite: 'Offre',
    entiteId: offre.id,
    action: 'CREATION',
    apres: {
      raisonSociale: consultation.entreprise.raisonSociale,
      montantHt: montantHt.toString(),
      remiseGlobaleHt: remiseGlobaleHt.toString(),
      conforme: entree.conforme ?? true,
    },
  })

  return offre.id
}

/* --------------------------------------------------------------------------
   Import d'une offre depuis le DPGF « à remplir » renvoyé par l'entreprise.
   -------------------------------------------------------------------------- */

export interface ResultatImportOffre {
  readonly offreId: string
  readonly nbLignes: number
  readonly nbNonRenseignees: number
  readonly nbIllisibles: number
  readonly montantHt: string
}

export async function importerOffreDpgf(
  client: PrismaClient,
  missionId: string,
  consultationId: string,
  contenu: Buffer,
  metadonnees: {
    readonly dateReception: Date
    readonly remiseGlobaleHt?: string
    readonly conforme?: boolean
    readonly observationsTechniques?: string | null
  },
): Promise<ResultatImportOffre> {
  const consultation = await chargerConsultation(client, missionId, consultationId)

  const mission = await client.mission.findUnique({ where: { id: missionId }, select: { precisionPu: true } })
  if (!mission) throw new Error(`Mission introuvable : ${missionId}`)

  const classeur = new ExcelJS.Workbook()
  await classeur.xlsx.load(contenu as unknown as ExcelJS.Buffer)

  const technique = classeur.getWorksheet('_identifiants')
  if (!technique) {
    throw new Error(
      'Ce classeur ne porte pas la correspondance de lignes attendue. Utilisez le fichier « à remplir » exporté par l’application, sans en modifier la structure.',
    )
  }

  const correspondances: { feuille: string; ligne: number; posteId: string }[] = []
  technique.eachRow((ligne, numero) => {
    if (numero === 1) return // en-tête
    const feuille = valeurEnTexte(ligne.getCell(1).value)
    const numeroLigne = Number(valeurEnTexte(ligne.getCell(2).value))
    const posteId = valeurEnTexte(ligne.getCell(3).value)
    if (feuille && posteId && Number.isInteger(numeroLigne)) {
      correspondances.push({ feuille, ligne: numeroLigne, posteId })
    }
  })

  const posteIds = correspondances.map((c) => c.posteId)
  const postes = await client.poste.findMany({
    where: { id: { in: posteIds }, lot: { missionId }, type: 'OUVRAGE' },
    select: { id: true, quantite: true },
  })
  const quantiteParPoste = new Map(postes.map((p) => [p.id, p.quantite]))

  let nbLignes = 0
  let nbNonRenseignees = 0
  let nbIllisibles = 0
  let montantTotal = Money.ZERO
  const lignesACreer: { posteId: string; prixUnitaireHt: bigint; montantHt: bigint }[] = []

  for (const correspondance of correspondances) {
    const quantite = quantiteParPoste.get(correspondance.posteId)
    // Sous-lot, poste hors mission, ou quantité manquante côté DPGF : rien à chiffrer ici.
    if (quantite === undefined || quantite === null) continue

    const feuille = classeur.getWorksheet(correspondance.feuille)
    const brut = feuille ? valeurEnTexte(feuille.getRow(correspondance.ligne).getCell(5).value) : ''

    if (brut.trim() === '') {
      nbNonRenseignees += 1
      continue
    }

    const nombre = lireNombre(brut)
    if (nombre === null) {
      // Une valeur illisible se signale, elle ne se devine pas : ni zéro, ni ignorée en silence.
      nbIllisibles += 1
      continue
    }

    const prixUnitaireFinal = PU.depuisEuros(nombre, mission.precisionPu)
    const montantLigne = Money.depuisEuros(dec(quantite.toString()).mul(PU.versEuros(prixUnitaireFinal)))

    lignesACreer.push({
      posteId: correspondance.posteId,
      prixUnitaireHt: prixUnitaireFinal as bigint,
      montantHt: montantLigne as bigint,
    })
    montantTotal = Money.ajouter(montantTotal, montantLigne)
    nbLignes += 1
  }

  if (nbLignes === 0) {
    throw new Error(
      'Aucune ligne de prix n’a pu être lue dans ce classeur. Vérifiez qu’il s’agit bien du fichier « à remplir » et que les prix ont été saisis dans la colonne prévue.',
    )
  }

  const remiseGlobaleHt = metadonnees.remiseGlobaleHt ? lireMontant(metadonnees.remiseGlobaleHt, 'Remise globale') : 0n

  const offre = await client.offre.create({
    data: {
      consultationId,
      type: 'BASE',
      montantHt: montantTotal as bigint,
      remiseGlobaleHt,
      dateReception: metadonnees.dateReception,
      conforme: metadonnees.conforme ?? true,
      observationsTechniques: metadonnees.observationsTechniques?.trim() || null,
      lignes: { createMany: { data: lignesACreer } },
    },
    select: { id: true },
  })

  await client.consultation.update({
    where: { id: consultationId },
    data: { statut: 'OFFRE_RECUE', dateReceptionOffre: metadonnees.dateReception },
  })

  // Une entrée de synthèse, comme pour un import de DPGF : le détail ligne à
  // ligne se relit depuis l'offre elle-même, pas depuis le journal.
  await journaliser(client, {
    entite: 'Offre',
    entiteId: offre.id,
    action: 'CREATION',
    apres: {
      raisonSociale: consultation.entreprise.raisonSociale,
      montantHt: (montantTotal as bigint).toString(),
      nbLignes,
    },
  })

  return {
    offreId: offre.id,
    nbLignes,
    nbNonRenseignees,
    nbIllisibles,
    montantHt: Money.formater(montantTotal),
  }
}

export async function supprimerOffre(client: PrismaClient, missionId: string, offreId: string): Promise<void> {
  const offre = await client.offre.findFirst({
    where: { id: offreId, consultation: { lot: { missionId } } },
    include: { consultation: { include: { entreprise: { select: { raisonSociale: true } } } } },
  })
  if (!offre) throw new OffreIntrouvable(offreId)

  await client.offre.delete({ where: { id: offreId } })

  const offresRestantes = await client.offre.count({ where: { consultationId: offre.consultationId } })
  if (offresRestantes === 0) {
    await client.consultation.update({
      where: { id: offre.consultationId },
      data: { statut: 'ENVOYEE', dateReceptionOffre: null },
    })
  }

  await journaliser(client, {
    entite: 'Offre',
    entiteId: offreId,
    action: 'SUPPRESSION',
    avant: {
      raisonSociale: offre.consultation.entreprise.raisonSociale,
      montantHt: offre.montantHt.toString(),
    },
  })
}

/* --------------------------------------------------------------------------
   Tableau comparatif
   -------------------------------------------------------------------------- */

export async function chargerTableauComparatif(
  client: PrismaClient,
  missionId: string,
  lotId: string,
): Promise<TableauComparatif> {
  const lot = await client.lot.findFirst({ where: { id: lotId, missionId }, select: { id: true } })
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)

  const [postesBruts, offresBrutes] = await Promise.all([
    client.poste.findMany({
      where: { lotId, type: 'OUVRAGE' },
      orderBy: { ordre: 'asc' },
      select: { id: true, code: true, designation: true, unite: true, montantHt: true },
    }),
    client.offre.findMany({
      where: { consultation: { lotId } },
      include: {
        consultation: { include: { entreprise: { select: { raisonSociale: true } } } },
        lignes: { select: { posteId: true, montantHt: true } },
      },
      orderBy: { dateReception: 'asc' },
    }),
  ])

  const postes: PosteComparatif[] = postesBruts.map((p) => ({
    posteId: p.id,
    code: p.code,
    designation: p.designation,
    unite: p.unite,
    montantEstimeHt: Money.depuisCentimes(p.montantHt),
  }))

  const offres: OffreAComparer[] = offresBrutes.map((o) => ({
    offreId: o.id,
    entrepriseNom: o.consultation.entreprise.raisonSociale,
    montantHt: Money.depuisCentimes(o.montantHt),
    remiseGlobaleHt: Money.depuisCentimes(o.remiseGlobaleHt),
    conforme: o.conforme,
    lignes: o.lignes.map((l) => ({ posteId: l.posteId, montantHt: Money.depuisCentimes(l.montantHt) })),
  }))

  return construireComparatif(postes, offres)
}
