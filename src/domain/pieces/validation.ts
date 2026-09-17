/**
 * Pièces du dossier — SPEC_APP_ECONOMISTE.md §5.5, point 10.9.
 *
 * Plans, rapports de sol, diagnostics amiante, notices de sécurité : un dossier
 * de consultation ne se limite pas au CCTP et au bordereau. Ces pièces
 * arrivent d'ailleurs — d'un architecte, d'un bureau d'études — et l'économiste
 * les transmet aux entreprises sans les modifier.
 *
 * Ce module ne touche à aucun fichier. Il dit seulement ce qu'on accepte de
 * recevoir et sous quel nom on le range, et il se teste sans disque.
 */

export type CategoriePiece =
  | 'PLAN'
  | 'RAPPORT_ETUDE'
  | 'DIAGNOSTIC'
  | 'PIECE_ADMINISTRATIVE'
  | 'PHOTO'
  | 'AUTRE'

export const CATEGORIES: readonly CategoriePiece[] = [
  'PLAN',
  'RAPPORT_ETUDE',
  'DIAGNOSTIC',
  'PIECE_ADMINISTRATIVE',
  'PHOTO',
  'AUTRE',
]

export const LIBELLES_CATEGORIE: Record<CategoriePiece, string> = {
  PLAN: 'Plan',
  RAPPORT_ETUDE: 'Rapport d’étude',
  DIAGNOSTIC: 'Diagnostic',
  PIECE_ADMINISTRATIVE: 'Pièce administrative',
  PHOTO: 'Photo',
  AUTRE: 'Autre',
}

/** Sous-dossier de l'archive de consultation, par catégorie. */
export const DOSSIERS_CATEGORIE: Record<CategoriePiece, string> = {
  PLAN: '03-Plans',
  RAPPORT_ETUDE: '04-Rapports-etudes',
  DIAGNOSTIC: '05-Diagnostics',
  PIECE_ADMINISTRATIVE: '06-Pieces-administratives',
  PHOTO: '07-Photos',
  AUTRE: '08-Autres-pieces',
}

export function estCategorie(valeur: string): valeur is CategoriePiece {
  return (CATEGORIES as readonly string[]).includes(valeur)
}

/**
 * Extensions acceptées. Liste blanche et non liste noire : ce qu'on n'a pas
 * prévu est refusé, plutôt que stocké au cas où. Un dossier de consultation ne
 * contient pas d'exécutable.
 */
export const EXTENSIONS_ACCEPTEES: readonly string[] = [
  // Plans et dessins
  'pdf', 'dwg', 'dxf', 'dwf', 'ifc', 'rvt', 'skp',
  // Bureautique
  'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'rtf', 'txt', 'csv',
  // Images
  'jpg', 'jpeg', 'png', 'tif', 'tiff', 'heic', 'webp',
  // Regroupements
  'zip', '7z',
]

/** 200 Mo : un plan d'exécution en PDF vectoriel dépasse volontiers 50 Mo. */
export const TAILLE_MAXIMALE_OCTETS = 200 * 1024 * 1024

export type CodeRefusPiece =
  | 'nom_vide'
  | 'extension_absente'
  | 'extension_refusee'
  | 'fichier_vide'
  | 'trop_volumineux'

export interface RefusPiece {
  readonly code: CodeRefusPiece
  readonly message: string
}

export function extensionDe(nomFichier: string): string | null {
  const point = nomFichier.lastIndexOf('.')
  if (point <= 0 || point === nomFichier.length - 1) return null
  return nomFichier.slice(point + 1).toLowerCase()
}

/** Caractères interdits sous Windows, plus les caractères de contrôle. */
const CARACTERES_INTERDITS = new RegExp('[<>:"/\\\\|?*\\u0000-\\u001f]', 'g')

/**
 * Nettoie un nom de fichier venu de l'extérieur. Le résultat sert à
 * l'affichage et au nommage dans l'archive — **jamais** à construire un chemin
 * sur le disque : celui-ci est dérivé des identifiants, et d'eux seuls.
 */
export function assainirNomFichier(nomFichier: string): string {
  const base = nomFichier.replace(/\\/g, '/').split('/').pop() as string
  const nettoye = base
    .normalize('NFC')
    .replace(CARACTERES_INTERDITS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim()
  return nettoye.slice(0, 180)
}

export interface PieceADeposer {
  readonly nomFichier: string
  readonly tailleOctets: number
}

/** Renvoie le motif du refus, ou null si la pièce est acceptable. */
export function refuserDepot(piece: PieceADeposer): RefusPiece | null {
  const nom = assainirNomFichier(piece.nomFichier)
  if (nom === '') {
    return { code: 'nom_vide', message: 'Ce fichier n’a pas de nom exploitable.' }
  }

  const extension = extensionDe(nom)
  if (extension === null) {
    return {
      code: 'extension_absente',
      message: `« ${nom} » n’a pas d’extension : impossible de savoir de quel type de fichier il s’agit.`,
    }
  }
  if (!EXTENSIONS_ACCEPTEES.includes(extension)) {
    return {
      code: 'extension_refusee',
      message: `Les fichiers « .${extension} » ne sont pas acceptés dans un dossier de consultation.`,
    }
  }

  if (piece.tailleOctets <= 0) {
    return { code: 'fichier_vide', message: `« ${nom} » est vide.` }
  }
  if (piece.tailleOctets > TAILLE_MAXIMALE_OCTETS) {
    return {
      code: 'trop_volumineux',
      message: `« ${nom} » pèse ${formaterTaille(piece.tailleOctets)}, au-delà de la limite de ${formaterTaille(
        TAILLE_MAXIMALE_OCTETS,
      )}.`,
    }
  }

  return null
}

export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`
  if (octets < 1024 * 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
  return `${(octets / (1024 * 1024 * 1024)).toFixed(2)} Go`
}

export interface PieceANommer {
  readonly nomFichier: string
  readonly libelle: string | null
  readonly indice: string | null
}

/**
 * Nom de la pièce dans l'archive de consultation.
 *
 * L'indice d'un plan est ce qui distingue deux versions du même dessin : il
 * figure dans le nom, sans quoi l'entreprise qui reçoit deux envois successifs
 * ne sait pas lequel fait foi.
 */
export function nomDansArchive(piece: PieceANommer): string {
  const nom = assainirNomFichier(piece.nomFichier)
  const extension = extensionDe(nom)
  const sansExtension = extension === null ? nom : nom.slice(0, -(extension.length + 1))

  const base =
    piece.libelle !== null && piece.libelle.trim() !== ''
      ? assainirNomFichier(piece.libelle.trim())
      : sansExtension

  const indice =
    piece.indice !== null && piece.indice.trim() !== ''
      ? ` - Ind ${assainirNomFichier(piece.indice.trim())}`
      : ''

  const complet = `${base}${indice}`.trim().slice(0, 180)
  return extension === null ? complet : `${complet}.${extension}`
}
