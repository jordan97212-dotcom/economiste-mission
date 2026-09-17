/**
 * Préparation du courriel de consultation.
 *
 * L'application ne se connecte à aucune messagerie : elle rassemble ce qu'elle
 * sait — l'entreprise, le lot, l'opération, l'échéance — et rend un brouillon
 * que la messagerie de l'économiste ouvrira. L'envoi part de son adresse, avec
 * sa signature et son accusé de réception : c'est lui qui engage sa
 * responsabilité, pas un serveur à sa place.
 */
import type { PrismaClient } from '@prisma/client'
import { preparerBrouillon, type Brouillon } from '../../domain/consultations/courriel'
import { journaliser } from '../audit/service'
import { ConsultationIntrouvable } from './service'

export interface DemandeBrouillon {
  readonly signature: string | null
  /**
   * Adresse de téléchargement du dossier, quand il est déposé quelque part.
   * Nulle tant qu'aucun hébergement n'est configuré : le brouillon annonce
   * alors une pièce jointe, et le rappelle en anomalie.
   */
  readonly lienDossier: string | null
}

/**
 * Compose le brouillon **et note l'envoi**. Les deux vont ensemble : l'économiste
 * clique, sa messagerie s'ouvre, le message part dans la foulée. Attendre une
 * confirmation qu'il n'a aucun moyen de donner laisserait le suivi vide alors
 * que le DCE est parti — et c'est ce suivi qui déclenche les relances.
 *
 * S'il renonce finalement à envoyer, la date reste modifiable sur l'écran :
 * une date qu'on peut corriger vaut mieux qu'une date qui manque.
 */
export async function preparerCourrielConsultation(
  client: PrismaClient,
  missionId: string,
  consultationId: string,
  demande: DemandeBrouillon,
): Promise<Brouillon> {
  const consultation = await client.consultation.findFirst({
    where: { id: consultationId, missionId },
    include: {
      entreprise: { select: { raisonSociale: true, email: true } },
      lot: { select: { numero: true, intitule: true } },
      mission: { select: { nomOperation: true } },
    },
  })
  if (!consultation) throw new ConsultationIntrouvable(consultationId)

  const brouillon = preparerBrouillon({
    destinataires: consultation.entreprise.email ? [consultation.entreprise.email] : [],
    operation: consultation.mission.nomOperation,
    lotNumero: consultation.lot.numero,
    lotIntitule: consultation.lot.intitule,
    dateLimiteRemise: consultation.dateLimiteRemise,
    lienDossier: demande.lienDossier,
    signature: demande.signature,
  })

  // Sans destinataire, rien ne partira : noter un envoi serait noter un fait qui
  // n'a pas eu lieu (règle 7). On rend le brouillon et ses anomalies, c'est tout.
  if (brouillon.destinataires.length === 0) return brouillon

  if (!consultation.dateEnvoiDce) {
    await client.consultation.update({
      where: { id: consultationId },
      data: { dateEnvoiDce: new Date() },
    })
    await journaliser(client, {
      entite: 'Consultation',
      entiteId: consultationId,
      action: 'MODIFICATION',
      apres: {
        envoiDce: 'courriel préparé',
        destinataire: brouillon.destinataires.join(', '),
      },
    })
  }

  return brouillon
}
