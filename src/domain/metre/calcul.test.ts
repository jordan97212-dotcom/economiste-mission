import { describe, expect, it } from 'vitest'
import { calculerMetre, quantiteReportable, type LigneMetre, type ValeurRepere } from './calcul'
import { evaluerReperes, reperesRappeles, valeursDesReperes, type RepereAEvaluer } from './reperes'

const mesure = (id: string, champs: Partial<LigneMetre> = {}): LigneMetre => ({
  id,
  type: 'MESURE',
  libelle: '',
  deduction: false,
  nombre: null,
  longueur: null,
  largeur: null,
  hauteur: null,
  rappelRepereId: null,
  ...champs,
})

const rappel = (id: string, repereId: string, champs: Partial<LigneMetre> = {}): LigneMetre =>
  mesure(id, { type: 'RAPPEL', rappelRepereId: repereId, ...champs })

describe('calcul d’une ligne', () => {
  it('multiplie ce qui est renseigné, et rien d’autre', () => {
    const resultat = calculerMetre({
      lignes: [mesure('l1', { nombre: '2', longueur: '3.50', largeur: '2.80' })],
      unite: 'M2',
    })
    expect(resultat.total?.toString()).toBe('19.6')
    expect(resultat.degre).toBe(2)
  })

  it('compte le nombre sans lui donner de dimension', () => {
    // 3 portes : un nombre, pas une longueur.
    const resultat = calculerMetre({ lignes: [mesure('l1', { nombre: '3' })], unite: 'U' })
    expect(resultat.total?.toString()).toBe('3')
    expect(resultat.degre).toBe(0)
    expect(resultat.anomalies).toHaveLength(0)
  })

  it('retranche une déduction', () => {
    // Un mur, moins sa baie.
    const resultat = calculerMetre({
      lignes: [
        mesure('mur', { longueur: '3.50', hauteur: '2.80' }),
        mesure('baie', { longueur: '1.20', hauteur: '2.15', deduction: true }),
      ],
      unite: 'M2',
    })
    expect(resultat.total?.toString()).toBe('7.22')
  })

  it('ignore une ligne encore vide, sans perdre le total', () => {
    // On saisit ligne à ligne : une ligne blanche ne doit pas effacer la quantité.
    const resultat = calculerMetre({
      lignes: [mesure('l1', { longueur: '10', largeur: '2' }), mesure('l2')],
      unite: 'M2',
    })
    expect(resultat.total?.toString()).toBe('20')
    expect(resultat.lignes[1]?.ignoree).toBe(true)
  })

  it('arrondit chaque ligne au millième avant de sommer', () => {
    // La feuille imprimée est ce qu'on vérifie : son total est celui de ses
    // lignes affichées, pas un total exact que personne ne retrouve.
    const ligne = { nombre: '2.5', longueur: '0.001' }
    const resultat = calculerMetre({ lignes: [mesure('a', ligne), mesure('b', ligne)] })
    expect(resultat.lignes[0]?.valeur?.toString()).toBe('0.003')
    expect(resultat.total?.toString()).toBe('0.006')
  })
})

describe('cohérence avec l’unité de l’ouvrage', () => {
  it('signale une surface mesurée pour un ouvrage au mètre linéaire', () => {
    const resultat = calculerMetre({
      lignes: [mesure('l1', { longueur: '3', largeur: '2' })],
      unite: 'ML',
    })
    expect(resultat.anomalies.map((a) => a.code)).toContain('unite_incoherente')
    // L'unité est nommée comme on l'écrit, pas comme elle est stockée.
    expect(resultat.anomalies[0]?.message).toContain('alors que l’ouvrage est en ml')
    // Le total reste calculé : c'est un avertissement, pas un refus.
    expect(resultat.total?.toString()).toBe('6')
  })

  it('ne dit rien quand l’unité ne se déduit pas d’un produit de longueurs', () => {
    const resultat = calculerMetre({
      lignes: [mesure('l1', { longueur: '3', largeur: '2' })],
      unite: 'KG',
    })
    expect(resultat.anomalies).toHaveLength(0)
  })

  it('signale un métré qui additionne des surfaces et des volumes', () => {
    const resultat = calculerMetre({
      lignes: [
        mesure('a', { longueur: '3', largeur: '2' }),
        mesure('b', { longueur: '3', largeur: '2', hauteur: '1' }),
      ],
      unite: 'M2',
    })
    expect(resultat.anomalies.map((a) => a.code)).toContain('degres_melanges')
    expect(resultat.degre).toBeNull()
  })
})

describe('total exploitable', () => {
  it('refuse de reporter un total négatif', () => {
    const resultat = calculerMetre({
      lignes: [
        mesure('mur', { longueur: '2', hauteur: '2' }),
        mesure('baie', { longueur: '3', hauteur: '3', deduction: true }),
      ],
      unite: 'M2',
    })
    expect(resultat.anomalies.map((a) => a.code)).toContain('total_negatif')
    expect(quantiteReportable(resultat)).toBeNull()
  })

  it('reporte la quantité au millième', () => {
    const resultat = calculerMetre({ lignes: [mesure('l1', { longueur: '12.5', largeur: '3' })] })
    expect(quantiteReportable(resultat)).toBe('37.500')
  })

  it('ne reporte rien quand une ligne n’est pas calculable', () => {
    const resultat = calculerMetre({
      lignes: [mesure('l1', { longueur: '10', largeur: '2' }), rappel('l2', 'inconnu')],
    })
    expect(resultat.total).toBeNull()
    expect(resultat.anomalies.map((a) => a.code)).toContain('repere_inconnu')
    expect(quantiteReportable(resultat)).toBeNull()
  })
})

