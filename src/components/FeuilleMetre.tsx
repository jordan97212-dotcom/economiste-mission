'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { calculerMetre, type LigneMetre, type ValeurRepere } from '../domain/metre/calcul'
import { dec } from '../domain/money/decimal'
import type { LigneMetreDTO, RepereDTO, SaisieLigneMetre } from '../application/dto'
import { LIBELLES_UNITE } from '../lib/format'

/**
 * Feuille de métré — SPEC_APP_ECONOMISTE.md §5.2.
 *
 * Une ligne par mesure, comme sur le papier : ce qu'on mesure, combien de fois,
 * et ses dimensions. Le total se recalcule à chaque frappe dans le navigateur,
 * avec le même code que le serveur : l'économiste voit sa quantité bouger
 * pendant qu'il tape, et le serveur confirme.
 *
 * Les lignes de rappel reprennent un repère — un sous-total nommé de la
 * mission. Elles se multiplient comme les autres facteurs : rappeler une
 * surface et donner une épaisseur donne un volume.
 */

const DELAI_ENREGISTREMENT = 900

type EtatFeuille = 'a-jour' | 'modifie' | 'enregistrement' | 'erreur'

interface Brouillon extends SaisieLigneMetre {
  readonly cle: string
}

function versBrouillon(ligne: LigneMetreDTO): Brouillon {
  return {
    cle: ligne.id,
    type: ligne.type,
    libelle: ligne.libelle,
    deduction: ligne.deduction,
    nombre: ligne.nombre,
    longueur: ligne.longueur,
    largeur: ligne.largeur,
    hauteur: ligne.hauteur,
    rappelRepereId: ligne.rappelRepereId,
  }
}

function ligneNeuve(type: 'MESURE' | 'RAPPEL'): Brouillon {
  return {
    cle: `neuve-${Math.random().toString(36).slice(2, 9)}`,
    type,
    libelle: '',
    deduction: false,
    nombre: null,
    longueur: null,
    largeur: null,
    hauteur: null,
    rappelRepereId: null,
  }
}

/** Ce que l'écran affiche dans une case de mesure : la virgule, pas le point. */
function afficher(valeur: string | null): string {
  return valeur === null ? '' : valeur.replace('.', ',')
}

function saisir(valeur: string): string | null {
  const nettoye = valeur.trim()
  return nettoye === '' ? null : nettoye
}

export interface ProprietesFeuilleMetre {
  readonly lignes: readonly LigneMetreDTO[]
  readonly reperes: readonly RepereDTO[]
  /** Unité de l'ouvrage ou du repère mesuré, pour vérifier la cohérence. */
  readonly unite: string | null
  readonly enregistrer: (lignes: SaisieLigneMetre[]) => Promise<void>
  /** Absent sur un repère : un repère sans lignes reste un repère. */
  readonly supprimer?: (() => Promise<void>) | undefined
  readonly libelleSuppression?: string | undefined
}

