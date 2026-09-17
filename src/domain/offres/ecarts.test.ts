import { describe, expect, it } from 'vitest'
import * as Money from '../money/money'
import { ecartVsEstimatif, detecterAnomalies, medianne, moinsDisante } from './ecarts'

const euros = (v: string) => Money.depuisEuros(v)

describe('écart vis-à-vis de l’estimatif', () => {
  it('donne l’écart en euros et en pourcentage', () => {
    const e = ecartVsEstimatif(euros('110000'), euros('100000'))
    expect(e.montantHt).toBe(1_000_000n)
    expect(e.pourcent?.toString()).toBe('10')
  })

  it('rend un écart négatif quand l’offre est sous l’estimatif', () => {
    const e = ecartVsEstimatif(euros('82500'), euros('100000'))
    expect(e.montantHt).toBe(-1_750_000n)
    expect(e.pourcent?.toString()).toBe('-17.5')
  })

  it('arrondit le pourcentage à deux décimales', () => {
    const e = ecartVsEstimatif(euros('100333.33'), euros('100000'))
    expect(e.pourcent?.toString()).toBe('0.33')
  })

  it('ne divise pas par zéro quand l’estimatif est nul', () => {
    const e = ecartVsEstimatif(euros('50000'), Money.ZERO)
    expect(e.montantHt).toBe(5_000_000n)
    expect(e.pourcent).toBeNull()
  })

  it('rend un écart nul pour une offre au montant de l’estimatif', () => {
    const e = ecartVsEstimatif(euros('100000'), euros('100000'))
    expect(e.montantHt).toBe(Money.ZERO)
    expect(e.pourcent?.toString()).toBe('0')
  })
})

describe('médiane des offres', () => {
  it('prend la valeur centrale sur un nombre impair', () => {
    expect(medianne([euros('100'), euros('300'), euros('200')])).toBe(20_000n)
  })

  it('moyenne les deux valeurs centrales sur un nombre pair', () => {
    expect(medianne([euros('100'), euros('200'), euros('300'), euros('400')])).toBe(25_000n)
  })

  it('arrondit au centime une moyenne qui tombe sur un demi-centime', () => {
    expect(medianne([euros('0.01'), euros('0.02')])).toBe(2n) // 0,015 -> 0,02
  })

  it('rend null sur une liste vide', () => {
    expect(medianne([])).toBeNull()
  })
})

describe('détection des offres à vérifier', () => {
  const estimatif = euros('100000')

  it('signale une offre anormalement basse vis-à-vis de l’estimatif', () => {
    const anomalies = detecterAnomalies(
      [{ reference: 'entreprise-A', montantHt: euros('70000') }],
      estimatif,
    )
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]?.motif).toBe('basse_vs_estimatif')
    expect(anomalies[0]?.reference).toBe('entreprise-A')
    expect(anomalies[0]?.message).toContain('30.00 %')
  })

  it('signale une offre nettement au-dessus de l’estimatif', () => {
    const anomalies = detecterAnomalies(
      [{ reference: 'entreprise-B', montantHt: euros('130000') }],
      estimatif,
    )
    expect(anomalies[0]?.motif).toBe('haute_vs_estimatif')
  })

  it('ne signale rien dans la plage normale', () => {
    expect(
      detecterAnomalies([{ reference: 'entreprise-C', montantHt: euros('105000') }], estimatif),
    ).toHaveLength(0)
  })

  it('signale une offre décrochée de la médiane des autres offres', () => {
    const anomalies = detecterAnomalies(
      [
        { reference: 'A', montantHt: euros('98000') },
        { reference: 'B', montantHt: euros('101000') },
        { reference: 'C', montantHt: euros('103000') },
        { reference: 'D', montantHt: euros('74000') },
      ],
      estimatif,
    )
    const motifs = anomalies.filter((a) => a.reference === 'D').map((a) => a.motif)
    expect(motifs).toContain('basse_vs_estimatif')
    expect(motifs).toContain('basse_vs_offres')
    expect(anomalies.some((a) => a.reference === 'A')).toBe(false)
  })

  it('ne compare pas à la médiane en dessous de trois offres', () => {
    const anomalies = detecterAnomalies(
      [
        { reference: 'A', montantHt: euros('100000') },
        { reference: 'B', montantHt: euros('60000') },
      ],
      estimatif,
    )
    expect(anomalies.every((a) => a.motif !== 'basse_vs_offres')).toBe(true)
  })

  it('respecte des seuils personnalisés', () => {
    const offres = [{ reference: 'A', montantHt: euros('90000') }]
    expect(detecterAnomalies(offres, estimatif)).toHaveLength(0)
    expect(detecterAnomalies(offres, estimatif, { baisseVsEstimatif: 5 })).toHaveLength(1)
  })

  it('ne signale rien quand l’estimatif est nul', () => {
    expect(detecterAnomalies([{ reference: 'A', montantHt: euros('1') }], Money.ZERO)).toHaveLength(0)
  })
})

