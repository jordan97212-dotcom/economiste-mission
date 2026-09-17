/**
 * Brouillon de courriel de consultation — SPEC_APP_ECONOMISTE.md §5.5.
 *
 * L'application n'expédie rien : elle prépare le message et l'ouvre dans la
 * messagerie de l'économiste, qui relit, ajuste et envoie. Ce partage est
 * volontaire — l'envoi part de sa propre adresse, avec sa signature et son
 * accusé de réception, et il garde la main sur ce qui sort de chez lui.
 *
 * Reste une contrainte du procédé : un brouillon se transmet dans une adresse
 * `mailto:`, et les messageries tronquent les adresses trop longues. Un corps
 * coupé au milieu d'une phrase partirait sans que personne ne le remarque — on
 * mesure donc, et on prévient plutôt que de laisser faire (règle 7).
 */

/** Au-delà, les messageries commencent à tronquer — Outlook le premier. */
export const LONGUEUR_MAX_ADRESSE = 1800

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const

export interface EntreeBrouillon {
  readonly destinataires: readonly string[]
  readonly operation: string
  readonly lotNumero: string
  readonly lotIntitule: string
  readonly dateLimiteRemise: Date | null
  /** Adresse de téléchargement du dossier, quand il est déposé quelque part. */
  readonly lienDossier: string | null
  readonly signature: string | null
}

export interface Brouillon {
  readonly destinataires: readonly string[]
  readonly objet: string
  readonly corps: string
  readonly adresse: string
  /** Ce que l'économiste doit savoir avant de cliquer. Jamais bloquant. */
  readonly anomalies: readonly string[]
}

/** Date en toutes lettres : « 15 septembre 2026 ». Sans ambiguïté jour/mois. */
export function dateEnToutesLettres(date: Date): string {
  return `${date.getUTCDate()} ${MOIS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * Une adresse plausible. On ne cherche pas à valider une adresse électronique —
 * personne n'y arrive — seulement à repérer la cellule qui n'en est visiblement
 * pas une, parce qu'un `mailto:` avec une adresse fautive échoue en silence.
 */
export function adressePlausible(valeur: string): boolean {
  const arobase = valeur.indexOf('@')
  if (arobase <= 0 || arobase !== valeur.lastIndexOf('@')) return false
  const domaine = valeur.slice(arobase + 1)
  return domaine.includes('.') && !domaine.startsWith('.') && !domaine.endsWith('.') && !/\s/.test(valeur)
}

export function objetConsultation(entree: EntreeBrouillon): string {
  return `Consultation — Lot ${entree.lotNumero} ${entree.lotIntitule} — ${entree.operation}`
}

export function corpsConsultation(entree: EntreeBrouillon): string {
  const lignes: string[] = ['Madame, Monsieur,', '']

  lignes.push(
    `Nous vous consultons pour le lot ${entree.lotNumero} — ${entree.lotIntitule} ` +
      `de l'opération « ${entree.operation} ».`,
    '',
  )

  if (entree.lienDossier) {
    lignes.push('Le dossier de consultation est à télécharger à l’adresse suivante :', entree.lienDossier, '')
  } else {
    // Sans lien, le dossier voyage en pièce jointe : on le dit dans le corps
    // plutôt que de laisser un message qui ne renvoie nulle part.
    lignes.push('Le dossier de consultation est joint au présent message.', '')
  }

  if (entree.dateLimiteRemise) {
    lignes.push(
      `Les offres sont attendues pour le ${dateEnToutesLettres(entree.dateLimiteRemise)}.`,
      '',
    )
  }

  lignes.push('Nous restons à votre disposition pour tout complément.', '', 'Cordialement,')
  if (entree.signature) lignes.push(entree.signature)

  return lignes.join('\n')
}

/**
 * Compose l'adresse `mailto:`. Les messageries attendent les séparateurs de
 * lignes en `%0A` : `encodeURIComponent` s'en charge, il ne faut surtout pas
 * assembler ces morceaux à la main.
 */
export function preparerBrouillon(entree: EntreeBrouillon): Brouillon {
  const anomalies: string[] = []

  const destinataires = entree.destinataires.map((d) => d.trim()).filter((d) => d.length > 0)
  if (destinataires.length === 0) {
    anomalies.push('Aucune adresse électronique : complétez la fiche de l’entreprise.')
  }
  for (const adresse of destinataires) {
    if (!adressePlausible(adresse)) {
      anomalies.push(`L’adresse « ${adresse} » ne ressemble pas à une adresse électronique.`)
    }
  }

  if (!entree.lienDossier) {
    anomalies.push('Aucun lien de téléchargement : pensez à joindre le dossier au message.')
  }

  const objet = objetConsultation(entree)
  const corps = corpsConsultation(entree)

  const adresse =
    `mailto:${destinataires.map(encodeURIComponent).join(',')}` +
    `?subject=${encodeURIComponent(objet)}` +
    `&body=${encodeURIComponent(corps)}`

  if (adresse.length > LONGUEUR_MAX_ADRESSE) {
    anomalies.push(
      'Le message est trop long pour être transmis à la messagerie : ' +
        'copiez le texte ci-dessous et collez-le dans un message vide.',
    )
  }

  return { destinataires, objet, corps, adresse, anomalies }
}
