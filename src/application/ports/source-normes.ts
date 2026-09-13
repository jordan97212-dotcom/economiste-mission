import type { StatutNorme } from '../../domain/normes/verification'

/**
 * Port d'accès à une source de statuts de normes.
 *
 * Même patron que `SourcePrix` : le métier ne connaît que cette interface, les
 * implémentations vivent dans `src/infrastructure/sources-normes/`.
 *
 * Pourquoi ce port n'a, et n'aura peut-être jamais, qu'une implémentation
 * automatique — il faut le dire ici plutôt que de le redécouvrir plus tard :
 *
 *   — l'AFNOR n'expose aucune API publique de son catalogue ;
 *   — les mentions légales de Norm'Info protègent la base par le droit d'auteur
 *     et par le droit « sui generis » des bases de données, et interdisent
 *     l'extraction répétée et systématique sans accord écrit ;
 *   — le contenu des DTU est vendu par l'AFNOR et le CSTB : il n'est ni
 *     récupérable ni redistribuable.
 *
 * L'application ne va donc rien aspirer. Elle tient le référentiel que
 * l'économiste entretient, et lui rend le travail de tenue à jour supportable :
 * elle sait quelles normes ses textes citent, laquelle n'a pas été revérifiée
 * depuis trop longtemps, et importe un relevé qu'il a constitué lui-même.
 *
 * Si un accès légitime s'ouvre un jour — abonnement AFNOR avec licence de
 * réutilisation, jeu de données publiques — il se branche ici, et rien d'autre
 * ne bouge.
 */
export interface SourceNormes {
  readonly id: string
  readonly libelle: string
  /** Ce que la source sait dire, pour que l'interface n'en promette pas plus. */
  readonly automatique: boolean
  /**
   * Rend ce que la source connaît des références demandées. Une référence
   * qu'elle ne connaît pas est absente du résultat : elle ne se devine pas.
   */
  consulter(references: readonly string[]): Promise<ReleveNorme[]>
}

export interface ReleveNorme {
  readonly reference: string
  readonly titre: string | null
  readonly statut: StatutNorme
  readonly dateEdition: Date | null
  readonly remplaceePar: string | null
  /** D'où vient ce relevé : « relevé manuel », « fichier du 12/09/2026 »… */
  readonly source: string
}
