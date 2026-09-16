'use client'

import { useActionState, useState } from 'react'
import { formaterDate, formaterMontant, formaterPrixUnitaire, LIBELLES_UNITE } from '../../../../lib/format'
import type { CandidatDTO, DecompteMissionDTO, EcarteDTO } from '../../../../application/cloture/service'
import { actionCloturer, actionRouvrir, actionVerserPrix, type EtatCloture } from './actions'

const LIBELLES_MOTIF: Record<string, string> = {
  non_chiffre_par_entreprise: 'non chiffré par l’entreprise retenue',
  sans_unite: 'sans unité',
  prix_nul: 'prix à zéro',
}

function montantSigne(centimes: string): string {
  const negatif = centimes.startsWith('-')
  const texte = formaterMontant(negatif ? centimes.slice(1) : centimes)
  return negatif ? `-${texte}` : texte
}

export function ClotureOperation({
  missionId,
  decompte,
  candidats,
  ecartes,
  nbLotsSansAttribution,
  etat,
}: {
  missionId: string
  decompte: DecompteMissionDTO
  candidats: readonly CandidatDTO[]
  ecartes: readonly EcarteDTO[]
  nbLotsSansAttribution: number
  etat: { archivee: boolean; archiveeLe: string | null; statut: string; nbPrixVerses: number }
}) {
  return (
    <>
      <SectionDecompte missionId={missionId} decompte={decompte} />
      <SectionReinjection
        missionId={missionId}
        candidats={candidats}
        ecartes={ecartes}
        nbLotsSansAttribution={nbLotsSansAttribution}
        nbDejaVerses={etat.nbPrixVerses}
      />
      <SectionArchivage missionId={missionId} etat={etat} />
    </>
  )
}

/* ---------------------------------------------------------------------- */

