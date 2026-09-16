'use client'

import { useState } from 'react'
import {
  COLONNES_COLLABLES,
  LIBELLES_COLONNE,
  type ColonneCollable,
  type MappageCollage,
} from '../application/chiffrage/mappage-collage'

/**
 * Confirmation d'un collage — SPEC_APP_ECONOMISTE.md §5.2.
 *
 * Le collage remplissait autrefois les colonnes dans l'ordre de la grille. Un
 * tableur bâti autrement — le prix avant la quantité, cas courant — versait donc
 * le prix dans la quantité sans que rien ne le signale, puisque les deux valeurs
 * sont parfaitement lisibles. Cet écran est le correctif : on montre ce qu'on a
 * compris, et on ne colle qu'une fois que l'économiste l'a validé.
 *
 * Les colonnes dont la nature relève de la devinette — typiquement départager
 * une quantité d'un prix — sont marquées « à vérifier » plutôt que présentées
 * comme acquises.
 */

const LIGNES_APERCU = 6

export interface CollageEnAttente {
  readonly lotId: string
  readonly posteId: string
  readonly colonne: ColonneCollable
  readonly lignes: readonly (readonly string[])[]
  readonly proposition: MappageCollage
}

export function ConfirmationCollage({
  collage,
  onAnnuler,
  onConfirmer,
}: {
  collage: CollageEnAttente
  onAnnuler: () => void
  onConfirmer: (mappage: (ColonneCollable | null)[], lignes: string[][]) => void
}) {
  const [mappage, setMappage] = useState<(ColonneCollable | null)[]>(() =>
    collage.proposition.colonnes.map((c) => c.colonne),
  )
  const [ignorerEntete, setIgnorerEntete] = useState(collage.proposition.enteteDetectee)

  const largeur = collage.proposition.colonnes.length
  const lignesAColler = ignorerEntete ? collage.lignes.slice(1) : collage.lignes
  const apercu = lignesAColler.slice(0, LIGNES_APERCU)

  /** Un même champ ne peut pas recevoir deux colonnes : la dernière gagne. */
  const choisir = (index: number, valeur: string): void => {
    const colonne = valeur === '' ? null : (valeur as ColonneCollable)
    setMappage((precedent) =>
      precedent.map((actuel, i) => {
        if (i === index) return colonne
        return colonne !== null && actuel === colonne ? null : actuel
      }),
    )
  }

  const aVerifier = collage.proposition.colonnes.some((c, i) => !c.certain && mappage[i] !== null)
  const riennAColler = mappage.every((c) => c === null) || lignesAColler.length === 0

  return (
    <div className="voile" role="dialog" aria-modal="true" aria-label="Confirmer le collage">
      <div className="modale">
        <div className="carte-entete">
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>À quoi correspondent ces colonnes ?</h2>
          <span className="attenue" style={{ fontSize: 13 }}>
            {lignesAColler.length} ligne(s) · {largeur} colonne(s)
          </span>
        </div>

        <div className="carte-corps">
          <p style={{ marginTop: 0, fontSize: 14, maxWidth: '76ch' }}>
            Votre tableur ne range pas forcément ses colonnes dans l’ordre de la grille. Vérifiez
            la correspondance avant de coller : une quantité prise pour un prix fausse un montant
            sans rien signaler.
          </p>
          {aVerifier ? (
            <p className="message-avertissement" style={{ fontSize: 13.5, margin: '0 0 4px' }}>
              Les colonnes marquées « à vérifier » ont été devinées d’après leur contenu. Confirmez
              surtout la quantité et le prix unitaire.
            </p>
          ) : null}
          {collage.proposition.enteteDetectee ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={ignorerEntete}
                onChange={(e) => setIgnorerEntete(e.target.checked)}
                style={{ width: 'auto' }}
              />
              La première ligne est un en-tête : ne pas la coller
            </label>
          ) : null}
        </div>

        <div className="defilement">
          <table className="tableau">
            <thead>
              <tr>
                {collage.proposition.colonnes.map((proposition, index) => (
                  <th key={index} style={{ minWidth: 150 }}>
                    {/* En colonne : posée à côté du sélecteur, l'étiquette
                        débordait du tableau et se retrouvait tronquée. */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 5,
                      }}
                    >
                      <select
                        value={mappage[index] ?? ''}
                        onChange={(e) => choisir(index, e.target.value)}
                        aria-label={`Colonne ${index + 1}`}
                        style={{ width: '100%' }}
                      >
                        <option value="">— ne pas coller —</option>
                        {COLONNES_COLLABLES.map((colonne) => (
                          <option key={colonne} value={colonne}>
                            {LIBELLES_COLONNE[colonne]}
                          </option>
                        ))}
                      </select>
                      {!proposition.certain && mappage[index] !== null ? (
                        <span className="etiquette etiquette-alerte">à vérifier</span>
                      ) : null}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apercu.map((ligne, indexLigne) => (
                <tr key={indexLigne}>
                  {Array.from({ length: largeur }, (_, indexColonne) => (
                    <td
                      key={indexColonne}
                      style={{
                        fontSize: 13,
                        opacity: mappage[indexColonne] === null ? 0.35 : 1,
                        whiteSpace: 'nowrap',
                        maxWidth: 240,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {ligne[indexColonne] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {lignesAColler.length > apercu.length ? (
          <p className="attenue" style={{ fontSize: 12.5, padding: '8px 20px', margin: 0 }}>
            … et {lignesAColler.length - apercu.length} ligne(s) de plus.
          </p>
        ) : null}

        <div
          className="carte-corps"
          style={{
            borderTop: '1px solid var(--color-filet)',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
          }}
        >
          <button type="button" className="bouton" onClick={onAnnuler}>
            Annuler
          </button>
          <button
            type="button"
            className="bouton bouton-primaire"
            disabled={riennAColler}
            onClick={() =>
              onConfirmer(
                mappage,
                lignesAColler.map((ligne) => [...ligne]),
              )
            }
          >
            Coller {lignesAColler.length} ligne(s)
          </button>
        </div>
      </div>
    </div>
  )
}
