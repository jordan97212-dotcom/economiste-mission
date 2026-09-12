import type { PrixUnitaire } from '../../domain/money/prix-unitaire'
import type { Decimal } from '../../domain/money/decimal'

/**
 * Port d'accès à une source de prix — SPEC_APP_ECONOMISTE.md §6.
 *
 * Une seule implémentation dans le MVP : la base de prix personnelle.
 * Une base tierce se branchera en ajoutant un adaptateur dans
 * `src/infrastructure/sources-prix/`, sans toucher au métier.
 */
export interface SourcePrix {
  readonly id: string
  readonly libelle: string
  rechercher(critere: CritereRecherchePrix): Promise<PropositionPrix[]>
}

export interface CritereRecherchePrix {
  /** Texte saisi dans la désignation de l'ouvrage. */
  readonly texte: string
  readonly corpsEtatId?: string | null
  readonly unite?: string | null
  /** Contexte de la mission en cours, pour classer les propositions. */
  readonly contexte?: ContextePrix | null
  readonly limite?: number
}

export interface ContextePrix {
  readonly typeOuvrage: string | null
  readonly nature: string | null
  readonly zone: string | null
}

export interface Dispersion {
  readonly minimum: PrixUnitaire
  readonly mediane: PrixUnitaire
  readonly maximum: PrixUnitaire
  readonly ecartRelatif: Decimal | null
}

export interface PropositionPrix {
  readonly sourceId: string
  readonly code: string | null
  readonly designation: string
  readonly unite: string
  readonly prixUnitaireHt: PrixUnitaire
  readonly dateReleve: Date
  readonly contexte: ContextePrix | null
  /**
   * Nombre d'entrées historiques derrière cette proposition. Le §5.2 impose de
   * dire quand l'historique est trop mince plutôt que d'afficher un chiffre
   * faussement précis : l'interface s'appuie sur ce compte.
   */
  readonly nbReferences: number
  /** Null quand la source ne sait pas la fournir. */
  readonly dispersion: Dispersion | null
}

/** En dessous de ce nombre de références, l'estimation n'est pas fiable (§5.2). */
export const SEUIL_FIABILITE_REFERENCES = 3
