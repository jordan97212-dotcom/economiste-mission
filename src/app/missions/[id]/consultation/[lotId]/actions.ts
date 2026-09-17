'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../../../../session'
import {
  creerConsultation,
  modifierConsultation,
  supprimerConsultation,
} from '../../../../../application/consultations/service'
import { preparerCourrielConsultation } from '../../../../../application/consultations/courriel'
import {
  enregistrerOffreGlobale,
  importerOffreDpgf,
  supprimerOffre,
} from '../../../../../application/offres/service'
import { enregistrerRapportBrouillon } from '../../../../../application/offres/rapport'

export interface EtatConsultation {
  readonly erreur?: string
  readonly succes?: string
  /** Brouillon de courriel à ouvrir dans la messagerie, le cas échéant. */
  readonly courriel?: {
    readonly adresse: string
    readonly corps: string
    readonly objet: string
    readonly anomalies: readonly string[]
    /** Faux quand il n'y a pas de destinataire : la messagerie ne s'ouvre pas. */
    readonly ouvrable: boolean
    /** Change à chaque préparation : sans cela, deux clics de suite sur la même
     *  entreprise rendraient un état identique et la messagerie ne s'ouvrirait
     *  qu'une fois. */
    readonly jeton: string
  }
}

function lire(donnees: FormData, cle: string): string {
  return String(donnees.get(cle) ?? '').trim()
}

const TYPES_OFFRE = ['BASE', 'VARIANTE', 'OPTION'] as const
type TypeOffreSaisi = (typeof TYPES_OFFRE)[number]

/** Lit la nature de l'offre. Une valeur inattendue retombe sur la base. */
function lireTypeOffre(donnees: FormData): TypeOffreSaisi {
  const brut = String(donnees.get('type') ?? '')
  return (TYPES_OFFRE as readonly string[]).includes(brut) ? (brut as TypeOffreSaisi) : 'BASE'
}

function lireDateFormulaire(donnees: FormData, cle: string): Date | null {
  const brut = lire(donnees, cle)
  if (brut === '') return null
  const date = new Date(brut)
  return Number.isNaN(date.getTime()) ? null : date
}

function chemin(missionId: string, lotId: string): string {
  return `/missions/${missionId}/consultation/${lotId}`
}