describe('rappel d’un repère', () => {
  const reperes = new Map<string, ValeurRepere>([
    ['r1', { nom: 'Surface étage courant', valeur: calculerMetre({ lignes: [mesure('x', { longueur: '20', largeur: '16' })] }).total, degre: 2 }],
  ])

  it('reprend la valeur du repère', () => {
    const resultat = calculerMetre({ lignes: [rappel('l1', 'r1')], reperes, unite: 'M2' })
    expect(resultat.total?.toString()).toBe('320')
    expect(resultat.degre).toBe(2)
  })

  it('multiplie le repère par les facteurs de la ligne', () => {
    // Surface d'étage × nombre d'étages : toujours une surface.
    const resultat = calculerMetre({
      lignes: [rappel('l1', 'r1', { nombre: '4' })],
      reperes,
      unite: 'M2',
    })
    expect(resultat.total?.toString()).toBe('1280')
    expect(resultat.degre).toBe(2)
  })

  it('passe de la surface au volume quand on ajoute une épaisseur', () => {
    const resultat = calculerMetre({
      lignes: [rappel('l1', 'r1', { hauteur: '0.20' })],
      reperes,
      unite: 'M3',
    })
    expect(resultat.total?.toString()).toBe('64')
    expect(resultat.degre).toBe(3)
    expect(resultat.anomalies).toHaveLength(0)
  })

  it('n’invente pas de total quand le repère n’est pas calculable', () => {
    const casses = new Map<string, ValeurRepere>([['r1', { nom: 'Cassé', valeur: null, degre: 2 }]])
    const resultat = calculerMetre({ lignes: [rappel('l1', 'r1')], reperes: casses })
    expect(resultat.total).toBeNull()
    expect(resultat.anomalies.map((a) => a.code)).toContain('repere_indisponible')
  })

  it('ignore un rappel dont le repère n’est pas encore choisi', () => {
    const resultat = calculerMetre({ lignes: [rappel('l1', null as unknown as string)] })
    expect(resultat.total?.toString()).toBe('0')
    expect(resultat.anomalies.map((a) => a.code)).toContain('rappel_sans_repere')
  })
})

describe('évaluation des repères', () => {
  const repere = (id: string, nom: string, unite: string | null, lignes: LigneMetre[]): RepereAEvaluer => ({
    id,
    nom,
    unite,
    lignes,
  })

  it('calcule un repère à partir de ses propres lignes', () => {
    const evalues = evaluerReperes([
      repere('r1', 'Surface étage courant', 'M2', [mesure('a', { longueur: '20', largeur: '16' })]),
    ])
    expect(evalues.get('r1')?.valeur?.toString()).toBe('320')
    expect(evalues.get('r1')?.degre).toBe(2)
  })

  it('résout un repère qui en rappelle un autre, quel que soit leur ordre', () => {
    const evalues = evaluerReperes([
      repere('r2', 'Surface totale', 'M2', [rappel('b', 'r1', { nombre: '3' })]),
      repere('r1', 'Surface étage courant', 'M2', [mesure('a', { longueur: '20', largeur: '16' })]),
    ])
    expect(evalues.get('r2')?.valeur?.toString()).toBe('960')
  })

  it('laisse sans valeur les repères pris dans un cycle', () => {
    const evalues = evaluerReperes([
      repere('r1', 'A', 'M2', [rappel('a', 'r2')]),
      repere('r2', 'B', 'M2', [rappel('b', 'r1')]),
    ])
    expect(evalues.get('r1')?.valeur).toBeNull()
    expect(evalues.get('r2')?.valeur).toBeNull()
    expect(evalues.get('r1')?.anomalies.map((a) => a.code)).toContain('cycle_de_reperes')
  })

  it('détecte un repère qui se rappelle lui-même', () => {
    const evalues = evaluerReperes([repere('r1', 'A', 'M2', [rappel('a', 'r1')])])
    expect(evalues.get('r1')?.valeur).toBeNull()
  })

  it('propage l’indisponibilité sans boucler', () => {
    const evalues = evaluerReperes([
      repere('r1', 'A', 'M2', [rappel('a', 'r2')]),
      repere('r2', 'B', 'M2', [rappel('b', 'r3')]),
      repere('r3', 'C', 'M2', [rappel('c', 'r2')]),
    ])
    expect(evalues.get('r3')?.valeur).toBeNull()
    expect(evalues.get('r1')?.valeur).toBeNull()
    expect(evalues.get('r1')?.anomalies.map((a) => a.code)).toContain('repere_indisponible')
  })

  it('livre des valeurs directement utilisables par un métré d’ouvrage', () => {
    const evalues = evaluerReperes([
      repere('r1', 'Linéaire de façade', 'ML', [mesure('a', { nombre: '2', longueur: '20' })]),
    ])
    const resultat = calculerMetre({
      lignes: [rappel('l1', 'r1', { hauteur: '3' })],
      reperes: valeursDesReperes(evalues),
      unite: 'M2',
    })
    expect(resultat.total?.toString()).toBe('120')
  })

  it('liste les repères rappelés par une feuille', () => {
    expect([...reperesRappeles([rappel('a', 'r1'), mesure('b'), rappel('c', 'r2')])]).toEqual(['r1', 'r2'])
  })
})
