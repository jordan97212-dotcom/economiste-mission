import * as Money from '../domain/money/money'
import * as PU from '../domain/money/prix-unitaire'
import { dec, arrondiCommercial } from '../domain/money/decimal'

/** Formate un montant reçu en chaîne de centimes. */
export function formaterMontant(centimes: string | null | undefined, symbole = true): string {
  if (centimes === null || centimes === undefined || centimes === '') return '—'
  return Money.formater(Money.depuisCentimes(centimes), { symbole })
}

/** Formate un prix unitaire reçu en chaîne de dix-millièmes d'euro. */
export function formaterPrixUnitaire(
  valeur: string | null | undefined,
  precision: number,
  symbole = false,
): string {
  if (valeur === null || valeur === undefined || valeur === '') return ''
  return PU.formater(PU.depuisStockage(BigInt(valeur)), precision, { symbole })
}

/** Convertit une saisie en euros vers l'échelle de stockage du prix unitaire. */
export function saisieVersPrixUnitaire(saisie: string, precision: number): string | null {
  const nettoye = saisie.trim().replace(/\s/g, '').replace(',', '.')
  if (nettoye === '') return null
  if (!/^-?\d*\.?\d*$/.test(nettoye)) return null
  return PU.depuisEuros(nettoye, precision).toString()
}

/** Normalise une quantité saisie : virgule décimale acceptée, jusqu'au millième. */
export function normaliserQuantite(saisie: string): string | null {
  const nettoye = saisie.trim().replace(/\s/g, '').replace(',', '.')
  if (nettoye === '') return null
  if (!/^\d*\.?\d*$/.test(nettoye)) return null
  return arrondiCommercial(dec(nettoye), 3).toString()
}

/** Normalise un coefficient saisi, jusqu'au dix-millième. */
export function normaliserCoefficient(saisie: string): string | null {
  const nettoye = saisie.trim().replace(/\s/g, '').replace(',', '.')
  if (nettoye === '') return null
  if (!/^\d*\.?\d*$/.test(nettoye)) return null
  const valeur = dec(nettoye)
  if (valeur.lessThanOrEqualTo(0) || valeur.greaterThan(10)) return null
  return arrondiCommercial(valeur, 4).toString()
}

export function formaterQuantite(valeur: string | null | undefined): string {
  if (valeur === null || valeur === undefined || valeur === '') return ''
  return valeur.replace('.', ',')
}

export function formaterDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const LIBELLES_STATUT: Record<string, string> = {
  PROSPECT: 'Prospect',
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
  ABANDONNEE: 'Abandonnée',
}

export const LIBELLES_TYPE_OUVRAGE: Record<string, string> = {
  LOGEMENT_COLLECTIF: 'Logement collectif',
  LOGEMENT_INDIVIDUEL: 'Logement individuel',
  SCOLAIRE: 'Scolaire',
  TERTIAIRE: 'Tertiaire',
  SANTE: 'Santé',
  REHABILITATION: 'Réhabilitation',
  AUTRE: 'Autre',
}

export const LIBELLES_NATURE: Record<string, string> = {
  CONSTRUCTION_NEUVE: 'Construction neuve',
  REHABILITATION: 'Réhabilitation',
  EXTENSION: 'Extension',
}

export const LIBELLES_MARCHE: Record<string, string> = { PUBLIC: 'Public', PRIVE: 'Privé' }

export const LIBELLES_FACTURATION: Record<string, string> = {
  FORFAIT: 'Forfait',
  TJM: 'Taux journalier',
  POURCENTAGE_TRAVAUX: '% travaux',
}

export const UNITES = ['M2', 'M3', 'ML', 'U', 'ENS', 'FORFAIT', 'KG', 'T', 'H', 'J'] as const

export const LIBELLES_UNITE: Record<string, string> = {
  M2: 'm²',
  M3: 'm³',
  ML: 'ml',
  U: 'U',
  ENS: 'ens.',
  FORFAIT: 'forfait',
  KG: 'kg',
  T: 't',
  H: 'h',
  J: 'j',
}

export const PHASES = ['ESQ', 'APS', 'APD', 'PRO', 'DCE', 'ACT', 'DET', 'AOR'] as const
