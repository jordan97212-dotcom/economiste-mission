import { describe, expect, it } from 'vitest'
import * as Money from '../money/money'
import { construireComparatif, type OffreAComparer, type PosteComparatif } from './comparatif'

const euros = (valeur: string) => Money.depuisEuros(valeur)

const POSTES: PosteComparatif[] = [
  { posteId: 'p1', code: '02.01', designation: 'Voile béton', unite: 'M3', montantEstimeHt: euros('10000') },
  { posteId: 'p2', code: '02.02', designation: 'Dalle', unite: 'M2', montantEstimeHt: euros('5000') },
]

function offreGlobale(id: string, entreprise: string, montant: string, options: Partial<OffreAComparer> = {}): OffreAComparer {
  return {
    offreId: id,
    entrepriseNom: entreprise,
    type: 'BASE',
    montantHt: euros(montant),
    remiseGlobaleHt: Money.ZERO,
    conforme: true,
    lignes: [],
    ...options,
  }
}

describe('type d’offre : base, variante, option — point 10.8', () => {
  it('ne classe jamais une variante, même moins chère', () => {
    // Une variante propose autre chose : la désigner moins-disante reviendrait
    // à comparer deux réponses à deux dossiers différents.
    const tableau = construireComparatif(POSTES, [
      offreGlobale('base', 'Entreprise A', '16000'),
      offreGlobale('var', 'Entreprise B', '9000', { type: 'VARIANTE' }),
    ])
    expect(tableau.colonnes.find((c) => c.moinsDisante)?.offreId).toBe('base')
  })

  it('ne classe jamais une option, même moins chère', () => {
    const tableau = construireComparatif(POSTES, [
      offreGlobale('base', 'Entreprise A', '16000'),
      offreGlobale('opt', 'Entreprise A', '2000', { type: 'OPTION' }),
    ])
    expect(tableau.colonnes.find((c) => c.moinsDisante)?.offreId).toBe('base')
  })

  it('ne classe personne quand il n’y a aucune offre de base', () => {
    const tableau = construireComparatif(POSTES, [
      offreGlobale('var', 'Entreprise B', '9000', { type: 'VARIANTE' }),
    ])
    expect(tableau.colonnes.some((c) => c.moinsDisante)).toBe(false)
  })

  it('dit de chaque colonne si elle entre au classement', () => {
    const tableau = construireComparatif(POSTES, [
      offreGlobale('base', 'Entreprise A', '16000'),
      offreGlobale('refusee', 'Entreprise B', '14000', { conforme: false }),
      offreGlobale('var', 'Entreprise C', '9000', { type: 'VARIANTE' }),
    ])
    expect(tableau.colonnes.map((c) => [c.offreId, c.classee])).toEqual([
      ['base', true],
      ['refusee', false],
      ['var', false],
    ])
  })

  it('ne signale pas une option comme anormalement basse', () => {
    // Une option de 2 000 € face à un estimatif de 15 000 € n'est pas une offre
    // sous-évaluée : elle ne chiffre pas le même périmètre. La signaler
    // apprendrait à ignorer l'alerte.
    const tableau = construireComparatif(POSTES, [
      offreGlobale('base', 'Entreprise A', '15000'),
      offreGlobale('opt', 'Entreprise A', '2000', { type: 'OPTION' }),
    ])
    expect(tableau.anomaliesGlobales.map((a) => a.reference)).not.toContain('opt')
  })

  it('signale en revanche une variante anormalement basse', () => {
    // Une variante couvre le même périmètre : l'écart reste parlant.
    const tableau = construireComparatif(POSTES, [
      offreGlobale('var', 'Entreprise B', '3000', { type: 'VARIANTE' }),
    ])
    expect(tableau.anomaliesGlobales.map((a) => a.reference)).toContain('var')
  })

  it('marque l’écart d’une option comme non comparable', () => {
    const tableau = construireComparatif(POSTES, [
      offreGlobale('base', 'Entreprise A', '15000'),
      offreGlobale('opt', 'Entreprise A', '2000', { type: 'OPTION' }),
    ])
    expect(tableau.colonnes.find((c) => c.offreId === 'opt')?.ecartComparable).toBe(false)
    expect(tableau.colonnes.find((c) => c.offreId === 'base')?.ecartComparable).toBe(true)
  })

  it('garde le libellé, qui distingue deux variantes d’une même entreprise', () => {
    const tableau = construireComparatif(POSTES, [
      offreGlobale('v1', 'Entreprise A', '14000', { type: 'VARIANTE', libelle: 'Ossature bois' }),
      offreGlobale('v2', 'Entreprise A', '13000', { type: 'VARIANTE', libelle: 'Ossature métal' }),
    ])
    expect(tableau.colonnes.map((c) => c.libelle)).toEqual(['Ossature bois', 'Ossature métal'])
  })

  it('rend un libellé nul quand il n’y en a pas', () => {
    const tableau = construireComparatif(POSTES, [offreGlobale('base', 'Entreprise A', '15000')])
    expect(tableau.colonnes[0]?.libelle).toBe(null)
  })

  it('ne laisse pas des variantes masquer une base sous-évaluée', () => {
    // Sans séparation des familles, la médiane de l'ensemble tomberait entre
    // les variantes et les bases, et la base à 7 000 € — trente pour cent sous
    // ses concurrentes — ne serait plus signalée.
    const tableau = construireComparatif(POSTES, [
      offreGlobale('base-basse', 'Entreprise A', '7000'),
      offreGlobale('base-b', 'Entreprise B', '15000'),
      offreGlobale('base-c', 'Entreprise C', '15300'),
      offreGlobale('var-a', 'Entreprise D', '6000', { type: 'VARIANTE' }),
      offreGlobale('var-b', 'Entreprise E', '6100', { type: 'VARIANTE' }),
      offreGlobale('var-c', 'Entreprise F', '6200', { type: 'VARIANTE' }),
    ])
    const surMediane = tableau.anomaliesGlobales.filter((a) => a.motif === 'basse_vs_offres')
    expect(surMediane.map((a) => a.reference)).toEqual(['base-basse'])
  })

  it('compare la médiane des variantes aux seules variantes', () => {
    const tableau = construireComparatif(POSTES, [
      offreGlobale('base-a', 'Entreprise A', '15000'),
      offreGlobale('base-b', 'Entreprise B', '15200'),
      offreGlobale('base-c', 'Entreprise C', '15300'),
      offreGlobale('var-basse', 'Entreprise D', '4000', { type: 'VARIANTE' }),
      offreGlobale('var-a', 'Entreprise E', '9000', { type: 'VARIANTE' }),
      offreGlobale('var-b', 'Entreprise F', '9100', { type: 'VARIANTE' }),
    ])
    const surMediane = tableau.anomaliesGlobales.filter((a) => a.motif === 'basse_vs_offres')
    expect(surMediane.map((a) => a.reference)).toEqual(['var-basse'])
    expect(surMediane[0]?.message).toContain('variantes reçues')
  })

  it('écarte une option de la détection d’anomalie ligne à ligne', () => {
    const detaillee = (id: string, montant: string, type: OffreAComparer['type']) =>
      offreGlobale(id, 'Entreprise', '0', {
        type,
        lignes: [{ posteId: 'p1', montantHt: euros(montant) }],
      })
    const tableau = construireComparatif(POSTES, [
      detaillee('a', '10000', 'BASE'),
      detaillee('b', '9800', 'BASE'),
      detaillee('opt', '300', 'OPTION'),
    ])
    const ligne = tableau.lignes.find((l) => l.poste.posteId === 'p1')
    expect(ligne?.anomalies.map((a) => a.reference)).not.toContain('opt')
  })
})

