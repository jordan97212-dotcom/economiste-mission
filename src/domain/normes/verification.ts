import { detecterCitations, type Citation } from './citation'

/**
 * Contrôle des normes citées dans les pièces écrites.
 *
 * L'application ne détient aucune norme : elle tient le référentiel que
 * l'économiste entretient, et confronte les textes à ce référentiel. Elle ne
 * corrige jamais un texte toute seule. Remplacer « NF DTU 20.1 » par une autre
 * référence change ce que le marché prescrit : c'est une décision technique,
 * elle appartient à l'économiste qui engage sa responsabilité.
 *
 * Fonction pure : aucune I/O, aucun appel réseau.
 */

export type StatutNorme = 'EN_VIGUEUR' | 'ANNULEE' | 'REMPLACEE' | 'PROJET'

export interface NormeConnue {
  readonly reference: string
  readonly titre: string | null
  readonly statut: StatutNorme
  /** Date d'édition ou de publication, si elle est connue. */
  readonly dateEdition: Date | null
  /** Date à laquelle le statut a été vérifié auprès d'une source. */
  readonly dateVerification: Date | null
  /** Pour une norme remplacée : par quoi. */
  readonly remplaceePar: string | null
}

export type CodeAnomalieNorme =
  | 'norme_annulee'
  | 'norme_remplacee'
  | 'norme_projet'
  | 'norme_inconnue'
  | 'statut_ancien'

export interface AnomalieNorme {
  readonly code: CodeAnomalieNorme
  readonly severite: 'bloquante' | 'avertissement'
  readonly reference: string
  readonly message: string
  readonly posteId: string
  readonly repere: string
  /** La référence de remplacement, quand la source en nomme une. */
  readonly remplacement: string | null
}

export interface TexteAVerifier {
  readonly posteId: string
  readonly repere: string
  readonly contenu: string
}

/**
 * Au-delà de ce délai, un statut vérifié n'engage plus grand-chose : une norme
 * peut avoir été annulée entre-temps. Dix-huit mois est un compromis entre le
 * rythme réel de révision des DTU et la charge de revérification.
 */
export const DELAI_REVERIFICATION_MOIS = 18

function moisEcoules(depuis: Date, jusqu: Date): number {
  return (
    (jusqu.getFullYear() - depuis.getFullYear()) * 12 +
    (jusqu.getMonth() - depuis.getMonth())
  )
}

function enFrancais(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Confronte les textes au référentiel. Rend une anomalie par couple
 * texte × norme problématique, jamais une correction.
 */
export function verifierNormes(
  textes: readonly TexteAVerifier[],
  referentiel: readonly NormeConnue[],
  aujourdhui: Date = new Date(),
): readonly AnomalieNorme[] {
  const connues = new Map(referentiel.map((norme) => [norme.reference, norme]))
  const anomalies: AnomalieNorme[] = []

  for (const texte of textes) {
    for (const citation of detecterCitations(texte.contenu)) {
      const anomalie = examiner(citation, connues.get(citation.reference), texte, aujourdhui)
      if (anomalie) anomalies.push(anomalie)
    }
  }

  return anomalies
}

function examiner(
  citation: Citation,
  norme: NormeConnue | undefined,
  texte: TexteAVerifier,
  aujourdhui: Date,
): AnomalieNorme | null {
  const commun = { reference: citation.reference, posteId: texte.posteId, repere: texte.repere }

  if (!norme) {
    return {
      ...commun,
      code: 'norme_inconnue',
      severite: 'avertissement',
      remplacement: null,
      message: `${citation.reference} est citée mais absente de votre référentiel : son statut n'est pas vérifié.`,
    }
  }

  if (norme.statut === 'ANNULEE') {
    return {
      ...commun,
      code: 'norme_annulee',
      severite: 'bloquante',
      remplacement: null,
      message: `${citation.reference} est annulée. La citer dans une pièce contractuelle prescrit un document qui n'existe plus.`,
    }
  }

  if (norme.statut === 'REMPLACEE') {
    return {
      ...commun,
      code: 'norme_remplacee',
      severite: 'avertissement',
      remplacement: norme.remplaceePar,
      message: norme.remplaceePar
        ? `${citation.reference} est remplacée par ${norme.remplaceePar}.`
        : `${citation.reference} est remplacée, sans que la référence de remplacement soit renseignée.`,
    }
  }

  if (norme.statut === 'PROJET') {
    return {
      ...commun,
      code: 'norme_projet',
      severite: 'avertissement',
      remplacement: null,
      message: `${citation.reference} est encore à l'état de projet : elle n'est pas opposable.`,
    }
  }

  // En vigueur, mais depuis quand le sait-on ?
  if (
    norme.dateVerification === null ||
    moisEcoules(norme.dateVerification, aujourdhui) >= DELAI_REVERIFICATION_MOIS
  ) {
    return {
      ...commun,
      code: 'statut_ancien',
      severite: 'avertissement',
      remplacement: null,
      message: norme.dateVerification
        ? `${citation.reference} est donnée en vigueur, mais son statut n'a pas été vérifié depuis le ${enFrancais(norme.dateVerification)}.`
        : `${citation.reference} est donnée en vigueur, sans date de vérification.`,
    }
  }

  return null
}

export interface SyntheseNormes {
  readonly citees: number
  readonly bloquantes: number
  readonly avertissements: number
  /** Références distinctes à revoir, pour un rappel court à l'écran. */
  readonly aRevoir: readonly string[]
}

export function synthetiserNormes(
  textes: readonly TexteAVerifier[],
  anomalies: readonly AnomalieNorme[],
): SyntheseNormes {
  const citees = new Set<string>()
  for (const texte of textes) {
    for (const citation of detecterCitations(texte.contenu)) citees.add(citation.reference)
  }

  return {
    citees: citees.size,
    bloquantes: anomalies.filter((a) => a.severite === 'bloquante').length,
    avertissements: anomalies.filter((a) => a.severite === 'avertissement').length,
    aRevoir: [...new Set(anomalies.map((a) => a.reference))],
  }
}

/**
 * Les références citées dans les textes et absentes du référentiel. C'est de
 * quoi amorcer le référentiel à partir du travail déjà fait : sept ans de CCTP
 * contiennent déjà la liste des normes qui comptent pour ce métier.
 */
export function normesAAjouter(
  textes: readonly TexteAVerifier[],
  referentiel: readonly NormeConnue[],
): readonly Citation[] {
  const connues = new Set(referentiel.map((norme) => norme.reference))
  const manquantes = new Map<string, Citation>()

  for (const texte of textes) {
    for (const citation of detecterCitations(texte.contenu)) {
      if (!connues.has(citation.reference) && !manquantes.has(citation.reference)) {
        manquantes.set(citation.reference, citation)
      }
    }
  }

  return [...manquantes.values()]
}
