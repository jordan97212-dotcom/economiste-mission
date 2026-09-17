/**
 * Statut d'une consultation — SPEC_APP_ECONOMISTE.md §5.5.
 *
 * Le statut ne se saisit pas : il se déduit de faits déjà enregistrés — la date
 * d'envoi du DCE, la date limite de remise, la relance, les offres reçues. Un
 * statut rangé à côté de ces dates finit toujours par les contredire : jusqu'ici
 * supprimer une offre reposait « envoyée » sur une consultation dont la remise
 * était close depuis trois semaines, et le tableau de suivi affichait alors le
 * contraire des dates de la même ligne.
 *
 * Seul le désistement échappe à la déduction : une entreprise qui renonce le dit
 * par téléphone, et rien dans la base ne peut le deviner.
 */

export type StatutConsultation =
  | 'A_ENVOYER'
  | 'ENVOYEE'
  | 'RELANCEE'
  | 'OFFRE_RECUE'
  | 'SANS_REPONSE'
  | 'DESISTEMENT'

export interface FaitsConsultation {
  readonly dateEnvoiDce: Date | null
  readonly dateLimiteRemise: Date | null
  readonly dateRelance: Date | null
  readonly nbOffres: number
  /** Déclaré par l'économiste : l'entreprise a fait savoir qu'elle ne répondrait pas. */
  readonly desiste: boolean
}

export const LIBELLES: Readonly<Record<StatutConsultation, string>> = {
  A_ENVOYER: 'À envoyer',
  ENVOYEE: 'DCE envoyé',
  RELANCEE: 'Relancée',
  OFFRE_RECUE: 'Offre reçue',
  SANS_REPONSE: 'Sans réponse',
  DESISTEMENT: 'Désistement',
}

/**
 * Numéro du jour, en temps universel.
 *
 * Une date limite est un jour, pas un instant : une remise attendue le 15
 * septembre court jusqu'au soir du 15. Les dates de l'application sont posées et
 * relues en temps universel — c'est ainsi que les écrans les découpent avec
 * `toISOString()` — donc la comparaison se fait sur le même découpage, sinon une
 * consultation basculerait « sans réponse » avec quelques heures d'avance.
 */
function jour(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000)
}

/**
 * Le statut effectif. L'ordre des cas est celui de leur autorité : un fait
 * déclaré prime sur un fait déduit, et une offre reçue prime sur un calendrier.
 */
export function statutDe(faits: FaitsConsultation, aujourdhui: Date): StatutConsultation {
  if (faits.desiste) return 'DESISTEMENT'

  // Une offre arrivée après la date limite reste une offre reçue : c'est à
  // l'économiste de juger de sa recevabilité, pas à un statut de la trancher.
  if (faits.nbOffres > 0) return 'OFFRE_RECUE'

  if (!faits.dateEnvoiDce) return 'A_ENVOYER'

  if (faits.dateLimiteRemise && jour(aujourdhui) > jour(faits.dateLimiteRemise)) return 'SANS_REPONSE'

  if (faits.dateRelance) return 'RELANCEE'

  return 'ENVOYEE'
}

/**
 * Jours restants avant la remise : négatif une fois la date passée, `null` quand
 * aucune date limite n'est fixée. Sert à trier le suivi par urgence.
 */
export function joursAvantRemise(
  dateLimiteRemise: Date | null,
  aujourdhui: Date,
): number | null {
  if (!dateLimiteRemise) return null
  return jour(dateLimiteRemise) - jour(aujourdhui)
}
