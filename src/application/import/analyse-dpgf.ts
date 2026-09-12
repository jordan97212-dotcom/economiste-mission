import * as PU from '../../domain/money/prix-unitaire'
import { lireNombre, lireQuantite, normaliserUnite } from '../saisie'

/**
 * Analyse d'un DPGF importé — partie sans aucune entrée-sortie.
 *
 * Ce module est volontairement pur : l'écran d'import s'en sert directement
 * dans le navigateur pour afficher l'aperçu à chaque changement de mappage,
 * et le serveur s'en sert pour écrire. Les deux voient donc exactement la
 * même chose, ce qui est la seule garantie sérieuse qu'un aperçu vaut quelque
 * chose sur un document contractuel.
 */

export const COLONNES_DPGF = ['code', 'designation', 'unite', 'quantite', 'prixUnitaireHt'] as const

export type ColonneDpgf = (typeof COLONNES_DPGF)[number]

export type MappageDpgf = Partial<Record<ColonneDpgf, number>>

export function devinerMappageDpgf(entete: readonly string[]): MappageDpgf {
  const motifs: Record<ColonneDpgf, RegExp> = {
    code: /^(code|n[°o]?|art\.?|article|rep[èe]re|r[ée]f\.?)$/i,
    designation: /(d[ée]signation|libell[ée]|description|intitul[ée]|ouvrage|nature des ouvrages)/i,
    unite: /^(unit[ée]s?|un\.?|u)$/i,
    quantite: /(quantit[ée]s?|qt[ée]?|qte)/i,
    prixUnitaireHt: /(prix\s*unitaire|p\.?\s*u\.?|pu\s*ht|prix ht)/i,
  }

  const mappage: MappageDpgf = {}
  for (const [index, cellule] of entete.entries()) {
    const texte = cellule.trim()
    if (texte === '') continue
    for (const colonne of COLONNES_DPGF) {
      if (mappage[colonne] !== undefined) continue
      if (motifs[colonne].test(texte)) {
        mappage[colonne] = index
        break
      }
    }
  }
  return mappage
}

export type SeveriteAnomalie = 'bloquante' | 'avertissement'

export interface AnomalieDpgf {
  readonly ligne: number
  readonly severite: SeveriteAnomalie
  readonly message: string
}

export interface LigneApercu {
  readonly ligne: number
  readonly type: 'SOUS_LOT' | 'OUVRAGE'
  readonly code: string | null
  readonly designation: string
  readonly unite: string | null
  readonly quantite: string | null
  /** Prix unitaire à l'échelle de stockage, en dix-millièmes d'euro. */
  readonly prixUnitaireHt: string | null
  readonly retenue: boolean
}

export interface Apercu {
  readonly lignes: readonly LigneApercu[]
  readonly anomalies: readonly AnomalieDpgf[]
  readonly nbOuvrages: number
  readonly nbSousLots: number
}

export interface OptionsAnalyse {
  readonly premiereLigne?: number
  readonly precisionPu?: number
}

/**
 * Analyse la grille sans rien écrire. Sert à l'écran d'aperçu, et le même
 * résultat est réutilisé à l'import : ce qui est montré est ce qui sera créé.
 */
export function analyserDpgf(
  grille: readonly (readonly string[])[],
  mappage: MappageDpgf,
  options: OptionsAnalyse = {},
): Apercu {
  if (mappage.designation === undefined) {
    throw new Error('La colonne de désignation est obligatoire pour importer un DPGF.')
  }

  const decalage = options.premiereLigne ?? 1
  const precision = options.precisionPu ?? 2

  const lignes: LigneApercu[] = []
  const anomalies: AnomalieDpgf[] = []

  const cellule = (ligne: readonly string[], colonne: ColonneDpgf): string => {
    const index = mappage[colonne]
    return index === undefined ? '' : (ligne[index] ?? '').trim()
  }

  for (const [rang, brute] of grille.entries()) {
    const numero = decalage + rang
    const designation = cellule(brute, 'designation')
    const quantiteBrute = cellule(brute, 'quantite')
    const prixBrut = cellule(brute, 'prixUnitaireHt')
    const uniteBrute = cellule(brute, 'unite')
    const code = cellule(brute, 'code') || null

    if (designation === '' && quantiteBrute === '' && prixBrut === '') continue

    if (designation === '') {
      anomalies.push({ ligne: numero, severite: 'bloquante', message: 'Ligne chiffrée sans désignation.' })
      continue
    }

    // Ligne de chapitre : un intitulé, pas de chiffres.
    if (quantiteBrute === '' && prixBrut === '') {
      lignes.push({
        ligne: numero,
        type: 'SOUS_LOT',
        code,
        designation,
        unite: null,
        quantite: null,
        prixUnitaireHt: null,
        retenue: true,
      })
      continue
    }

    const unite = uniteBrute === '' ? null : normaliserUnite(uniteBrute)
    if (uniteBrute !== '' && unite === null) {
      anomalies.push({
        ligne: numero,
        severite: 'avertissement',
        message: `Unité inconnue : « ${uniteBrute} ». La ligne sera importée sans unité.`,
      })
    }

    const quantite = quantiteBrute === '' ? null : lireQuantite(quantiteBrute)
    if (quantiteBrute !== '' && quantite === null) {
      anomalies.push({
        ligne: numero,
        severite: 'bloquante',
        message: `Quantité illisible : « ${quantiteBrute} ».`,
      })
      continue
    }

    const prixLu = prixBrut === '' ? null : lireNombre(prixBrut)
    if (prixBrut !== '' && prixLu === null) {
      anomalies.push({
        ligne: numero,
        severite: 'bloquante',
        message: `Prix unitaire illisible : « ${prixBrut} ».`,
      })
      continue
    }

    if (quantite !== null && Number(quantite) === 0) {
      anomalies.push({ ligne: numero, severite: 'avertissement', message: 'Quantité nulle.' })
    }
    if (prixLu !== null && Number(prixLu) === 0) {
      anomalies.push({ ligne: numero, severite: 'avertissement', message: 'Prix unitaire à zéro.' })
    }

    lignes.push({
      ligne: numero,
      type: 'OUVRAGE',
      code,
      designation,
      unite,
      quantite,
      prixUnitaireHt: prixLu === null ? null : PU.depuisEuros(prixLu, precision).toString(),
      retenue: true,
    })
  }

  return {
    lignes,
    anomalies,
    nbOuvrages: lignes.filter((l) => l.type === 'OUVRAGE').length,
    nbSousLots: lignes.filter((l) => l.type === 'SOUS_LOT').length,
  }
}