describe('construction du tableau comparatif', () => {
  it('calcule l’estimatif du lot comme somme des postes', () => {
    const tableau = construireComparatif(POSTES, [])
    expect(tableau.montantEstimeHt).toEqual(euros('15000'))
  })

  it('désigne la moins chère parmi les offres conformes', () => {
    const tableau = construireComparatif(POSTES, [
      offreGlobale('a', 'Entreprise A', '16000'),
      offreGlobale('b', 'Entreprise B', '14000'),
      offreGlobale('c', 'Entreprise C', '15500'),
    ])
    const gagnante = tableau.colonnes.find((c) => c.moinsDisante)
    expect(gagnante?.offreId).toBe('b')
    expect(tableau.colonnes.filter((c) => c.moinsDisante)).toHaveLength(1)
  })

  it('ignore les non conformes pour désigner la moins-disante', () => {
    // La moins chère, mais écartée : ne doit jamais gagner par ce seul fait.
    const tableau = construireComparatif(POSTES, [
      offreGlobale('a', 'Entreprise A', '9000', { conforme: false }),
      offreGlobale('b', 'Entreprise B', '15000'),
    ])
    const gagnante = tableau.colonnes.find((c) => c.moinsDisante)
    expect(gagnante?.offreId).toBe('b')
  })

  it('ne désigne personne s’il n’y a aucune offre conforme', () => {
    const tableau = construireComparatif(POSTES, [
      offreGlobale('a', 'Entreprise A', '9000', { conforme: false }),
    ])
    expect(tableau.colonnes.some((c) => c.moinsDisante)).toBe(false)
  })

  it('soustrait la remise globale pour le montant net et l’écart', () => {
    const tableau = construireComparatif(POSTES, [
      offreGlobale('a', 'Entreprise A', '16000', { remiseGlobaleHt: euros('1000') }),
    ])
    const colonne = tableau.colonnes[0]!
    expect(colonne.montantNetHt).toEqual(euros('15000'))
    expect(colonne.ecart.pourcent?.toFixed(2)).toBe('0.00')
  })

  it('signale une offre globale anormalement basse par rapport à l’estimatif', () => {
    const tableau = construireComparatif(POSTES, [
      offreGlobale('a', 'Entreprise A', '10000'), // -33 % vs 15 000
    ])
    expect(tableau.anomaliesGlobales).toHaveLength(1)
    expect(tableau.anomaliesGlobales[0]?.motif).toBe('basse_vs_estimatif')
    expect(tableau.anomaliesGlobales[0]?.reference).toBe('a')
  })

  it('une offre non détaillée ne remplit aucune cellule de ligne', () => {
    const tableau = construireComparatif(POSTES, [offreGlobale('a', 'Entreprise A', '15000')])
    for (const ligne of tableau.lignes) {
      expect(ligne.cellules.every((c) => c.montantHt === null)).toBe(true)
    }
  })

  it('une offre détaillée remplit ses cellules poste par poste', () => {
    const tableau = construireComparatif(POSTES, [
      {
        ...offreGlobale('a', 'Entreprise A', '15000'),
        lignes: [
          { posteId: 'p1', montantHt: euros('10000') },
          { posteId: 'p2', montantHt: euros('5000') },
        ],
      },
    ])
    const ligneP1 = tableau.lignes.find((l) => l.poste.posteId === 'p1')
    expect(ligneP1?.cellules[0]?.montantHt).toEqual(euros('10000'))
  })

  it('détecte une anomalie de ligne entre offres détaillées, indépendamment du total', () => {
    const tableau = construireComparatif(POSTES, [
      {
        ...offreGlobale('a', 'Entreprise A', '15000'),
        lignes: [
          { posteId: 'p1', montantHt: euros('2000') }, // -80 % vs estimatif du poste
          { posteId: 'p2', montantHt: euros('13000') }, // compense le total
        ],
      },
    ])
    const ligneP1 = tableau.lignes.find((l) => l.poste.posteId === 'p1')
    expect(ligneP1?.anomalies).toHaveLength(1)
    expect(ligneP1?.anomalies[0]?.motif).toBe('basse_vs_estimatif')
    // Le total de l'offre, lui, ne s'écarte pas assez de l'estimatif pour être signalé.
    expect(tableau.anomaliesGlobales).toEqual([])
  })

  it('ne compare une ligne qu’entre les offres qui l’ont effectivement chiffrée', () => {
    const tableau = construireComparatif(POSTES, [
      { ...offreGlobale('a', 'Entreprise A', '15000'), lignes: [{ posteId: 'p1', montantHt: euros('10000') }] },
      offreGlobale('b', 'Entreprise B', '14000'), // globale : aucune ligne
    ])
    const ligneP2 = tableau.lignes.find((l) => l.poste.posteId === 'p2')
    // Seule "a" a chiffré p1 ; aucune n'a chiffré p2 : aucune anomalie de ligne possible.
    expect(ligneP2?.anomalies).toEqual([])
    expect(ligneP2?.cellules.map((c) => c.montantHt)).toEqual([null, null])
  })

  it('rend un tableau vide sans erreur en l’absence d’offre', () => {
    const tableau = construireComparatif(POSTES, [])
    expect(tableau.colonnes).toEqual([])
    expect(tableau.anomaliesGlobales).toEqual([])
    expect(tableau.lignes).toHaveLength(2)
  })

  it('rend un tableau vide sans erreur en l’absence de poste chiffré', () => {
    const tableau = construireComparatif([], [offreGlobale('a', 'Entreprise A', '1000')])
    expect(Money.estZero(tableau.montantEstimeHt)).toBe(true)
    expect(tableau.lignes).toEqual([])
  })
})
