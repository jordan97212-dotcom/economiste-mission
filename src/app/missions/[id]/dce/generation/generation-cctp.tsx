'use client'

import { useActionState, useState } from 'react'
import { actionAppliquer, type EtatGeneration } from './actions'

/**
 * Génération du CCTP depuis les trames — §5.4.
 *
 * L'écran propose, l'économiste tranche. Les correspondances franches arrivent
 * cochées, les approximatives attendent un regard, et les ouvrages sans trame
 * sont listés à part : l'application ne rédige pas à sa place.
 */

interface Appariement {
  readonly posteId: string
  readonly designation: string
  readonly trameId: string | null
  readonly intituleTrame: string | null
  readonly score: number
  readonly sur: boolean
  readonly motif?: 'texte_deja_present' | 'aucune_correspondance'
}

interface Lot {
  readonly lotId: string
  readonly numero: string
  readonly intitule: string
  readonly corpsEtat: string | null
  readonly appariements: readonly Appariement[]
  readonly nbTramesDisponibles: number
  readonly synthese: {
    readonly nbPostes: number
    readonly nbSurs: number
    readonly nbIncertains: number
    readonly nbSansTrame: number
    readonly nbDejaRediges: number
  }
}

export function GenerationCctp({
  missionId,
  lots,
  synthese,
}: {
  missionId: string
  lots: readonly Lot[]
  synthese: Lot['synthese']
}) {
  const [etat, appliquer, enCours] = useActionState<EtatGeneration, FormData>(actionAppliquer, {})

  // Les correspondances franches sont cochées d'entrée ; les incertaines non.
  const [coches, setCoches] = useState<Set<string>>(
    () =>
      new Set(
        lots.flatMap((lot) =>
          lot.appariements.filter((a) => a.sur && a.trameId).map((a) => a.posteId),
        ),
      ),
  )

  const basculer = (posteId: string): void => {
    setCoches((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(posteId)) suivant.delete(posteId)
      else suivant.add(posteId)
      return suivant
    })
  }

  const proposables = lots.flatMap((lot) => lot.appariements.filter((a) => a.trameId !== null))
  const sansTrame = lots.flatMap((lot) =>
    lot.appariements
      .filter((a) => a.motif === 'aucune_correspondance')
      .map((a) => ({ ...a, lot: `${lot.numero} ${lot.intitule}` })),
  )

  return (
    <>
      <div className="total-bandeau" style={{ marginBottom: 22 }}>
        <div>
          <p className="surtitre">Ouvrages</p>
          <p className="valeur">{synthese.nbPostes}</p>
        </div>
        <div>
          <p className="surtitre">Correspondance franche</p>
          <p className="valeur">{synthese.nbSurs}</p>
          <p className="attenue" style={{ fontSize: 12.5 }}>cochées d’entrée</p>
        </div>
        <div>
          <p className="surtitre">À vérifier</p>
          <p className="valeur">{synthese.nbIncertains}</p>
        </div>
        <div>
          <p className="surtitre">Sans trame</p>
          <p className="valeur">{synthese.nbSansTrame}</p>
          <p className="attenue" style={{ fontSize: 12.5 }}>à rédiger</p>
        </div>
        <div>
          <p className="surtitre">Déjà rédigés</p>
          <p className="valeur">{synthese.nbDejaRediges}</p>
        </div>
      </div>

      {etat.erreur ? (
        <p className="message-erreur" role="alert" style={{ marginBottom: 18 }}>
          {etat.erreur}
        </p>
      ) : null}
      {etat.succes ? (
        <p className="message-succes" style={{ marginBottom: 18 }}>
          {etat.succes} <a href={`/missions/${missionId}/dce/textes`}>Relire les textes</a>
        </p>
      ) : null}

      {proposables.length === 0 ? (
        // Deux situations très différentes : il n'y a rien à proposer parce que
        // tout est fait, ou parce que la bibliothèque ne couvre pas ce chantier.
        <p className="vide">
          {synthese.nbDejaRediges > 0 ? (
            <>
              Plus rien à générer : tout ce que vos trames couvraient a été appliqué.{' '}
              {synthese.nbSansTrame > 0
                ? `Restent ${String(synthese.nbSansTrame)} ouvrage(s) à rédiger, listés ci-dessous.`
                : 'Tous les ouvrages portent un texte.'}
            </>
          ) : (
            <>
              Aucune trame ne correspond aux ouvrages de cette opération. Enrichissez votre{' '}
              <a href="/trames">bibliothèque</a> — vous pouvez y{' '}
              <a href="/trames/import">importer un CCTP Word</a> existant.
            </>
          )}
        </p>
      ) : (
        <form action={appliquer}>
          <input type="hidden" name="missionId" value={missionId} />

          {lots.map((lot) => {
            const aProposer = lot.appariements.filter((a) => a.trameId !== null)
            if (aProposer.length === 0) return null

            return (
              <section className="carte" key={lot.lotId} style={{ marginBottom: 18 }}>
                <div className="carte-entete">
                  <h2>
                    <span className="mono">{lot.numero}</span> {lot.intitule}
                  </h2>
                  <span className="attenue" style={{ fontSize: 13 }}>
                    {lot.corpsEtat ?? 'sans corps d’état'} · {lot.nbTramesDisponibles} trame(s)
                    disponible(s)
                  </span>
                </div>

                <div className="defilement">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }} />
                        <th>Ouvrage du DPGF</th>
                        <th>Trame proposée</th>
                        <th style={{ width: 120 }}>Ressemblance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aProposer.map((appariement) => (
                        <tr key={appariement.posteId}>
                          <td>
                            <input
                              type="checkbox"
                              name="choix"
                              value={`${appariement.posteId}:${appariement.trameId}`}
                              checked={coches.has(appariement.posteId)}
                              onChange={() => basculer(appariement.posteId)}
                              aria-label={`Appliquer une trame à ${appariement.designation}`}
                              style={{ width: 'auto' }}
                            />
                          </td>
                          <td style={{ fontSize: 13.5 }}>{appariement.designation}</td>
                          <td style={{ fontSize: 13.5 }}>{appariement.intituleTrame}</td>
                          <td>
                            <span
                              className={`etiquette ${appariement.sur ? 'etiquette-accent' : 'etiquette-alerte'}`}
                            >
                              {appariement.sur
                                ? 'franche'
                                : `à vérifier · ${String(Math.round(appariement.score * 100))} %`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}

          <section className="carte" style={{ marginBottom: 22 }}>
            <div
              className="carte-corps"
              style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <button
                type="button"
                className="bouton bouton-discret"
                onClick={() => setCoches(new Set(proposables.map((a) => a.posteId)))}
              >
                Tout cocher
              </button>
              <button
                type="button"
                className="bouton bouton-discret"
                onClick={() => setCoches(new Set())}
              >
                Tout décocher
              </button>
              <button
                type="submit"
                className="bouton bouton-primaire"
                disabled={coches.size === 0 || enCours}
              >
                {enCours
                  ? 'Écriture…'
                  : coches.size === 0
                    ? 'Appliquer les trames cochées'
                    : `Appliquer ${coches.size} trame(s)`}
              </button>
            </div>
          </section>
        </form>
      )}

      {sansTrame.length > 0 ? (
        <section className="carte">
          <div className="carte-entete">
            <h2>{sansTrame.length} ouvrage(s) à rédiger</h2>
          </div>
          <div className="carte-corps">
            <p style={{ marginTop: 0, fontSize: 14, maxWidth: '78ch' }}>
              Aucune trame ne s’approche de ces désignations. L’application ne rédige pas de
              prescription à votre place : un CCTP est une pièce contractuelle que vous signez, et
              un texte inventé vous engagerait sur des tolérances, des dosages ou des normes que
              personne n’a vérifiés.
            </p>
            <p className="attenue" style={{ fontSize: 13.5, maxWidth: '78ch' }}>
              Rédigez-les depuis l’écran des textes — ce que vous écrirez pourra ensuite rejoindre
              votre bibliothèque et servir aux opérations suivantes. Le contrôle de cohérence les
              signalera de toute façon avant la génération du DCE.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {sansTrame.slice(0, 15).map((a) => (
                <li key={a.posteId} style={{ marginBottom: 3 }}>
                  <span className="attenue mono" style={{ fontSize: 12 }}>
                    {a.lot}
                  </span>{' '}
                  — {a.designation}
                </li>
              ))}
              {sansTrame.length > 15 ? (
                <li className="attenue">… et {sansTrame.length - 15} autre(s)</li>
              ) : null}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  )
}
