import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import type { PrismaClient } from '@prisma/client'
import * as Money from '../../domain/money/money'
import * as PU from '../../domain/money/prix-unitaire'
import { chargerChiffrage } from '../chiffrage/service'
import { chargerTextes } from '../dce/service'
import { contenuDeTrame } from '../trames/service'
import { genererDpgfExcel } from '../../infrastructure/excel/dpgf-export'

/**
 * Export complet des données — SPEC_APP_ECONOMISTE.md §2.4.
 *
 * « L'utilisateur doit pouvoir sortir du logiciel à tout moment. » L'archive
 * contient donc tout, sous deux formes : lisible tout de suite dans un tableur
 * ou un éditeur de texte, et en JSON pour reprendre les données ailleurs sans
 * les ressaisir. Aucun format propriétaire, aucune dépendance à l'application.
 */

function nomSur(texte: string, defaut = 'sans-nom'): string {
  const propre = texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return propre || defaut
}

function jsonLisible(valeur: unknown): string {
  return JSON.stringify(
    valeur,
    (_cle, contenu) => (typeof contenu === 'bigint' ? contenu.toString() : contenu),
    2,
  )
}

async function classeurBasePrix(
  prix: readonly {
    code: string | null
    designation: string
    unite: string
    prixUnitaireHt: bigint
    dateReleve: Date
    zone: string
    corpsEtat: { code: string; libelle: string } | null
  }[],
): Promise<Buffer> {
  const classeur = new ExcelJS.Workbook()
  const feuille = classeur.addWorksheet('Base de prix')
  feuille.columns = [
    { header: 'Code', width: 16 },
    { header: 'Désignation', width: 60 },
    { header: 'Unité', width: 10 },
    { header: 'Prix unitaire HT', width: 18 },
    { header: 'Corps d’état', width: 32 },
    { header: 'Zone', width: 14 },
    { header: 'Date du relevé', width: 16 },
  ]
  feuille.getRow(1).font = { bold: true }

  for (const entree of prix) {
    feuille.addRow([
      entree.code ?? '',
      entree.designation,
      entree.unite,
      Number(PU.versEuros(PU.depuisStockage(entree.prixUnitaireHt))),
      entree.corpsEtat ? `${entree.corpsEtat.code} ${entree.corpsEtat.libelle}` : '',
      entree.zone,
      entree.dateReleve.toISOString().slice(0, 10),
    ])
  }

  feuille.getColumn(4).numFmt = '#,##0.00'
  return Buffer.from(await classeur.xlsx.writeBuffer())
}

export interface ResumeArchive {
  readonly nbMissions: number
  readonly nbPrix: number
  readonly nbTrames: number
  readonly nbEntreprises: number
  readonly octets: number
}

export interface ArchiveComplete {
  readonly fichier: Buffer
  readonly nom: string
  readonly resume: ResumeArchive
}