export async function actionCreerConsultation(
  _precedent: EtatConsultation,
  donnees: FormData,
): Promise<EtatConsultation> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const lotId = lire(donnees, 'lotId')
  try {
    await creerConsultation(db, missionId, {
      lotId,
      entrepriseId: lire(donnees, 'entrepriseId'),
      dateEnvoiDce: lireDateFormulaire(donnees, 'dateEnvoiDce'),
      dateLimiteRemise: lireDateFormulaire(donnees, 'dateLimiteRemise'),
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Création impossible.' }
  }
  revalidatePath(chemin(missionId, lotId))
  return { succes: 'Entreprise ajoutée à la consultation.' }
}

export async function actionModifierConsultation(
  _precedent: EtatConsultation,
  donnees: FormData,
): Promise<EtatConsultation> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const lotId = lire(donnees, 'lotId')
  try {
    await modifierConsultation(db, lire(donnees, 'id'), {
      desiste: lire(donnees, 'desiste') === 'oui',
      dateEnvoiDce: lireDateFormulaire(donnees, 'dateEnvoiDce'),
      dateLimiteRemise: lireDateFormulaire(donnees, 'dateLimiteRemise'),
      dateRelance: lireDateFormulaire(donnees, 'dateRelance'),
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Modification impossible.' }
  }
  revalidatePath(chemin(missionId, lotId))
  return { succes: 'Consultation mise à jour.' }
}

export async function actionPreparerCourriel(
  _precedent: EtatConsultation,
  donnees: FormData,
): Promise<EtatConsultation> {
  const { db, utilisateur } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const lotId = lire(donnees, 'lotId')
  try {
    const brouillon = await preparerCourrielConsultation(db, missionId, lire(donnees, 'id'), {
      signature: utilisateur.nom,
      // Aucun hébergement n'est encore configuré : le dossier voyage en pièce
      // jointe, et le brouillon le dit. Le jour où un lien existe, il se pose ici.
      lienDossier: null,
    })
    revalidatePath(chemin(missionId, lotId))
    return {
      courriel: {
        adresse: brouillon.adresse,
        corps: brouillon.corps,
        objet: brouillon.objet,
        anomalies: brouillon.anomalies,
        ouvrable: brouillon.destinataires.length > 0,
        jeton: `${Date.now()}`,
      },
    }
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Brouillon impossible.' }
  }
}

export async function actionSupprimerConsultation(
  _precedent: EtatConsultation,
  donnees: FormData,
): Promise<EtatConsultation> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const lotId = lire(donnees, 'lotId')
  try {
    await supprimerConsultation(db, lire(donnees, 'id'))
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Suppression impossible.' }
  }
  revalidatePath(chemin(missionId, lotId))
  return { succes: 'Consultation retirée.' }
}

export async function actionEnregistrerOffreGlobale(
  _precedent: EtatConsultation,
  donnees: FormData,
): Promise<EtatConsultation> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const lotId = lire(donnees, 'lotId')
  const dateReception = lireDateFormulaire(donnees, 'dateReception')
  if (!dateReception) return { erreur: 'La date de réception est nécessaire.' }

  try {
    const remise = lire(donnees, 'remiseGlobaleHt')
    await enregistrerOffreGlobale(db, missionId, lire(donnees, 'consultationId'), {
      type: lireTypeOffre(donnees),
      libelle: lire(donnees, 'libelle') || null,
      montantHt: lire(donnees, 'montantHt'),
      ...(remise ? { remiseGlobaleHt: remise } : {}),
      dateReception,
      conforme: donnees.get('conforme') === 'on',
      observationsTechniques: lire(donnees, 'observationsTechniques') || null,
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Enregistrement impossible.' }
  }
  revalidatePath(chemin(missionId, lotId))
  return { succes: 'Offre enregistrée.' }
}

export async function actionImporterOffreExcel(
  _precedent: EtatConsultation,
  donnees: FormData,
): Promise<EtatConsultation> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const lotId = lire(donnees, 'lotId')
  const dateReception = lireDateFormulaire(donnees, 'dateReception')
  if (!dateReception) return { erreur: 'La date de réception est nécessaire.' }

  const fichier = donnees.get('fichier')
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { erreur: 'Aucun fichier reçu.' }
  }
  if (fichier.size > 25 * 1024 * 1024) {
    return { erreur: 'Fichier trop volumineux : 25 Mo au maximum.' }
  }

  try {
    const contenu = Buffer.from(await fichier.arrayBuffer())
    const remiseExcel = lire(donnees, 'remiseGlobaleHt')
    const resultat = await importerOffreDpgf(db, missionId, lire(donnees, 'consultationId'), contenu, {
      type: lireTypeOffre(donnees),
      libelle: lire(donnees, 'libelle') || null,
      dateReception,
      ...(remiseExcel ? { remiseGlobaleHt: remiseExcel } : {}),
      conforme: donnees.get('conforme') === 'on',
      observationsTechniques: lire(donnees, 'observationsTechniques') || null,
    })
    revalidatePath(chemin(missionId, lotId))

    const mentionsIgnorees =
      resultat.nbNonRenseignees + resultat.nbIllisibles > 0
        ? ` ${resultat.nbNonRenseignees} poste(s) non renseigné(s), ${resultat.nbIllisibles} illisible(s).`
        : ''
    return {
      succes: `${resultat.nbLignes} ligne(s) reprise(s), total ${resultat.montantHt} HT.${mentionsIgnorees}`,
    }
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Import impossible.' }
  }
}

export async function actionSupprimerOffre(
  _precedent: EtatConsultation,
  donnees: FormData,
): Promise<EtatConsultation> {
  const { db } = await contexte()
  const missionId = lire(donnees, 'missionId')
  const lotId = lire(donnees, 'lotId')
  try {
    await supprimerOffre(db, missionId, lire(donnees, 'offreId'))
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Suppression impossible.' }
  }
  revalidatePath(chemin(missionId, lotId))
  return { succes: 'Offre retirée.' }
}

export interface EtatBrouillon {
  readonly erreur?: string
}

export async function actionEnregistrerBrouillon(
  missionId: string,
  lotId: string,
  contenu: string,
): Promise<EtatBrouillon> {
  const { db } = await contexte()
  try {
    await enregistrerRapportBrouillon(db, missionId, lotId, contenu)
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Enregistrement impossible.' }
  }
  return {}
}
