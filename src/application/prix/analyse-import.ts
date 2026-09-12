/**
 * Reconnaissance des colonnes d'un classeur de base de prix.
 * Sans entrée-sortie, pour que l'écran d'import s'en serve directement.
 */

export const COLONNES_BASE_PRIX = [
  'code',
  'designation',
  'unite',
  'prixUnitaireHt',
  'dateReleve',
  'corpsEtat',
  'zone',
] as const

export type ColonneBasePrix = (typeof COLONNES_BASE_PRIX)[number]

/** Correspondance colonne du fichier vers champ, par index de colonne. */
export type MappagePrix = Partial<Record<ColonneBasePrix, number>>

export interface AnomalieImport {
  readonly ligne: number
  readonly message: string
}

export interface ResultatImportPrix {
  readonly crees: number
  readonly ignores: number
  readonly anomalies: readonly AnomalieImport[]
}

/**
 * Devine le rôle de chaque colonne à partir de la ligne d'en-tête.
 * L'utilisateur reste libre de corriger : la proposition n'est jamais imposée.
 */
export function devinerMappagePrix(entete: readonly string[]): MappagePrix {
  const motifs: Record<ColonneBasePrix, RegExp> = {
    code: /^(code|r[ée]f|r[ée]f[ée]rence|n[°o]?)$/i,
    designation: /(d[ée]signation|libell[ée]|description|intitul[ée]|ouvrage)/i,
    unite: /^(unit[ée]|un\.?|u)$/i,
    prixUnitaireHt: /(prix|p\.?u\.?|tarif|montant unitaire)/i,
    dateReleve: /(date|relev[ée]|mise à jour)/i,
    corpsEtat: /(corps d.?[ée]tat|lot|m[ée]tier)/i,
    zone: /(zone|territoire|r[ée]gion)/i,
  }

  const mappage: MappagePrix = {}
  for (const [index, cellule] of entete.entries()) {
    const texte = cellule.trim()
    if (texte === '') continue
    for (const colonne of COLONNES_BASE_PRIX) {
      if (mappage[colonne] !== undefined) continue
      if (motifs[colonne].test(texte)) {
        mappage[colonne] = index
        break
      }
    }
  }
  return mappage
}
