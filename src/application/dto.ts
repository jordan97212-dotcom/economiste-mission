/**
 * Objets de transfert entre le serveur et le navigateur.
 *
 * Les montants sont des `bigint` et les quantités des `Decimal` : ni l'un ni
 * l'autre ne traverse la frontière serveur vers client de React. Tout passe donc
 * en chaîne de caractères, jamais en nombre flottant, et se reconstruit de
 * l'autre côté avec les types exacts du domaine.
 */

export type TypePoste = 'SOUS_LOT' | 'OUVRAGE'

export interface MissionDTO {
  readonly id: string
  readonly reference: string
  readonly nomOperation: string
  readonly maitreOuvrage: string | null
  readonly maitreOeuvre: string | null
  readonly typeOuvrage: string
  readonly nature: string
  readonly typeMarche: string
  readonly surfaceShon: string | null
  readonly surfaceUtile: string | null
  readonly budgetPrevisionnelHt: string | null
  readonly phasesContractuelles: readonly string[]
  readonly dateDebut: string | null
  readonly dateFinPrevue: string | null
  readonly statut: string
  /** Date de mise sur l'étagère, nulle tant que la mission est active. */
  readonly archiveeLe: string | null
  readonly honorairesMissionHt: string | null
  readonly modeFacturation: string | null
  readonly coefficientLocalDefaut: string
  readonly precisionPu: number
  readonly tauxTva: string
  readonly seuilDerivePourcent: string
}

export interface LotDTO {
  readonly id: string
  readonly numero: string
  readonly intitule: string
  readonly ordre: number
  readonly corpsEtatId: string | null
  readonly coefficientLocal: string | null
  readonly montantEstimeHt: string
  readonly postes: readonly PosteDTO[]
}

export interface PosteDTO {
  readonly id: string
  readonly parentId: string | null
  readonly type: TypePoste
  readonly ordre: number
  readonly profondeur: number
  readonly code: string | null
  readonly designation: string
  readonly unite: string | null
  readonly quantite: string | null
  readonly prixUnitaireHtBase: string | null
  readonly coefficientApplique: string | null
  readonly prixUnitaireHtFinal: string | null
  readonly montantHt: string
  readonly sourcePrix: string
  readonly dateSourcePrix: string | null
  readonly aTexteCctp: boolean
  /** Vrai quand la quantité vient d'une feuille de métré, et non de la saisie. */
  readonly aMetre: boolean
}

export interface RecapitulatifDTO {
  readonly lots: readonly {
    readonly lotId: string
    readonly numero: string
    readonly intitule: string
    readonly montantHt: string
    readonly partPourcent: string | null
  }[]
  readonly totalTceHt: string
  readonly ratioEuroParM2: string | null
}

export interface ChiffrageDTO {
  readonly mission: MissionDTO
  readonly lots: readonly LotDTO[]
  readonly recapitulatif: RecapitulatifDTO
}

export interface CorpsEtatDTO {
  readonly id: string
  readonly code: string
  readonly libelle: string
  readonly ordre: number
  readonly masque: boolean
}

/** Une modification de poste envoyée par la grille au serveur. */
export interface ModificationPoste {
  readonly id: string
  readonly code?: string | null
  readonly designation?: string
  readonly unite?: string | null
  readonly quantite?: string | null
  readonly prixUnitaireHtBase?: string | null
  readonly coefficientApplique?: string | null
}

/* --- Métré — spec §5.2 ----------------------------------------------------- */

export interface SaisieLigneMetre {
  readonly type: 'MESURE' | 'RAPPEL'
  readonly libelle: string
  readonly deduction: boolean
  readonly nombre: string | null
  readonly longueur: string | null
  readonly largeur: string | null
  readonly hauteur: string | null
  readonly rappelRepereId: string | null
}

export interface LigneMetreDTO extends SaisieLigneMetre {
  readonly id: string
  readonly ordre: number
  /** Résultat de la ligne, ou null si elle n'est pas calculable. */
  readonly valeur: string | null
  readonly ignoree: boolean
}

export interface AnomalieMetreDTO {
  readonly code: string
  readonly ligneId: string | null
  readonly message: string
}

export interface RepereDTO {
  readonly id: string
  readonly nom: string
  readonly unite: string | null
  readonly ordre: number
  readonly valeur: string | null
  readonly degre: number | null
  /** Nombre de feuilles de métré qui le rappellent. */
  readonly emplois: number
  readonly anomalies: readonly AnomalieMetreDTO[]
}

export interface MetrePosteDTO {
  readonly posteId: string
  readonly designation: string
  readonly unite: string | null
  readonly lignes: readonly LigneMetreDTO[]
  readonly total: string | null
  /** Ce qui est réellement écrit dans le poste : null si le total est inexploitable. */
  readonly quantite: string | null
  readonly anomalies: readonly AnomalieMetreDTO[]
  /** Repères disponibles, pour proposer un rappel. */
  readonly reperes: readonly RepereDTO[]
}

export interface RepereDetailDTO extends RepereDTO {
  readonly lignes: readonly LigneMetreDTO[]
  readonly total: string | null
}

export interface OuvrageMetreDTO {
  readonly posteId: string
  readonly code: string | null
  readonly designation: string
  readonly unite: string | null
  /** Quantité réellement portée par le poste. */
  readonly quantite: string | null
  readonly total: string | null
  readonly lignes: readonly LigneMetreDTO[]
  readonly anomalies: readonly AnomalieMetreDTO[]
}

export interface LotMetreDTO {
  readonly lotId: string
  readonly numero: string
  readonly intitule: string
  readonly ouvrages: readonly OuvrageMetreDTO[]
}

export interface MetreMissionDTO {
  readonly reference: string
  readonly nomOperation: string
  readonly lots: readonly LotMetreDTO[]
  readonly reperes: readonly RepereDetailDTO[]
}

/* --- Pièces du dossier — spec §5.5, point 10.9 ----------------------------- */

export interface PieceJointeDTO {
  readonly id: string
  readonly nomFichier: string
  readonly libelle: string | null
  /** Indice de révision d'un plan. */
  readonly indice: string | null
  readonly categorie: string
  readonly typeMime: string
  readonly tailleOctets: number
  readonly empreinte: string
  readonly lotId: string | null
  readonly lotLibelle: string | null
  readonly inclureAuDce: boolean
  readonly deposeLe: string
}