/** Construit l'archive de toutes les données du propriétaire connecté. */
export async function construireArchive(
  client: PrismaClient,
  identite: { email: string; nom: string | null },
): Promise<ArchiveComplete> {
  const zip = new JSZip()
  const maintenant = new Date()

  const [missions, prix, trames, entreprises, corpsEtats, journal] = await Promise.all([
    client.mission.findMany({ select: { id: true, reference: true, nomOperation: true } }),
    client.prixReference.findMany({
      orderBy: { designation: 'asc' },
      include: { corpsEtat: { select: { code: true, libelle: true } } },
    }),
    client.trame.findMany({ include: { corpsEtat: { select: { code: true, libelle: true } } } }),
    client.entreprise.findMany(),
    client.corpsEtat.findMany({ orderBy: { ordre: 'asc' } }),
    client.journalAudit.findMany({ orderBy: { survenuLe: 'desc' }, take: 5000 }),
  ])

  // --- Missions : le bordereau en Excel, et tout le détail en JSON ---
  for (const mission of missions) {
    const dossier = `missions/${nomSur(`${mission.reference}-${mission.nomOperation}`)}`
    const chiffrage = await chargerChiffrage(client, mission.id)
    const textes = await chargerTextes(client, mission.id)

    zip.file(`${dossier}/dpgf.xlsx`, await genererDpgfExcel(chiffrage, { variante: 'avec-prix' }))
    zip.file(
      `${dossier}/mission.json`,
      jsonLisible({
        mission: chiffrage.mission,
        lots: chiffrage.lots,
        recapitulatif: chiffrage.recapitulatif,
        textesCctp: Object.fromEntries(
          [...textes].map(([posteId, texte]) => [posteId, texte.contenu]),
        ),
      }),
    )

    // Les textes de CCTP aussi en fichiers lisibles, un par ouvrage.
    for (const lot of chiffrage.lots) {
      for (const poste of lot.postes) {
        const texte = textes.get(poste.id)
        if (!texte || texte.contenu.trim() === '') continue
        const nomFichier = nomSur(`${poste.code ?? ''}-${poste.designation}`, poste.id)
        zip.file(`${dossier}/cctp/${nomSur(lot.numero)}/${nomFichier}.txt`, texte.contenu)
      }
    }
  }

  // --- Référentiels ---
  zip.file('base-prix/base-prix.xlsx', await classeurBasePrix(prix))
  zip.file('base-prix/base-prix.json', jsonLisible(prix))
  zip.file('referentiels/corps-etat.json', jsonLisible(corpsEtats))
  zip.file('referentiels/entreprises.json', jsonLisible(entreprises))

  for (const trame of trames) {
    const nomFichier = nomSur(`${trame.type}-${trame.intitule}`)
    zip.file(`trames/${nomFichier}.txt`, contenuDeTrame(trame.contenu))
  }
  zip.file('trames/trames.json', jsonLisible(trames))

  zip.file('journal-audit.json', jsonLisible(journal))

  const totalEstimatif = Money.somme(
    await Promise.all(
      missions.map(async (mission) => {
        const chiffrage = await chargerChiffrage(client, mission.id)
        return Money.depuisCentimes(chiffrage.recapitulatif.totalTceHt)
      }),
    ),
  )

  zip.file(
    'LISEZ-MOI.txt',
    [
      'Export complet de vos données',
      '=============================',
      '',
      `Compte : ${identite.nom ? `${identite.nom} (${identite.email})` : identite.email}`,
      `Export réalisé le ${maintenant.toLocaleString('fr-FR')}`,
      '',
      'Contenu de l’archive',
      '--------------------',
      `missions/            ${missions.length} opération(s), une par dossier`,
      '  dpgf.xlsx          le bordereau chiffré, ouvrable dans n’importe quel tableur',
      '  mission.json       toutes les données de l’opération, reprises telles quelles',
      '  cctp/              les textes descriptifs, un fichier texte par ouvrage',
      `base-prix/           ${prix.length} prix de référence, en Excel et en JSON`,
      `trames/              ${trames.length} trame(s) de pièce écrite, en texte brut`,
      'referentiels/        nomenclature des corps d’état et répertoire d’entreprises',
      'journal-audit.json   historique des modifications sur les entités financières',
      '',
      `Estimatif cumulé de toutes les opérations : ${Money.formater(totalEstimatif)} HT`,
      '',
      'Formats',
      '-------',
      'Rien ici n’a besoin de l’application pour être relu. Les montants des',
      'fichiers JSON sont en centimes entiers, et les prix unitaires en',
      'dix-millièmes d’euro, afin qu’aucun arrondi ne se perde à la lecture.',
    ].join('\n'),
  )

  const fichier = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))

  return {
    fichier,
    nom: `export-donnees-${maintenant.toISOString().slice(0, 10)}.zip`,
    resume: {
      nbMissions: missions.length,
      nbPrix: prix.length,
      nbTrames: trames.length,
      nbEntreprises: entreprises.length,
      octets: fichier.length,
    },
  }
}