export function FeuilleMetre({
  lignes: lignesInitiales,
  reperes,
  unite,
  enregistrer,
  supprimer,
  libelleSuppression = 'Supprimer le métré',
}: ProprietesFeuilleMetre) {
  const [lignes, setLignes] = useState<Brouillon[]>(() => lignesInitiales.map(versBrouillon))
  const [etat, setEtat] = useState<EtatFeuille>('a-jour')
  const [erreur, setErreur] = useState<string | null>(null)
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dernier = useRef<Brouillon[]>(lignes)

  useEffect(() => {
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current)
    }
  }, [])

  const valeursReperes = useMemo(() => {
    const table = new Map<string, ValeurRepere>()
    for (const repere of reperes) {
      table.set(repere.id, {
        nom: repere.nom,
        valeur: repere.valeur === null ? null : dec(repere.valeur),
        degre: repere.degre,
      })
    }
    return table
  }, [reperes])

  // Le même calcul que le serveur, pour que le total suive la frappe.
  const calcul = useMemo(
    () =>
      calculerMetre({
        lignes: lignes.map((ligne, index) => ({ ...ligne, id: String(index) }) as LigneMetre),
        reperes: valeursReperes,
        unite,
      }),
    [lignes, valeursReperes, unite],
  )

  const planifier = useCallback(
    (prochaines: Brouillon[]) => {
      dernier.current = prochaines
      setEtat('modifie')
      if (minuteur.current) clearTimeout(minuteur.current)
      minuteur.current = setTimeout(async () => {
        setEtat('enregistrement')
        try {
          await enregistrer(
            dernier.current.map(({ cle: _cle, ...ligne }) => ligne),
          )
          setEtat('a-jour')
          setErreur(null)
        } catch (probleme) {
          setEtat('erreur')
          setErreur(probleme instanceof Error ? probleme.message : 'Enregistrement impossible.')
        }
      }, DELAI_ENREGISTREMENT)
    },
    [enregistrer],
  )

  const modifier = useCallback(
    (cle: string, champs: Partial<SaisieLigneMetre>) => {
      setLignes((precedentes) => {
        const prochaines = precedentes.map((ligne) =>
          ligne.cle === cle ? { ...ligne, ...champs } : ligne,
        )
        planifier(prochaines)
        return prochaines
      })
    },
    [planifier],
  )

  const ajouter = useCallback(
    (type: 'MESURE' | 'RAPPEL') => {
      setLignes((precedentes) => {
        const prochaines = [...precedentes, ligneNeuve(type)]
        planifier(prochaines)
        return prochaines
      })
    },
    [planifier],
  )

  const retirer = useCallback(
    (cle: string) => {
      setLignes((precedentes) => {
        const prochaines = precedentes.filter((ligne) => ligne.cle !== cle)
        planifier(prochaines)
        return prochaines
      })
    },
    [planifier],
  )

  const deplacer = useCallback(
    (cle: string, sens: -1 | 1) => {
      setLignes((precedentes) => {
        const index = precedentes.findIndex((ligne) => ligne.cle === cle)
        const cible = index + sens
        if (index < 0 || cible < 0 || cible >= precedentes.length) return precedentes
        const prochaines = [...precedentes]
        const [deplacee] = prochaines.splice(index, 1)
        prochaines.splice(cible, 0, deplacee as Brouillon)
        planifier(prochaines)
        return prochaines
      })
    },
    [planifier],
  )

  const resultats = new Map(calcul.lignes.map((ligne) => [ligne.ligneId, ligne]))
  const anomaliesParLigne = new Map<string, string[]>()
  for (const anomalie of calcul.anomalies) {
    if (anomalie.ligneId === null) continue
    const liste = anomaliesParLigne.get(anomalie.ligneId) ?? []
    liste.push(anomalie.message)
    anomaliesParLigne.set(anomalie.ligneId, liste)
  }
  const anomaliesGenerales = calcul.anomalies.filter((a) => a.ligneId === null)

  const libelleEtat: Record<EtatFeuille, string> = {
    'a-jour': 'Métré enregistré',
    modifie: 'Modifications en attente…',
    enregistrement: 'Enregistrement…',
    erreur: 'Erreur',
  }

  return (
    <div className="feuille-metre">
      <div className="defilement">
        <table className="grille grille-metre">
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Localisation / ouvrage mesuré</th>
              <th style={{ width: 70, textAlign: 'right' }}>Nb</th>
              <th style={{ width: 82, textAlign: 'right' }}>Long.</th>
              <th style={{ width: 82, textAlign: 'right' }}>Larg.</th>
              <th style={{ width: 82, textAlign: 'right' }}>Haut.</th>
              <th style={{ width: 62, textAlign: 'center' }}>Déd.</th>
              <th style={{ width: 110, textAlign: 'right' }}>Résultat</th>
              <th style={{ width: 84 }} />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => {
              const resultat = resultats.get(String(index))
              const avertissements = anomaliesParLigne.get(String(index)) ?? []
              return (
                <tr key={ligne.cle} className={ligne.deduction ? 'ligne-deduction' : ''}>
                  <td>
                    {ligne.type === 'RAPPEL' ? (
                      <select
                        className="cellule"
                        aria-label="Repère rappelé"
                        value={ligne.rappelRepereId ?? ''}
                        onChange={(e) =>
                          modifier(ligne.cle, { rappelRepereId: e.target.value || null })
                        }
                      >
                        <option value="">— choisir un repère —</option>
                        {reperes.map((repere) => (
                          <option key={repere.id} value={repere.id}>
                            {repere.nom}
                            {repere.valeur === null
                              ? ' (non calculé)'
                              : ` = ${afficher(repere.valeur)}${
                                  repere.unite ? ` ${LIBELLES_UNITE[repere.unite]}` : ''
                                }`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="cellule"
                        aria-label="Localisation"
                        placeholder="RDC — mur nord"
                        defaultValue={ligne.libelle}
                        onBlur={(e) => modifier(ligne.cle, { libelle: e.target.value })}
                      />
                    )}
                  </td>
                  {(['nombre', 'longueur', 'largeur', 'hauteur'] as const).map((champ) => (
                    <td key={champ}>
                      <input
                        className="cellule cellule-chiffre"
                        inputMode="decimal"
                        aria-label={ETIQUETTES[champ]}
                        defaultValue={afficher(ligne[champ])}
                        onBlur={(e) =>
                          modifier(ligne.cle, { [champ]: saisir(e.target.value.replace(',', '.')) })
                        }
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      aria-label="Déduction"
                      title="Retrancher cette ligne du total"
                      checked={ligne.deduction}
                      onChange={(e) => modifier(ligne.cle, { deduction: e.target.checked })}
                    />
                  </td>
                  <td>
                    <span
                      className="cellule-calculee"
                      title={avertissements.join(' ')}
                      style={avertissements.length > 0 ? { color: 'var(--color-danger)' } : undefined}
                    >
                      {resultat?.ignoree
                        ? ''
                        : resultat?.valeur === null || resultat === undefined
                          ? '—'
                          : `${ligne.deduction ? '− ' : ''}${afficher(resultat.valeur.toString())}`}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, padding: '0 4px' }}>
                      <button
                        type="button"
                        className="bouton bouton-discret"
                        title="Monter"
                        onClick={() => deplacer(ligne.cle, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="bouton bouton-discret"
                        title="Descendre"
                        onClick={() => deplacer(ligne.cle, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="bouton bouton-discret bouton-danger"
                        title="Supprimer la ligne"
                        onClick={() => retirer(ligne.cle)}
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {lignes.length === 0 ? (
        <p className="vide">
          Aucune mesure. Ajoutez une ligne : la quantité de l’ouvrage sera calculée à partir d’elles.
        </p>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginTop: 10,
        }}
      >
        <button type="button" className="bouton" onClick={() => ajouter('MESURE')}>
          + Mesure
        </button>
        <button
          type="button"
          className="bouton"
          onClick={() => ajouter('RAPPEL')}
          disabled={reperes.length === 0}
          title={
            reperes.length === 0
              ? 'Aucun repère dans cette mission : créez-en un depuis l’écran des repères.'
              : 'Reprendre un sous-total nommé'
          }
        >
          + Rappel de repère
        </button>

        <span style={{ flex: 1 }} />

        <span className={etat === 'erreur' ? 'etiquette etiquette-alerte' : 'etiquette'}>
          {libelleEtat[etat]}
        </span>

        <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
          Total{' '}
          {calcul.total === null ? '—' : afficher(calcul.total.toString())}
          {unite ? ` ${LIBELLES_UNITE[unite] ?? unite}` : ''}
        </span>

        {supprimer ? (
          <button
            type="button"
            className="bouton bouton-danger"
            onClick={() => {
              void supprimer()
            }}
          >
            {libelleSuppression}
          </button>
        ) : null}
      </div>

      {erreur ? <p className="message-erreur">{erreur}</p> : null}

      {anomaliesGenerales.map((anomalie) => (
        <p key={anomalie.code} className="message-avertissement">
          {anomalie.message}
        </p>
      ))}
    </div>
  )
}

const ETIQUETTES = {
  nombre: 'Nombre',
  longueur: 'Longueur',
  largeur: 'Largeur',
  hauteur: 'Hauteur',
} as const
