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
