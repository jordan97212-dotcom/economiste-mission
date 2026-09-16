/**
 * Mise en forme du journal d'audit pour l'écran — SPEC_APP_ECONOMISTE.md §7.
 *
 * Le journal stocke ce que le domaine manipule : des centimes, des dix-millièmes
 * d'euro, des identifiants techniques. L'économiste, lui, relit des euros et des
 * libellés français. La traduction vit ici, séparée de la page, parce qu'elle
 * touche à des montants et doit donc être vérifiable.
 */

export const LIBELLES_ENTITE: Record<string, string> = {
  Mission: 'Mission',
  Lot: 'Lot',
  Poste: 'Ligne de DPGF',
  Avenant: 'Avenant',
  TexteCctp: 'Texte de CCTP',
  Import: 'Import de DPGF',
  Norme: 'Norme ou DTU',
  Entreprise: 'Entreprise',
  Consultation: 'Consultation',
  Offre: 'Offre',
  RapportOffres: 'Rapport d’analyse des offres',
}

export const LIBELLES_ACTION: Record<string, string> = {
  CREATION: 'création',
  MODIFICATION: 'modification',
  SUPPRESSION: 'suppression',
}

export const LIBELLES_CHAMP: Record<string, string> = {
  code: 'code',
  designation: 'désignation',
  unite: 'unité',
  quantite: 'quantité',
  prixUnitaireHtBase: 'prix de base',
  coefficientApplique: 'coefficient',
  sourcePrix: 'source du prix',
  coefficientLocal: 'coefficient du lot',
  coefficientLocalDefaut: 'coefficient de la mission',
  precisionPu: 'décimales du prix unitaire',
  honorairesMissionHt: 'honoraires',
  budgetPrevisionnelHt: 'budget prévisionnel',
  surfaceShon: 'surface SHON',
  montantSupprimeHt: 'montant supprimé',
  postesSupprimes: 'postes supprimés',
  ouvragesImportes: 'ouvrages importés',
  sousLotsImportes: 'sous-lots importés',
  contenuRemplace: 'contenu remplacé',
  longueur: 'longueur du texte ou du brouillon',
  nomOperation: 'nom de l’opération',
  reference: 'référence',
  statut: 'statut',
  dupliqueeDepuis: 'dupliquée depuis',
  intitule: 'intitulé',
  numero: 'numéro',
  remplaceePar: 'remplacée par',
  referencesVersees: 'références versées au référentiel',
  raisonSociale: 'raison sociale',
  siret: 'SIRET',
  montantHt: 'montant',
  remiseGlobaleHt: 'remise globale',
  conforme: 'conforme',
  observationsTechniques: 'observations',
  dateEnvoiDce: 'envoi du DCE',
  dateLimiteRemise: 'date limite',
  dateReceptionOffre: 'réception de l’offre',
  nbLignes: 'lignes importées',
}

/**
 * Champs stockés en entier. Le prix unitaire de base est en dix-millièmes
 * d'euro, les autres en centimes : l'échelle n'est pas la même et les
 * confondre afficherait un prix cent fois trop grand.
 */
const CHAMPS_MONETAIRES: ReadonlyMap<string, { echelle: number; decimales: number }> = new Map([
  ['prixUnitaireHtBase', { echelle: 10_000, decimales: 4 }],
  ['honorairesMissionHt', { echelle: 100, decimales: 2 }],
  ['budgetPrevisionnelHt', { echelle: 100, decimales: 2 }],
  ['montantSupprimeHt', { echelle: 100, decimales: 2 }],
  ['montantHt', { echelle: 100, decimales: 2 }],
  ['remiseGlobaleHt', { echelle: 100, decimales: 2 }],
])

/** Rend une valeur du journal telle qu'un économiste la relit. */
export function valeurLisible(champ: string, valeur: unknown): string {
  if (valeur === null || valeur === undefined || valeur === '') return '—'
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non'

  const texte = String(valeur)

  const monnaie = CHAMPS_MONETAIRES.get(champ)
  if (monnaie && /^-?\d+$/.test(texte)) {
    // Division entière puis reste : un entier long ne passe pas par un flottant
    // sans risque de perdre ses derniers chiffres.
    const entier = BigInt(texte)
    const echelle = BigInt(monnaie.echelle)
    const negatif = entier < 0n
    const absolu = negatif ? -entier : entier
    const partieEntiere = absolu / echelle
    const reste = (absolu % echelle).toString().padStart(monnaie.decimales, '0')
    return `${negatif ? '-' : ''}${partieEntiere},${reste} €`
  }

  // Les nombres s'écrivent à la française. Un code d'ouvrage comme 13.03.01
  // n'est pas un nombre : ses points lui appartiennent et doivent rester.
  return /^-?\d+\.\d+$/.test(texte) ? texte.replace('.', ',') : texte
}

/** Résume en une ligne ce qui a changé, au plus cinq champs. */
export function resumerChangement(avant: unknown, apres: unknown): string {
  const champsAvant = (avant ?? {}) as Record<string, unknown>
  const champsApres = (apres ?? {}) as Record<string, unknown>
  const champs = [...new Set([...Object.keys(champsAvant), ...Object.keys(champsApres)])]

  if (champs.length === 0) return '—'

  return champs
    .slice(0, 5)
    .map((champ) => {
      const libelle = LIBELLES_CHAMP[champ] ?? champ
      const depuis = valeurLisible(champ, champsAvant[champ])
      const vers = valeurLisible(champ, champsApres[champ])
      if (Object.keys(champsAvant).length === 0) return `${libelle} : ${vers}`
      if (Object.keys(champsApres).length === 0) return `${libelle} : ${depuis}`
      return `${libelle} : ${depuis} → ${vers}`
    })
    .join(' · ')
}
