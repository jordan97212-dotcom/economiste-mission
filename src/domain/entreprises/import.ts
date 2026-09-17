/**
 * Import d'un répertoire d'entreprises — SPEC_APP_ECONOMISTE.md §3 et §5.5.
 *
 * Recopier trente entreprises à la main est le genre de corvée qui décide, à
 * elle seule, si un outil sert ou prend la poussière. Ce module lit une grille
 * déjà découpée et en tire des entreprises.
 *
 * Il ne devine jamais en silence. Un SIRET dont la clé ne tombe pas juste, une
 * adresse qui ne ressemble pas à un courriel, une ligne sans nom : chacun
 * ressort nommé, avec son numéro de ligne. La valeur d'origine est conservée —
 * c'est ce que dit le fichier de l'économiste, et c'est à lui de trancher,
 * pas à l'application de corriger à sa place (règle 7).
 */

export const COLONNES_ENTREPRISE = [
  'raisonSociale',
  'siret',
  'contactNom',
  'email',
  'telephone',
  'corpsEtatQualifies',
  'zoneIntervention',
  'historiqueNotes',
] as const

export type ColonneEntreprise = (typeof COLONNES_ENTREPRISE)[number]

export const LIBELLES_COLONNE: Record<ColonneEntreprise, string> = {
  raisonSociale: 'Raison sociale',
  siret: 'SIRET',
  contactNom: 'Contact',
  email: 'Courriel',
  telephone: 'Téléphone',
  corpsEtatQualifies: 'Corps d’état',
  zoneIntervention: 'Zone d’intervention',
  historiqueNotes: 'Notes',
}

/** Sans raison sociale, une ligne ne désigne personne. */
export const COLONNES_OBLIGATOIRES: readonly ColonneEntreprise[] = ['raisonSociale']

export type MappageEntreprise = Partial<Record<ColonneEntreprise, number>>

/**
 * Devine le rôle de chaque colonne d'après l'en-tête. La proposition reste
 * corrigeable : elle n'est jamais imposée (règle 6).
 */
export function devinerMappage(entete: readonly string[]): MappageEntreprise {
  const motifs: Record<ColonneEntreprise, RegExp> = {
    raisonSociale: /(raison ?sociale|entreprise|soci[ée]t[ée]|nom de l|^nom$|d[ée]nomination|fournisseur)/i,
    siret: /(siret|siren|n[°o]? ?identification)/i,
    contactNom: /(contact|interlocuteur|responsable|g[ée]rant|repr[ée]sentant)/i,
    email: /(e-?mail|courriel|m[ée]l\b|adresse [ée]lectronique)/i,
    telephone: /(t[ée]l[ée]phone|t[ée]l\.?|portable|mobile|fixe|gsm)/i,
    corpsEtatQualifies: /(corps d.?[ée]tat|sp[ée]cialit|activit|m[ée]tier|qualification|lot)/i,
    zoneIntervention: /(zone|secteur|territoire|r[ée]gion|commune|ville|localit)/i,
    historiqueNotes: /(note|remarque|commentaire|observation|historique)/i,
  }

  const mappage: MappageEntreprise = {}
  const prises = new Set<number>()

  for (const [index, cellule] of entete.entries()) {
    const texte = cellule.trim()
    if (texte === '') continue
    for (const colonne of COLONNES_ENTREPRISE) {
      if (mappage[colonne] !== undefined) continue
      if (motifs[colonne].test(texte)) {
        mappage[colonne] = index
        prises.add(index)
        break
      }
    }
  }
  return mappage
}

/* --- Anomalies ------------------------------------------------------------ */

export type CodeAnomalieEntreprise =
  | 'ligne_sans_nom'
  | 'siret_longueur'
  | 'siret_cle'
  | 'email_improbable'
  | 'doublon_dans_le_fichier'

export interface AnomalieEntreprise {
  readonly code: CodeAnomalieEntreprise
  readonly ligne: number
  readonly message: string
}

/* --- Normalisations ------------------------------------------------------- */

/** Enlève tout ce qui n'est pas un chiffre : espaces, points, tirets. */
export function chiffresSeuls(valeur: string): string {
  return valeur.replace(/\D/g, '')
}

/**
 * Clé de Luhn du SIRET. La Poste fait exception : ses établissements
 * commencent par 356000000 et ne respectent pas la clé — c'est documenté par
 * l'INSEE, et refuser ces SIRET serait refuser des SIRET valides.
 */
export function siretValide(siret: string): boolean {
  const chiffres = chiffresSeuls(siret)
  if (chiffres.length !== 14) return false
  if (chiffres.startsWith('356000000')) return true

  let somme = 0
  for (let i = 0; i < chiffres.length; i += 1) {
    const depuisLaDroite = chiffres.length - i
    let valeur = Number(chiffres[i])
    if (depuisLaDroite % 2 === 0) {
      valeur *= 2
      if (valeur > 9) valeur -= 9
    }
    somme += valeur
  }
  return somme % 10 === 0
}

/** Une adresse plausible : quelque chose, une arobase, un domaine avec un point. */
export function emailPlausible(valeur: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valeur.trim())
}

