'use client'

import { useCallback, useRef, useState } from 'react'
import {
  CATEGORIES,
  EXTENSIONS_ACCEPTEES,
  LIBELLES_CATEGORIE,
  formaterTaille,
  type CategoriePiece,
} from '../domain/pieces/validation'
import { formaterDate } from '../lib/format'
import type { PieceJointeDTO } from '../application/dto'
import { actionModifierPiece, actionSupprimerPiece } from '../app/missions/actions-pieces'

/**
 * Pièces du dossier — plans, rapports, diagnostics.
 *
 * Les fichiers sont envoyés un par un par une route HTTP : une action serveur
 * plafonne à un mégaoctet, ce qui ne laisse pas passer un plan. Un par un, on
 * sait aussi dire lequel a échoué, au lieu de perdre tout un envoi.
 */

interface Envoi {
  readonly nom: string
  readonly etat: 'en_cours' | 'fait' | 'echec'
  readonly message?: string
}

export interface LotChoisissable {
  readonly id: string
  readonly numero: string
  readonly intitule: string
}

export function PiecesDossier({
  missionId,
  lots,
  piecesInitiales,
}: {
  missionId: string
  lots: readonly LotChoisissable[]
  piecesInitiales: readonly PieceJointeDTO[]
}) {
  const [pieces, setPieces] = useState<readonly PieceJointeDTO[]>(piecesInitiales)
  const [categorie, setCategorie] = useState<CategoriePiece>('PLAN')
  const [lotId, setLotId] = useState('')
  const [inclureAuDce, setInclureAuDce] = useState(true)
  const [envois, setEnvois] = useState<readonly Envoi[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [survol, setSurvol] = useState(false)
  const champFichier = useRef<HTMLInputElement>(null)

  const envoyer = useCallback(
    async (fichiers: FileList | File[]) => {
      const liste = [...fichiers]
      if (liste.length === 0) return
      setErreur(null)
      setEnvois(liste.map((f) => ({ nom: f.name, etat: 'en_cours' as const })))

      for (const [index, fichier] of liste.entries()) {
        const formulaire = new FormData()
        formulaire.append('fichier', fichier)
        formulaire.append('categorie', categorie)
        if (lotId !== '') formulaire.append('lotId', lotId)
        formulaire.append('inclureAuDce', inclureAuDce ? 'oui' : 'non')

        try {
          const reponse = await fetch(`/missions/${missionId}/pieces/depot`, {
            method: 'POST',
            body: formulaire,
          })
          const corps = (await reponse.json()) as { piece?: PieceJointeDTO; erreur?: string }
          if (!reponse.ok || !corps.piece) {
            throw new Error(corps.erreur ?? 'Dépôt refusé.')
          }
          const deposee = corps.piece
          setPieces((precedentes) => [...precedentes, deposee])
          setEnvois((precedents) =>
            precedents.map((e, i) => (i === index ? { ...e, etat: 'fait' as const } : e)),
          )
        } catch (probleme) {
          const message = probleme instanceof Error ? probleme.message : 'Dépôt impossible.'
          setEnvois((precedents) =>
            precedents.map((e, i) => (i === index ? { ...e, etat: 'echec' as const, message } : e)),
          )
        }
      }

      if (champFichier.current) champFichier.current.value = ''
    },
    [categorie, inclureAuDce, lotId, missionId],
  )

  const tenter = useCallback(async (action: () => Promise<PieceJointeDTO[]>) => {
    try {
      setPieces(await action())
      setErreur(null)
    } catch (probleme) {
      setErreur(probleme instanceof Error ? probleme.message : 'Opération impossible.')
    }
  }, [])

  const parCategorie = new Map<string, PieceJointeDTO[]>()
  for (const piece of pieces) {
    const liste = parCategorie.get(piece.categorie) ?? []
    liste.push(piece)
    parCategorie.set(piece.categorie, liste)
  }

  const totalOctets = pieces.reduce((somme, piece) => somme + piece.tailleOctets, 0)
  const nbAuDce = pieces.filter((piece) => piece.inclureAuDce).length

  return (
    <>
      <div className="carte" style={{ marginBottom: 20 }}>
        <div className="carte-entete">
          <h2>Déposer des pièces</h2>
          <span className="attenue" style={{ fontSize: 13 }}>
            {pieces.length} pièce(s) · {formaterTaille(totalOctets)} · {nbAuDce} au dossier de
            consultation
          </span>
        </div>

        <div style={{ padding: 16 }}>
          <div
            style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}
          >
            <div className="champ" style={{ width: 210 }}>
              <label htmlFor="piece-categorie">Nature des pièces</label>
              <select
                id="piece-categorie"
                value={categorie}
                onChange={(e) => setCategorie(e.target.value as CategoriePiece)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {LIBELLES_CATEGORIE[c]}
                  </option>
                ))}
              </select>
            </div>

            <div className="champ" style={{ flex: '0 1 320px' }}>
              <label htmlFor="piece-lot">Lot concerné</label>
              <select id="piece-lot" value={lotId} onChange={(e) => setLotId(e.target.value)}>
                <option value="">Toute l’opération</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.numero} — {lot.intitule}
                  </option>
                ))}
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 8 }}>
              <input
                type="checkbox"
                checked={inclureAuDce}
                onChange={(e) => setInclureAuDce(e.target.checked)}
              />
              <span style={{ fontSize: 14 }}>Joindre au dossier de consultation</span>
            </label>
          </div>

          {/* Un champ de fichier natif affiche son libellé dans la langue du
              navigateur : on le cache derrière le nôtre. */}
          <input
            ref={champFichier}
            id="piece-fichiers"
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) void envoyer(e.target.files)
            }}
          />

          <div
            className={survol ? 'zone-depot zone-depot-survol' : 'zone-depot'}
            onDragOver={(e) => {
              e.preventDefault()
              setSurvol(true)
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault()
              setSurvol(false)
              if (e.dataTransfer.files) void envoyer(e.dataTransfer.files)
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>Glissez vos fichiers ici</p>
            <p className="attenue" style={{ margin: '4px 0 12px', fontSize: 13 }}>
              PDF, DWG, DXF, IFC, bureautique et images — jusqu’à 200 Mo par fichier.
            </p>
            <button
              type="button"
              className="bouton bouton-primaire"
              onClick={() => champFichier.current?.click()}
            >
              Choisir des fichiers
            </button>
          </div>

          {envois.length > 0 ? (
            <ul className="liste-envois">
              {envois.map((envoi) => (
                <li key={envoi.nom}>
                  <span className="mono" style={{ fontSize: 12.5 }}>
                    {envoi.etat === 'en_cours' ? '…' : envoi.etat === 'fait' ? '✓' : '×'}
                  </span>{' '}
                  {envoi.nom}
                  {envoi.message ? (
                    <span style={{ color: 'var(--color-danger)' }}> — {envoi.message}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {erreur ? (
        <p className="message-erreur" role="alert" style={{ marginBottom: 12 }}>
          {erreur}
        </p>
      ) : null}

      {pieces.length === 0 ? (
        <div className="carte">
          <p className="vide">
            Aucune pièce déposée. Les plans, rapports de sol et diagnostics déposés ici partiront
            avec le dossier de consultation.
          </p>
        </div>
      ) : null}

      {CATEGORIES.filter((c) => parCategorie.has(c)).map((cat) => (
        <section key={cat} className="carte" style={{ marginBottom: 16, overflow: 'hidden' }}>
          <div className="carte-entete">
            <h2>{LIBELLES_CATEGORIE[cat]}</h2>
            <span className="attenue" style={{ fontSize: 13 }}>
              {parCategorie.get(cat)?.length} pièce(s)
            </span>
          </div>

          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Libellé</th>
                  <th style={{ width: 90 }}>Indice</th>
                  <th style={{ minWidth: 200 }}>Fichier</th>
                  <th style={{ width: 200 }}>Lot concerné</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Taille</th>
                  <th style={{ width: 110 }}>Déposée le</th>
                  <th style={{ width: 90, textAlign: 'center' }}>Au DCE</th>
                  <th style={{ width: 150 }} />
                </tr>
              </thead>
              <tbody>
                {(parCategorie.get(cat) ?? []).map((piece) => (
                  <tr key={piece.id}>
                    <td>
                      <input
                        className="cellule"
                        aria-label="Libellé de la pièce"
                        placeholder={piece.nomFichier}
                        defaultValue={piece.libelle ?? ''}
                        onBlur={(e) => {
                          if ((piece.libelle ?? '') !== e.target.value) {
                            void tenter(() =>
                              actionModifierPiece(missionId, piece.id, { libelle: e.target.value }),
                            )
                          }
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="cellule"
                        aria-label="Indice"
                        placeholder="—"
                        defaultValue={piece.indice ?? ''}
                        onBlur={(e) => {
                          if ((piece.indice ?? '') !== e.target.value) {
                            void tenter(() =>
                              actionModifierPiece(missionId, piece.id, { indice: e.target.value }),
                            )
                          }
                        }}
                      />
                    </td>
                    <td>
                      <a
                        href={`/missions/${missionId}/pieces/${piece.id}`}
                        className="mono"
                        style={{ fontSize: 12.5 }}
                        download
                      >
                        {piece.nomFichier}
                      </a>
                    </td>
                    <td>
                      <select
                        className="cellule"
                        aria-label="Lot concerné"
                        value={piece.lotId ?? ''}
                        onChange={(e) =>
                          void tenter(() =>
                            actionModifierPiece(missionId, piece.id, {
                              lotId: e.target.value === '' ? null : e.target.value,
                            }),
                          )
                        }
                      >
                        <option value="">Toute l’opération</option>
                        {lots.map((lot) => (
                          <option key={lot.id} value={lot.id}>
                            {lot.numero} — {lot.intitule}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }} className="mono">
                      {formaterTaille(piece.tailleOctets)}
                    </td>
                    <td>{formaterDate(piece.deposeLe)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label="Joindre au dossier de consultation"
                        title="Décochée, la pièce reste interne et ne part pas aux entreprises."
                        checked={piece.inclureAuDce}
                        onChange={(e) =>
                          void tenter(() =>
                            actionModifierPiece(missionId, piece.id, {
                              inclureAuDce: e.target.checked,
                            }),
                          )
                        }
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a
                          className="bouton bouton-discret"
                          href={`/missions/${missionId}/pieces/${piece.id}`}
                          download
                        >
                          Télécharger
                        </a>
                        <button
                          type="button"
                          className="bouton bouton-discret bouton-danger"
                          title="Supprimer cette pièce"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Supprimer « ${piece.libelle ?? piece.nomFichier} » ? Le fichier sera effacé du dossier.`,
                              )
                            ) {
                              void tenter(() => actionSupprimerPiece(missionId, piece.id))
                            }
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="attenue" style={{ fontSize: 12.5, marginTop: 8 }}>
        Extensions acceptées : {EXTENSIONS_ACCEPTEES.join(', ')}.
      </p>
    </>
  )
}