describe('mieux-disant', () => {
  it('retient l’offre la moins chère', () => {
    const offres = [
      { reference: 'A', montantHt: euros('101000') },
      { reference: 'B', montantHt: euros('98000') },
      { reference: 'C', montantHt: euros('103000') },
    ]
    expect(moinsDisante(offres)?.reference).toBe('B')
  })

  it('rend null sans offre', () => {
    expect(moinsDisante([])).toBeNull()
  })
})

describe('médiane par famille d’offres', () => {
  const BASE = { cle: 'BASE', libelle: 'offres de base' }
  const VARIANTE = { cle: 'VARIANTE', libelle: 'variantes reçues' }

  const offre = (
    reference: string,
    montant: string,
    famille?: { cle: string; libelle: string },
  ) => ({ reference, montantHt: euros(montant), ...(famille ? { famille } : {}) })

  it('ne laisse pas des variantes tirer la médiane des bases vers le bas', () => {
    // Trois bases serrées autour de 100 000 € et trois variantes bien moins
    // chères. Sans familles, la médiane de l'ensemble tomberait assez bas pour
    // qu'aucune base ne paraisse anormale.
    const anomalies = detecterAnomalies(
      [
        offre('base-basse', '70000', BASE),
        offre('base-a', '100000', BASE),
        offre('base-b', '102000', BASE),
        offre('var-a', '60000', VARIANTE),
        offre('var-b', '61000', VARIANTE),
        offre('var-c', '62000', VARIANTE),
      ],
      euros('100000'),
    )
    const surMediane = anomalies.filter((a) => a.motif === 'basse_vs_offres')
    expect(surMediane.map((a) => a.reference)).toEqual(['base-basse'])
  })

  it('compare une variante aux variantes, pas aux bases', () => {
    const anomalies = detecterAnomalies(
      [
        offre('base-a', '100000', BASE),
        offre('base-b', '101000', BASE),
        offre('base-c', '102000', BASE),
        offre('var-basse', '40000', VARIANTE),
        offre('var-a', '60000', VARIANTE),
        offre('var-b', '61000', VARIANTE),
      ],
      euros('100000'),
    )
    const surMediane = anomalies.filter((a) => a.motif === 'basse_vs_offres')
    expect(surMediane.map((a) => a.reference)).toEqual(['var-basse'])
  })

  it('nomme la famille dans le message, pas « les offres reçues »', () => {
    const anomalies = detecterAnomalies(
      [
        offre('base-basse', '70000', BASE),
        offre('base-a', '100000', BASE),
        offre('base-b', '102000', BASE),
      ],
      euros('100000'),
    )
    const message = anomalies.find((a) => a.motif === 'basse_vs_offres')?.message
    expect(message).toContain('à la médiane des offres de base')
  })

  it('n’applique pas le contrôle à une famille de moins de trois offres', () => {
    // Le minimum de trois s'apprécie famille par famille : deux variantes ne
    // font pas une médiane, même si l'ensemble en compte cinq.
    const anomalies = detecterAnomalies(
      [
        offre('base-a', '100000', BASE),
        offre('base-b', '101000', BASE),
        offre('base-c', '102000', BASE),
        offre('var-a', '30000', VARIANTE),
        offre('var-b', '60000', VARIANTE),
      ],
      euros('100000'),
    )
    expect(anomalies.filter((a) => a.motif === 'basse_vs_offres')).toEqual([])
  })

  it('garde l’ancien comportement quand aucune famille n’est donnée', () => {
    const anomalies = detecterAnomalies(
      [offre('a', '50000'), offre('b', '100000'), offre('c', '102000')],
      euros('100000'),
    )
    const surMediane = anomalies.find((a) => a.motif === 'basse_vs_offres')
    expect(surMediane?.reference).toBe('a')
    expect(surMediane?.message).toContain('à la médiane des offres reçues')
  })
})