/** Pour comparer deux raisons sociales sans s'arrêter à la casse ni aux accents. */
export function clefComparaison(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/** Les corps d'état arrivent groupés dans une seule cellule, séparés à la main. */
export function decouperCorpsEtat(valeur: string): string[] {
  return valeur
    .split(/[,;/|]/)
    .map((partie) => partie.trim())
    .filter((partie) => partie !== '')
}

/* --- Conversion des lignes ------------------------------------------------ */

export interface EntrepriseLue {
  /** Numéro de la ligne dans le fichier, tel que l'économiste le verra. */
  readonly ligne: number
  readonly raisonSociale: string
  readonly siret: string | null
  readonly contactNom: string | null
  readonly email: string | null
  readonly telephone: string | null
  readonly corpsEtatQualifies: readonly string[]
  readonly zoneIntervention: string | null
  readonly historiqueNotes: string | null
  /** Vrai quand une ligne antérieure du même fichier désigne déjà cette entreprise. */
  readonly doublonDansLeFichier: boolean
}

export interface AnalyseImport {
  readonly entreprises: readonly EntrepriseLue[]
  /** Lignes écartées : elles ne portent aucune raison sociale. */
  readonly lignesRejetees: number
  readonly anomalies: readonly AnomalieEntreprise[]
}

function cellule(ligne: readonly string[], index: number | undefined): string {
  if (index === undefined) return ''
  return (ligne[index] ?? '').trim()
}

function ouNull(valeur: string): string | null {
  return valeur === '' ? null : valeur
}

/**
 * Convertit le corps du fichier en entreprises.
 *
 * `decalageLigne` est le numéro de la première ligne du corps dans le fichier :
 * les anomalies doivent renvoyer à ce que l'économiste voit dans son tableur,
 * pas à un index interne.
 */
export function analyserLignes(
  corps: readonly (readonly string[])[],
  mappage: MappageEntreprise,
  decalageLigne = 2,
): AnalyseImport {
  const entreprises: EntrepriseLue[] = []
  const anomalies: AnomalieEntreprise[] = []
  let lignesRejetees = 0

  const vues = new Map<string, number>()

  for (const [index, brute] of corps.entries()) {
    const numeroLigne = index + decalageLigne

    const raisonSociale = cellule(brute, mappage.raisonSociale)
    if (raisonSociale === '') {
      lignesRejetees += 1
      anomalies.push({
        code: 'ligne_sans_nom',
        ligne: numeroLigne,
        message: 'Aucune raison sociale : la ligne est ignorée.',
      })
      continue
    }

    const siretBrut = cellule(brute, mappage.siret)
    let siret: string | null = null
    if (siretBrut !== '') {
      const chiffres = chiffresSeuls(siretBrut)
      siret = siretBrut
      if (chiffres.length !== 14) {
        anomalies.push({
          code: 'siret_longueur',
          ligne: numeroLigne,
          message: `« ${siretBrut} » ne fait pas quatorze chiffres : ce n’est pas un SIRET. La valeur est conservée telle quelle.`,
        })
      } else if (!siretValide(chiffres)) {
        anomalies.push({
          code: 'siret_cle',
          ligne: numeroLigne,
          message: `La clé de contrôle du SIRET « ${siretBrut} » ne tombe pas juste — un chiffre a pu être mal recopié. La valeur est conservée.`,
        })
      } else {
        // Normalisé une fois qu'il est reconnu : quatorze chiffres, sans habillage.
        siret = chiffres
      }
    }

    const email = cellule(brute, mappage.email)
    if (email !== '' && !emailPlausible(email)) {
      anomalies.push({
        code: 'email_improbable',
        ligne: numeroLigne,
        message: `« ${email} » ne ressemble pas à une adresse électronique. Colonnes inversées ?`,
      })
    }

    // Deux lignes désignent la même entreprise quand elles partagent un SIRET
    // lisible, ou à défaut une raison sociale.
    const chiffresSiret = siret === null ? '' : chiffresSeuls(siret)
    const clef =
      chiffresSiret.length === 14 ? `siret:${chiffresSiret}` : `nom:${clefComparaison(raisonSociale)}`
    const premiere = vues.get(clef)
    const doublonDansLeFichier = premiere !== undefined
    if (doublonDansLeFichier) {
      anomalies.push({
        code: 'doublon_dans_le_fichier',
        ligne: numeroLigne,
        message: `« ${raisonSociale} » figure déjà ligne ${premiere}. La seconde ne sera pas reprise.`,
      })
    } else {
      vues.set(clef, numeroLigne)
    }

    entreprises.push({
      ligne: numeroLigne,
      raisonSociale,
      siret,
      contactNom: ouNull(cellule(brute, mappage.contactNom)),
      email: ouNull(email),
      telephone: ouNull(cellule(brute, mappage.telephone)),
      corpsEtatQualifies: decouperCorpsEtat(cellule(brute, mappage.corpsEtatQualifies)),
      zoneIntervention: ouNull(cellule(brute, mappage.zoneIntervention)),
      historiqueNotes: ouNull(cellule(brute, mappage.historiqueNotes)),
      doublonDansLeFichier,
    })
  }

  return { entreprises, lignesRejetees, anomalies }
}