function SectionDecompte({ missionId, decompte }: { missionId: string; decompte: DecompteMissionDTO }) {
  return (
    <section className="carte" style={{ marginBottom: 22 }}>
      <div className="carte-entete">
        <h2>Décompte général</h2>
        <a href={`/missions/${missionId}/cloture/decompte`} className="bouton bouton-primaire" download>
          Projet de décompte (Word)
        </a>
      </div>

      <div className="total-bandeau">
        <div>
          <p className="surtitre">Marché actuel HT</p>
          <p className="valeur">{formaterMontant(decompte.marcheActuelHt)}</p>
        </div>
        <div>
          <p className="surtitre">Travaux exécutés</p>
          <p className="valeur">{formaterMontant(decompte.travauxExecutesHt)}</p>
          <p className="attenue" style={{ fontSize: 12.5 }}>
            {decompte.executePourcent !== null
              ? `${decompte.executePourcent.replace('.', ',')} % du marché`
              : 'aucun marché'}
          </p>
        </div>
        <div>
          <p className="surtitre">Non exécuté</p>
          <p className="valeur">{montantSigne(decompte.soldeNonExecuteHt)}</p>
        </div>
        <div>
          <p className="surtitre">Retenue à restituer</p>
          <p className="valeur">{formaterMontant(decompte.retenueGarantieARestituerHt)}</p>
          <p className="attenue" style={{ fontSize: 12.5 }}>à la levée des réserves</p>
        </div>
      </div>

      {decompte.lots.length > 0 ? (
        <div className="defilement">
          <table className="tableau">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Entreprise</th>
                <th style={{ textAlign: 'right' }}>Marché actuel</th>
                <th style={{ textAlign: 'right' }}>Exécuté</th>
                <th style={{ textAlign: 'right' }}>Non exécuté</th>
                <th style={{ textAlign: 'right' }}>Retenue</th>
                <th style={{ textAlign: 'right' }}>Net réglé</th>
                <th>Situations</th>
              </tr>
            </thead>
            <tbody>
              {decompte.lots.map((lot) => (
                <tr key={lot.lotId}>
                  <td>
                    <span className="mono">{lot.numero}</span> {lot.intitule}
                  </td>
                  <td style={{ fontSize: 13.5 }}>
                    {lot.entrepriseNom ?? <span className="attenue">non attribué</span>}
                  </td>
                  <td className="chiffre">{formaterMontant(lot.marcheActuelHt)}</td>
                  <td className="chiffre">{formaterMontant(lot.travauxExecutesHt)}</td>
                  <td className="chiffre attenue">{montantSigne(lot.soldeNonExecuteHt)}</td>
                  <td className="chiffre attenue">{formaterMontant(lot.retenueGarantieARestituerHt)}</td>
                  <td className="chiffre">{formaterMontant(lot.netRegleHt)}</td>
                  <td className="chiffre">{lot.nbSituations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)' }}>
        <p className="attenue" style={{ fontSize: 13, margin: 0, maxWidth: '78ch' }}>
          Le document produit ne comporte ni révision de prix, ni actualisation, ni intérêts
          moratoires, ni pénalités : rien de tout cela n’est tenu par l’application, et l’inventer
          produirait un document faux sur un sujet contractuel. C’est un projet de décompte, à
          compléter avant signature — le document le dit lui-même.
        </p>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------- */

function SectionReinjection({
  missionId,
  candidats,
  ecartes,
  nbLotsSansAttribution,
  nbDejaVerses,
}: {
  missionId: string
  candidats: readonly CandidatDTO[]
  ecartes: readonly EcarteDTO[]
  nbLotsSansAttribution: number
  nbDejaVerses: number
}) {
  const [etat, verser] = useActionState<EtatCloture, FormData>(actionVerserPrix, {})
  const [coches, setCoches] = useState<Set<string>>(() => new Set())

  const basculer = (posteId: string): void => {
    setCoches((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(posteId)) suivant.delete(posteId)
      else suivant.add(posteId)
      return suivant
    })
  }

  const toutCocher = (): void => {
    setCoches(new Set(candidats.filter((c) => !c.dejaEnBase).map((c) => c.posteId)))
  }

  return (
    <section className="carte" style={{ marginBottom: 22 }}>
      <div className="carte-entete">
        <h2>Verser les prix réels dans la base</h2>
        <span className="attenue" style={{ fontSize: 13 }}>
          {candidats.length} prix disponible(s)
          {nbDejaVerses > 0 ? ` · ${nbDejaVerses} déjà versé(s) depuis cette opération` : ''}
        </span>
      </div>

      <div className="carte-corps">
        <p style={{ marginTop: 0, fontSize: 14, maxWidth: '78ch' }}>
          Les prix proposés viennent des <strong>offres retenues</strong>, jamais de votre estimatif :
          verser son propre chiffrage reviendrait à se citer soi-même comme référence. Rien n’entre
          en base sans que vous ayez coché la ligne.
        </p>
        {nbLotsSansAttribution > 0 ? (
          <p className="attenue" style={{ fontSize: 13.5 }}>
            {nbLotsSansAttribution} lot(s) sans attribution ne proposent aucun prix : il n’y a pas de
            prix réel à verser tant qu’aucune offre n’est retenue.
          </p>
        ) : null}
      </div>

      {candidats.length === 0 ? (
        <p className="vide">
          Aucun prix à verser pour l’instant : il y faut une offre retenue, chiffrée ligne à ligne.
        </p>
      ) : (
        <form action={verser}>
          <input type="hidden" name="missionId" value={missionId} />
          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Lot</th>
                  <th>Désignation</th>
                  <th>Unité</th>
                  <th style={{ textAlign: 'right' }}>Prix réel</th>
                  <th style={{ textAlign: 'right' }}>Estimatif</th>
                  <th style={{ textAlign: 'right' }}>Écart</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {candidats.map((candidat) => (
                  <tr key={candidat.posteId}>
                    <td>
                      <input
                        type="checkbox"
                        name="posteIds"
                        value={candidat.posteId}
                        checked={coches.has(candidat.posteId)}
                        onChange={() => basculer(candidat.posteId)}
                        aria-label={`Verser ${candidat.designation}`}
                        style={{ width: 'auto' }}
                      />
                    </td>
                    <td className="mono attenue" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {candidat.lotLibelle}
                    </td>
                    <td style={{ fontSize: 13.5 }}>
                      {candidat.code ? <span className="mono">{candidat.code} </span> : null}
                      {candidat.designation}
                    </td>
                    <td className="mono attenue" style={{ fontSize: 12.5 }}>
                      {LIBELLES_UNITE[candidat.unite] ?? candidat.unite}
                    </td>
                    <td className="chiffre" style={{ fontWeight: 600 }}>
                      {formaterPrixUnitaire(candidat.prixReelHt, 2)}
                    </td>
                    <td className="chiffre attenue">
                      {candidat.prixEstimeHt !== null
                        ? formaterPrixUnitaire(candidat.prixEstimeHt, 2)
                        : '—'}
                    </td>
                    <td className="chiffre attenue">
                      {candidat.ecartPourcent !== null
                        ? `${candidat.ecartPourcent.replace('.', ',').replace(/^(?!-)/, '+')} %`
                        : '—'}
                    </td>
                    <td>
                      {candidat.dejaEnBase ? (
                        <span className="etiquette" title="Un prix proche existe déjà : verser celui-ci ajoutera une seconde référence, ce qui nourrit la dispersion.">
                          déjà en base
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="bouton bouton-discret" onClick={toutCocher}>
              Tout cocher sauf les doublons
            </button>
            <button type="button" className="bouton bouton-discret" onClick={() => setCoches(new Set())}>
              Tout décocher
            </button>
            <button type="submit" className="bouton bouton-primaire" disabled={coches.size === 0}>
              {coches.size === 0 ? 'Verser les prix cochés' : `Verser ${coches.size} prix dans la base`}
            </button>
            {etat.erreur ? <p className="message-erreur" role="alert" style={{ margin: 0 }}>{etat.erreur}</p> : null}
            {etat.succes ? <p className="attenue" style={{ margin: 0, fontSize: 13.5 }}>{etat.succes}</p> : null}
          </div>
        </form>
      )}

      {ecartes.length > 0 ? (
        <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)' }}>
          <p className="surtitre" style={{ marginBottom: 8 }}>
            {ecartes.length} poste(s) écarté(s), et pourquoi
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {ecartes.slice(0, 12).map((ecarte) => (
              <li key={ecarte.posteId} style={{ marginBottom: 3 }}>
                <span className="attenue">{ecarte.lotLibelle}</span> — {ecarte.designation} :{' '}
                {LIBELLES_MOTIF[ecarte.motif] ?? ecarte.motif}
              </li>
            ))}
            {ecartes.length > 12 ? (
              <li className="attenue">… et {ecartes.length - 12} autre(s)</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

/* ---------------------------------------------------------------------- */

function SectionArchivage({
  missionId,
  etat,
}: {
  missionId: string
  etat: { archivee: boolean; archiveeLe: string | null; statut: string; nbPrixVerses: number }
}) {
  const [etatCloture, cloturer] = useActionState<EtatCloture, FormData>(actionCloturer, {})
  const [etatReouverture, rouvrir] = useActionState<EtatCloture, FormData>(actionRouvrir, {})

  return (
    <section className="carte">
      <div className="carte-entete">
        <h2>Archivage</h2>
        {etat.archivee ? (
          <span className="etiquette etiquette-accent">clôturée le {formaterDate(etat.archiveeLe)}</span>
        ) : null}
      </div>
      <div className="carte-corps">
        {etat.archivee ? (
          <>
            <p style={{ marginTop: 0, fontSize: 14, maxWidth: '76ch' }}>
              L’opération est clôturée. Elle reste entièrement consultable — chiffrage, pièces,
              offres, situations, journal — et sort simplement des opérations en cours.
            </p>
            <form action={rouvrir}>
              <input type="hidden" name="missionId" value={missionId} />
              <button type="submit" className="bouton">Rouvrir l’opération</button>
            </form>
            {etatReouverture.erreur ? (
              <p className="message-erreur" style={{ marginTop: 10 }} role="alert">{etatReouverture.erreur}</p>
            ) : null}
          </>
        ) : (
          <>
            <p style={{ marginTop: 0, fontSize: 14, maxWidth: '76ch' }}>
              Clôturer passe l’opération en « terminée » et l’horodate. Rien n’est supprimé ni
              verrouillé, et l’opération peut être rouverte : une clôture prononcée trop tôt ne doit
              pas être un piège.
            </p>
            {etat.nbPrixVerses === 0 ? (
              <p className="attenue" style={{ fontSize: 13.5, maxWidth: '76ch' }}>
                Aucun prix n’a encore été versé dans votre base depuis cette opération. C’est le
                moment : après la clôture, l’écran reste accessible, mais l’occasion passe souvent.
              </p>
            ) : null}
            <form action={cloturer}>
              <input type="hidden" name="missionId" value={missionId} />
              <button type="submit" className="bouton bouton-primaire">Clôturer l’opération</button>
            </form>
            {etatCloture.erreur ? (
              <p className="message-erreur" style={{ marginTop: 10 }} role="alert">{etatCloture.erreur}</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
