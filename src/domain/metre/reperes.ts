import {
  calculerMetre,
  degreAttendu,
  type AnomalieMetre,
  type LigneMetre,
  type ResultatMetre,
  type ValeurRepere,
} from './calcul'

/**
 * Les repères sont les sous-totaux nommés du métré : « surface étage courant »,
 * « linéaire de façade ». On les calcule une fois et on les rappelle dans
 * autant d'ouvrages qu'on veut. Le jour où l'étage change, une seule ligne est
 * à reprendre.
 *
 * Un repère peut lui-même en rappeler un autre, ce qui ouvre la porte aux
 * cycles : A rappelle B qui rappelle A. Aucun des deux n'a alors de valeur, et
 * il vaut mieux le dire que boucler.
 */

export interface RepereAEvaluer {
  readonly id: string
  readonly nom: string
  readonly unite: string | null
  readonly lignes: readonly LigneMetre[]
}

export interface RepereEvalue extends ValeurRepere {
  readonly id: string
  readonly unite: string | null
  readonly resultat: ResultatMetre
  readonly anomalies: readonly AnomalieMetre[]
}

const METRE_VIDE: ResultatMetre = { lignes: [], total: null, degre: null, anomalies: [] }

/**
 * Évalue tous les repères d'une mission, dans l'ordre de leurs dépendances.
 * Les repères pris dans un cycle ressortent sans valeur, signalés comme tels.
 */
export function evaluerReperes(reperes: readonly RepereAEvaluer[]): Map<string, RepereEvalue> {
  const parId = new Map(reperes.map((repere) => [repere.id, repere]))
  const etat = new Map<string, 'en_cours' | 'fini'>()
  const evalues = new Map<string, RepereEvalue>()
  const valeurs = new Map<string, ValeurRepere>()
  const cycliques = new Set<string>()
  const pile: string[] = []

  function visiter(id: string): void {
    const courant = etat.get(id)
    if (courant === 'fini') return
    if (courant === 'en_cours') {
      // Tout ce qui est empilé depuis ce repère fait partie du cycle.
      for (const membre of pile.slice(pile.indexOf(id))) cycliques.add(membre)
      return
    }

    const repere = parId.get(id)
    if (repere === undefined) return

    etat.set(id, 'en_cours')
    pile.push(id)
    for (const ligne of repere.lignes) {
      if (ligne.type === 'RAPPEL' && ligne.rappelRepereId !== null) visiter(ligne.rappelRepereId)
    }
    pile.pop()
    etat.set(id, 'fini')

    if (cycliques.has(id)) {
      const anomalie: AnomalieMetre = {
        code: 'cycle_de_reperes',
        ligneId: null,
        message: `Le repère « ${repere.nom} » se rappelle lui-même, directement ou par un autre repère.`,
      }
      const evalue: RepereEvalue = {
        id,
        nom: repere.nom,
        unite: repere.unite,
        valeur: null,
        degre: degreAttendu(repere.unite),
        resultat: METRE_VIDE,
        anomalies: [anomalie],
      }
      evalues.set(id, evalue)
      valeurs.set(id, evalue)
      return
    }

    const resultat = calculerMetre({ lignes: repere.lignes, reperes: valeurs, unite: repere.unite })
    const valeur = resultat.total !== null && !resultat.total.isNegative() ? resultat.total : null
    const evalue: RepereEvalue = {
      id,
      nom: repere.nom,
      unite: repere.unite,
      valeur,
      degre: resultat.degre ?? degreAttendu(repere.unite),
      resultat,
      anomalies: resultat.anomalies,
    }
    evalues.set(id, evalue)
    valeurs.set(id, evalue)
  }

  for (const repere of reperes) visiter(repere.id)
  return evalues
}

/** Vue réduite pour le calcul d'un métré d'ouvrage. */
export function valeursDesReperes(
  evalues: ReadonlyMap<string, RepereEvalue>,
): Map<string, ValeurRepere> {
  return new Map(
    [...evalues].map(([id, repere]) => [
      id,
      { nom: repere.nom, valeur: repere.valeur, degre: repere.degre },
    ]),
  )
}

/** Repères rappelés par une feuille de métré, directement. */
export function reperesRappeles(lignes: readonly LigneMetre[]): Set<string> {
  const identifiants = new Set<string>()
  for (const ligne of lignes) {
    if (ligne.type === 'RAPPEL' && ligne.rappelRepereId !== null) {
      identifiants.add(ligne.rappelRepereId)
    }
  }
  return identifiants
}
