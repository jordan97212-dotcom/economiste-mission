'use client'

import { useCallback, useState } from 'react'
import { FeuilleMetre } from './FeuilleMetre'
import { LIBELLES_UNITE, UNITES } from '../lib/format'
import type { RepereDetailDTO, SaisieLigneMetre } from '../application/dto'
import {
  actionCreerRepere,
  actionEnregistrerRepere,
  actionSupprimerRepere,
} from '../app/missions/actions-metre'

/**
 * Repères de métré — les sous-totaux nommés d'une mission.
 *
 * « Surface étage courant », « linéaire de façade » : des quantités qu'on
 * mesure une fois et qu'on rappelle dans autant d'ouvrages qu'on veut. Le jour
 * où l'étage change, une seule ligne est à reprendre, et tous les ouvrages
 * suivent.
 */

function afficher(valeur: string | null): string {
  return valeur === null ? '—' : valeur.replace('.', ',')
}

export function GestionReperes({
  missionId,
  reperesInitiaux,
}: {
  missionId: string
  reperesInitiaux: readonly RepereDetailDTO[]
}) {
  const [reperes, setReperes] = useState<readonly RepereDetailDTO[]>(reperesInitiaux)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [unite, setUnite] = useState('M2')
  const [erreur, setErreur] = useState<string | null>(null)

  const tenter = useCallback(async (action: () => Promise<readonly RepereDetailDTO[]>) => {
    try {
      setReperes(await action())
      setErreur(null)
      return true
    } catch (probleme) {
      setErreur(probleme instanceof Error ? probleme.message : 'Opération impossible.')
      return false
    }
  }, [])

  const creer = useCallback(async () => {
    const reussi = await tenter(() => actionCreerRepere(missionId, nom, unite || null))
    if (reussi) setNom('')
  }, [missionId, nom, unite, tenter])

  const enregistrerLignes = useCallback(
    async (repereId: string, lignes: SaisieLigneMetre[]) => {
      // La feuille remonte ses propres erreurs : on laisse passer.
      setReperes(await actionEnregistrerRepere(missionId, repereId, { lignes }))
    },
    [missionId],
  )

  return (
    <>
      <div className="carte" style={{ marginBottom: 20 }}>
        <div className="carte-entete">
          <h2>Nouveau repère</h2>
        </div>
        <div style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="champ" style={{ flex: '0 1 340px' }}>
            <label htmlFor="repere-nom">Nom</label>
            <input
              id="repere-nom"
              type="text"
              value={nom}
              placeholder="Surface étage courant"
              onChange={(e) => setNom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void creer()
              }}
            />
          </div>
          <div className="champ" style={{ width: 150 }}>
            <label htmlFor="repere-unite">Unité</label>
            <select id="repere-unite" value={unite} onChange={(e) => setUnite(e.target.value)}>
              <option value="">—</option>
              {UNITES.map((u) => (
                <option key={u} value={u}>
                  {LIBELLES_UNITE[u]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="bouton bouton-primaire"
            onClick={() => void creer()}
            disabled={nom.trim() === ''}
          >
            Créer le repère
          </button>
        </div>
      </div>

      {erreur ? (
        <p className="message-erreur" role="alert" style={{ marginBottom: 12 }}>
          {erreur}
        </p>
      ) : null}

      {reperes.length === 0 ? (
        <div className="carte">
          <p className="vide">
            Aucun repère. Créez-en un pour mesurer une fois ce que vous reprendrez dans plusieurs
            ouvrages.
          </p>
        </div>
      ) : null}

      {reperes.map((repere) => (
        <section key={repere.id} className="carte" style={{ marginBottom: 16, overflow: 'hidden' }}>
          <div className="carte-entete">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h2>{repere.nom}</h2>
              <span className="etiquette">
                {repere.emplois === 0
                  ? 'jamais rappelé'
                  : `rappelé ${repere.emplois} fois`}
              </span>
              {repere.unite ? <span className="etiquette">{LIBELLES_UNITE[repere.unite]}</span> : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
                {afficher(repere.valeur)}
                {repere.unite ? ` ${LIBELLES_UNITE[repere.unite]}` : ''}
              </span>
              <button
                type="button"
                className="bouton"
                aria-expanded={ouvert === repere.id}
                onClick={() => setOuvert(ouvert === repere.id ? null : repere.id)}
              >
                {ouvert === repere.id ? 'Fermer' : 'Mesures'}
              </button>
              <button
                type="button"
                className="bouton bouton-danger"
                title={
                  repere.emplois > 0
                    ? 'Ce repère est encore rappelé par une feuille de métré.'
                    : 'Supprimer ce repère'
                }
                disabled={repere.emplois > 0}
                onClick={() => void tenter(() => actionSupprimerRepere(missionId, repere.id))}
              >
                Supprimer
              </button>
            </div>
          </div>

          {repere.anomalies.map((anomalie) => (
            <p key={anomalie.code} className="message-avertissement" style={{ margin: '0 16px 12px' }}>
              {anomalie.message}
            </p>
          ))}

          {ouvert === repere.id ? (
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
                <div className="champ" style={{ flex: '0 1 340px' }}>
                  <label htmlFor={`nom-${repere.id}`}>Nom du repère</label>
                  <input
                    id={`nom-${repere.id}`}
                    type="text"
                    defaultValue={repere.nom}
                    onBlur={(e) => {
                      if (e.target.value !== repere.nom) {
                        void tenter(() =>
                          actionEnregistrerRepere(missionId, repere.id, { nom: e.target.value }),
                        )
                      }
                    }}
                  />
                </div>
                <div className="champ" style={{ width: 150 }}>
                  <label htmlFor={`unite-${repere.id}`}>Unité</label>
                  <select
                    id={`unite-${repere.id}`}
                    defaultValue={repere.unite ?? ''}
                    onChange={(e) =>
                      void tenter(() =>
                        actionEnregistrerRepere(missionId, repere.id, { unite: e.target.value || null }),
                      )
                    }
                  >
                    <option value="">—</option>
                    {UNITES.map((u) => (
                      <option key={u} value={u}>
                        {LIBELLES_UNITE[u]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <FeuilleMetre
                lignes={repere.lignes}
                reperes={reperes.filter((autre) => autre.id !== repere.id)}
                unite={repere.unite}
                enregistrer={(lignes) => enregistrerLignes(repere.id, lignes)}
              />
            </div>
          ) : null}
        </section>
      ))}
    </>
  )
}
