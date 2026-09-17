import { Prisma, type PrismaClient } from '@prisma/client'
import * as Money from '../../domain/money/money'
import { creerTexte, estTexteStructure, estVide, type TexteStructure } from '../../domain/texte/structure'
import { chargerTableauComparatif } from './service'
import { genererRapportOffres } from '../../infrastructure/docx/rapport-offres'
import { journaliser } from '../audit/service'
import type { TableauComparatif } from '../../domain/offres/comparatif'

/**
 * Brouillon de rapport d'analyse — SPEC_APP_ECONOMISTE.md §5.5 : « à
 * compléter et valider par l'utilisateur ». Même stockage que le texte de
 * CCTP, pour la même raison : un texte structuré simple, modifiable, qui se
 * relit sans l'application.
 */

function lireBrouillon(valeur: Prisma.JsonValue | null): string {
  if (!estTexteStructure(valeur)) return ''
  return (valeur as TexteStructure).contenu
}

export async function chargerRapportBrouillon(client: PrismaClient, missionId: string, lotId: string): Promise<string> {
  const lot = await client.lot.findFirst({
    where: { id: lotId, missionId },
    select: { rapportOffresBrouillon: true },
  })
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)
  return lireBrouillon(lot.rapportOffresBrouillon)
}

export async function enregistrerRapportBrouillon(
  client: PrismaClient,
  missionId: string,
  lotId: string,
  contenu: string,
): Promise<void> {
  const lot = await client.lot.findFirst({ where: { id: lotId, missionId }, select: { id: true, numero: true } })
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)

  await client.lot.update({
    where: { id: lotId },
    data: {
      rapportOffresBrouillon: estVide(contenu)
        ? Prisma.DbNull
        : (creerTexte(contenu) as unknown as Prisma.InputJsonValue),
    },
  })

  await journaliser(client, {
    entite: 'RapportOffres',
    entiteId: lotId,
    action: 'MODIFICATION',
    apres: { longueur: contenu.length },
  })
}

/**
 * Un premier jet, à partir des chiffres du tableau. Jamais un rapport fini :
 * il ne désigne pas d'attributaire, et invite explicitement à être complété.
 */
export function genererBrouillonAutomatique(tableau: TableauComparatif): string {
  if (tableau.colonnes.length === 0) {
    return "## Constat\nAucune offre reçue pour ce lot à ce jour.\n\n## À compléter\nRédiger l'analyse une fois les offres reçues."
  }

  const lignes: string[] = ['## Constat']
  lignes.push(
    `${tableau.colonnes.length} offre(s) reçue(s), pour un estimatif de ${Money.formater(tableau.montantEstimeHt)} HT.`,
  )

  lignes.push('')
  lignes.push('## Offres reçues')
  for (const colonne of tableau.colonnes) {
    // Une option chiffre un complément : son écart vis-à-vis de l'estimatif
    // entier ne veut rien dire, et l'écrire tromperait le lecteur.
    const ecart = !colonne.ecartComparable
      ? 'écart sans objet pour une option'
      : colonne.ecart.pourcent !== null
        ? `${colonne.ecart.pourcent.greaterThan(0) ? '+' : ''}${colonne.ecart.pourcent.toFixed(2)} % vs estimatif`
        : 'écart non calculable'

    // La nature accompagne le nom : une même entreprise peut remettre une base
    // et deux variantes, et six lignes au même nom ne s'expliqueraient pas.
    const nature =
      colonne.type === 'BASE'
        ? ''
        : ` — ${colonne.type === 'VARIANTE' ? 'variante' : 'option'}${colonne.libelle ? ` « ${colonne.libelle} »` : ''}`

    lignes.push(
      `- ${colonne.entrepriseNom}${nature} : ${Money.formater(colonne.montantNetHt)} HT (${ecart})${colonne.conforme ? '' : ' — offre non conforme'}`,
    )
  }

  // Le classement vient du tableau, qui l'a déjà établi : le recalculer ici
  // reviendrait à tenir deux vérités, et c'est la seconde qui partirait au
  // maître d'ouvrage.
  const gagnante = tableau.colonnes.find((c) => c.moinsDisante)
  if (gagnante) {
    lignes.push('')
    lignes.push('## Mieux-disant')
    lignes.push(
      `${gagnante.entrepriseNom} présente le montant le plus bas parmi les offres de base conformes, à ${Money.formater(gagnante.montantNetHt)} HT.`,
    )

    const horsClassement = tableau.colonnes.filter((c) => c.conforme && !c.classee)
    if (horsClassement.length > 0) {
      lignes.push(
        `${horsClassement.length} offre(s) ne figurent pas au classement : une variante propose une autre façon de faire, une option chiffre un complément. Elles se jugent à part.`,
      )
    }
  }

  const anomalies = [
    ...tableau.anomaliesGlobales,
    ...tableau.lignes.flatMap((l) => l.anomalies),
  ]
  if (anomalies.length > 0) {
    lignes.push('')
    lignes.push('## Points de vigilance')
    lignes.push(
      `${anomalies.length} écart(s) signalé(s) automatiquement, à vérifier avant de conclure (voir le tableau).`,
    )
  }

  lignes.push('')
  lignes.push('## À compléter')
  lignes.push(
    "Cette synthèse est un point de départ. Le choix de l'attributaire, les conditions négociées et les réserves techniques restent à rédiger.",
  )

  return lignes.join('\n')
}

export async function genererDocumentRapport(
  client: PrismaClient,
  missionId: string,
  lotId: string,
): Promise<{ fichier: Buffer; nom: string }> {
  const [mission, lot, tableau, brouillon] = await Promise.all([
    client.mission.findUnique({ where: { id: missionId }, select: { reference: true, nomOperation: true } }),
    client.lot.findFirst({ where: { id: lotId, missionId }, select: { numero: true, intitule: true } }),
    chargerTableauComparatif(client, missionId, lotId),
    chargerRapportBrouillon(client, missionId, lotId),
  ])
  if (!mission) throw new Error(`Mission introuvable : ${missionId}`)
  if (!lot) throw new Error(`Lot hors de la mission : ${lotId}`)

  const fichier = await genererRapportOffres(
    {
      missionReference: mission.reference,
      nomOperation: mission.nomOperation,
      lotNumero: lot.numero,
      lotIntitule: lot.intitule,
      dateGeneration: new Date(),
    },
    tableau,
    brouillon,
  )

  const operation = mission.nomOperation
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  return { fichier, nom: `${mission.reference}-${operation}-Lot${lot.numero}-Analyse-offres.docx` }
}
