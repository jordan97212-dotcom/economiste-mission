import { describe, expect, it } from 'vitest'
import { lireNombre, lireQuantite, lireCoefficient, lireDate, normaliserUnite } from './saisie'

describe('lecture d’un nombre venu d’un tableur', () => {
  it('accepte la virgule décimale et les espaces de milliers', () => {
    expect(lireNombre('1 250,500')).toBe('1250.500')
    expect(lireNombre('38,20')).toBe('38.20')
    expect(lireNombre('42')).toBe('42')
  })

  it('accepte l’espace fine insécable, celle qu’Excel insère vraiment', () => {
    expect(lireNombre('1 250,50')).toBe('1250.50')
    expect(lireNombre('1 250,50')).toBe('1250.50')
  })

  it('ignore le symbole monétaire et le pourcentage', () => {
    expect(lireNombre('285,43 €')).toBe('285.43')
    expect(lireNombre('12,5 %')).toBe('12.5')
  })

  it('rend null plutôt qu’un zéro trompeur sur du texte', () => {
    expect(lireNombre('néant')).toBeNull()
    expect(lireNombre('')).toBeNull()
    expect(lireNombre('—')).toBeNull()
    expect(lireNombre('12,5,3')).toBeNull()
  })

  it('accepte un nombre négatif', () => {
    expect(lireNombre('-1 500,25')).toBe('-1500.25')
  })
})

describe('lecture d’une quantité', () => {
  it('arrondit au millième', () => {
    expect(lireQuantite('1 250,5006')).toBe('1250.501')
    expect(lireQuantite('47,5')).toBe('47.5')
  })

  it('refuse une quantité négative', () => {
    expect(lireQuantite('-3')).toBeNull()
  })
})

describe('lecture d’un coefficient', () => {
  it('arrondit au dix-millième', () => {
    expect(lireCoefficient('1,25')).toBe('1.25')
    expect(lireCoefficient('1,23456')).toBe('1.2346')
  })

  it('refuse hors des bornes du domaine', () => {
    expect(lireCoefficient('0')).toBeNull()
    expect(lireCoefficient('-1')).toBeNull()
    expect(lireCoefficient('11')).toBeNull()
  })
})

describe('reconnaissance des unités', () => {
  it('accepte les écritures courantes', () => {
    expect(normaliserUnite('m²')).toBe('M2')
    expect(normaliserUnite('m2')).toBe('M2')
    expect(normaliserUnite('M3')).toBe('M3')
    expect(normaliserUnite('ml')).toBe('ML')
    expect(normaliserUnite('ens.')).toBe('ENS')
    expect(normaliserUnite('Forfait')).toBe('FORFAIT')
    expect(normaliserUnite('U')).toBe('U')
  })

  it('rend null sur une unité inconnue, pour qu’elle soit signalée', () => {
    expect(normaliserUnite('sac')).toBeNull()
    expect(normaliserUnite('')).toBeNull()
  })
})

describe('lecture d’une date', () => {
  it('accepte le format français', () => {
    expect(lireDate('12/09/2026')?.toISOString().slice(0, 10)).toBe('2026-09-12')
    expect(lireDate('1-3-2025')?.toISOString().slice(0, 10)).toBe('2025-03-01')
  })

  it('accepte le format ISO', () => {
    expect(lireDate('2026-09-12')?.toISOString().slice(0, 10)).toBe('2026-09-12')
  })

  it('rend null sur une date illisible', () => {
    expect(lireDate('hier')).toBeNull()
    expect(lireDate('')).toBeNull()
  })
})
