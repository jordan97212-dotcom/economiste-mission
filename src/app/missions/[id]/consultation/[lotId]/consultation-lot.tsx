'use client'

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formaterMontant } from '../../../../../lib/format'

/** L'écart affiche toujours son signe, y compris quand il est positif. */
function formaterMontantSigne(centimes: string): string {
  const negatif = centimes.startsWith('-')
  const texte = formaterMontant(negatif ? centimes.slice(1) : centimes)
  return negatif ? `-${texte}` : `+${texte}`
}
import {
  actionCreerConsultation,
  actionEnregistrerBrouillon,
  actionEnregistrerOffreGlobale,
  actionImporterOffreExcel,
  actionModifierConsultation,
  actionSupprimerConsultation,
  actionSupprimerOffre,
  type EtatConsultation,
} from './actions'

const LIBELLES_STATUT_CONSULTATION: Record<string, string> = {
  ENVOYEE: 'Envoyée',
  RELANCEE: 'Relancée',
  OFFRE_RECUE: 'Offre reçue',
  SANS_REPONSE: 'Sans réponse',
  DESISTEMENT: 'Désistement',
}

export interface EntrepriseOption {
  readonly id: string
  readonly raisonSociale: string
}

export interface ConsultationAffichee {
  readonly id: string
  readonly entrepriseId: string
  readonly entrepriseNom: string
  readonly statut: string
  readonly dateEnvoiDce: string | null
  readonly dateLimiteRemise: string | null
  readonly dateRelance: string | null
  readonly dateReceptionOffre: string | null
  readonly nbOffres: number
}

export interface ColonneComparatifAffichee {
  readonly offreId: string
  readonly entrepriseNom: string
  readonly type: 'BASE' | 'VARIANTE' | 'OPTION'
  readonly libelle: string | null
  readonly classee: boolean
  readonly ecartComparable: boolean
  readonly montantHt: string
  readonly remiseGlobaleHt: string
  readonly montantNetHt: string
  readonly ecartMontantHt: string
  readonly ecartPourcent: string | null
  readonly conforme: boolean
  readonly detaillee: boolean
  readonly moinsDisante: boolean
}

export interface LigneComparatifAffichee {
  readonly posteId: string
  readonly code: string | null
  readonly designation: string
  readonly unite: string | null
  readonly montantEstimeHt: string
  readonly cellules: readonly { offreId: string; montantHt: string | null }[]
  readonly anomalies: readonly { offreId: string; message: string }[]
}

export interface TableauAffiche {
  readonly montantEstimeHt: string
  readonly colonnes: readonly ColonneComparatifAffichee[]
  readonly lignes: readonly LigneComparatifAffichee[]
  readonly anomaliesGlobales: readonly { offreId: string; message: string }[]
}

const DELAI_ENREGISTREMENT = 1200

export function ConsultationLot({
  missionId,
  lotId,
  entreprises,
  entreprisesDejaConsultees,
  consultations,
  tableau,
  brouillon,
  brouillonSuggere,
}: {
  missionId: string
  lotId: string
  entreprises: readonly EntrepriseOption[]
  entreprisesDejaConsultees: readonly string[]
  consultations: readonly ConsultationAffichee[]
  tableau: TableauAffiche
  brouillon: string
  brouillonSuggere: string
}) {
  const dejaConsultees = useMemo(() => new Set(entreprisesDejaConsultees), [entreprisesDejaConsultees])
  const disponibles = entreprises.filter((e) => !dejaConsultees.has(e.id))

  return (
    <>
      <SectionConsultations
        missionId={missionId}
        lotId={lotId}
        disponibles={disponibles}
        consultations={consultations}
      />
      <SectionOffres missionId={missionId} lotId={lotId} consultations={consultations} tableau={tableau} />
      <SectionComparatif tableau={tableau} />
      <SectionBrouillon
        missionId={missionId}
        lotId={lotId}
        brouillonInitial={brouillon}
        brouillonSuggere={brouillonSuggere}
      />
    </>
  )
}

/* ---------------------------------------------------------------------- */

function SectionConsultations({
  missionId,
  lotId,
  disponibles,
  consultations,
}: {
  missionId: string
  lotId: string
  disponibles: readonly EntrepriseOption[]
  consultations: readonly ConsultationAffichee[]
}) {
  const [etat, ajouter] = useActionState<EtatConsultation, FormData>(actionCreerConsultation, {})

  return (
    <section className="carte" style={{ marginBottom: 22 }}>
      <div className="carte-entete">
        <h2>Entreprises consultées</h2>
        <span className="attenue" style={{ fontSize: 13 }}>{consultations.length} consultation(s)</span>
      </div>

      {consultations.length === 0 ? (
        <p className="vide">Aucune entreprise consultée sur ce lot. Ajoutez-en une ci-dessous.</p>
      ) : (
        <div className="defilement">
          <table className="tableau">
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Statut</th>
                <th>Envoi DCE</th>
                <th>Date limite</th>
                <th>Relance</th>
                <th>Offre reçue</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {consultations.map((c) => (
                <LigneConsultation key={c.id} missionId={missionId} lotId={lotId} consultation={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)' }}>
        {disponibles.length === 0 ? (
          <p className="attenue" style={{ fontSize: 13.5, margin: 0 }}>
            Toutes les entreprises du répertoire sont déjà consultées sur ce lot.{' '}
            <a href="/entreprises">Ajouter une entreprise au répertoire.</a>
          </p>
        ) : (
          <form action={ajouter} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input type="hidden" name="missionId" value={missionId} />
            <input type="hidden" name="lotId" value={lotId} />
            <div className="champ" style={{ minWidth: 220 }}>
              <label htmlFor="entrepriseId">Entreprise à consulter</label>
              <select id="entrepriseId" name="entrepriseId" required>
                {disponibles.map((e) => (
                  <option key={e.id} value={e.id}>{e.raisonSociale}</option>
                ))}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="dateEnvoiDce">Envoi du DCE</label>
              <input id="dateEnvoiDce" name="dateEnvoiDce" type="date" />
            </div>
            <div className="champ">
              <label htmlFor="dateLimiteRemise">Date limite de remise</label>
              <input id="dateLimiteRemise" name="dateLimiteRemise" type="date" />
            </div>
            <button type="submit" className="bouton bouton-primaire">Ajouter à la consultation</button>
          </form>
        )}
        {etat.erreur ? <p className="message-erreur" style={{ marginTop: 10 }} role="alert">{etat.erreur}</p> : null}
      </div>
    </section>
  )
}

function LigneConsultation({
  missionId,
  lotId,
  consultation,
}: {
  missionId: string
  lotId: string
  consultation: ConsultationAffichee
}) {
  const [etat, modifier] = useActionState<EtatConsultation, FormData>(actionModifierConsultation, {})
  const [, supprimer] = useActionState<EtatConsultation, FormData>(actionSupprimerConsultation, {})

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{consultation.entrepriseNom}</td>
      <td>
        <form action={modifier} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="hidden" name="missionId" value={missionId} />
          <input type="hidden" name="lotId" value={lotId} />
          <input type="hidden" name="id" value={consultation.id} />
          <input type="hidden" name="dateEnvoiDce" value={consultation.dateEnvoiDce ?? ''} />
          <input type="hidden" name="dateLimiteRemise" value={consultation.dateLimiteRemise ?? ''} />
          <input type="hidden" name="dateRelance" value={consultation.dateRelance ?? ''} />
          <select name="statut" defaultValue={consultation.statut} aria-label={`Statut de ${consultation.entrepriseNom}`} style={{ width: 'auto', minWidth: 128 }}>
            {Object.entries(LIBELLES_STATUT_CONSULTATION).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>{libelle}</option>
            ))}
          </select>
          <button type="submit" className="bouton bouton-discret">Noter</button>
        </form>
        {etat.erreur ? <p className="message-erreur" style={{ marginTop: 6 }} role="alert">{etat.erreur}</p> : null}
      </td>
      <td className="mono attenue" style={{ fontSize: 12.5 }}>{consultation.dateEnvoiDce ?? '—'}</td>
      <td className="mono attenue" style={{ fontSize: 12.5 }}>{consultation.dateLimiteRemise ?? '—'}</td>
      <td className="mono attenue" style={{ fontSize: 12.5 }}>{consultation.dateRelance ?? '—'}</td>
      <td className="mono attenue" style={{ fontSize: 12.5 }}>{consultation.dateReceptionOffre ?? '—'}</td>
      <td>
        {consultation.nbOffres === 0 ? (
          <form action={supprimer} style={{ display: 'inline' }}>
            <input type="hidden" name="missionId" value={missionId} />
            <input type="hidden" name="lotId" value={lotId} />
            <input type="hidden" name="id" value={consultation.id} />
            <button type="submit" className="bouton bouton-danger">Retirer</button>
          </form>
        ) : (
          <span className="attenue" style={{ fontSize: 12.5 }} title="Retirez d’abord ses offres">
            {consultation.nbOffres} offre(s)
          </span>
        )}
      </td>
    </tr>
  )
}

/* ---------------------------------------------------------------------- */

function SectionOffres({
  missionId,
  lotId,
  consultations,
  tableau,
}: {
  missionId: string
  lotId: string
  consultations: readonly ConsultationAffichee[]
  tableau: TableauAffiche
}) {
  // Le choix explicite de l'économiste prime, mais tant qu'il n'a pas choisi —
  // ou si la consultation qu'il avait choisie a disparu — on retombe sur la
  // première de la liste. Un état figé à l'initialisation enverrait une valeur
  // vide après l'ajout de la toute première consultation, alors que le menu
  // afficherait une entreprise.
  const [choix, setChoix] = useState<string | null>(null)
  const consultationId =
    choix !== null && consultations.some((c) => c.id === choix)
      ? choix
      : (consultations[0]?.id ?? '')
  const [modeExcel, setModeExcel] = useState(false)
  const [etatGlobale, enregistrerGlobale] = useActionState<EtatConsultation, FormData>(
    actionEnregistrerOffreGlobale,
    {},
  )
  const [etatExcel, importerExcel] = useActionState<EtatConsultation, FormData>(actionImporterOffreExcel, {})

  const offresParEntreprise = new Map(tableau.colonnes.map((c) => [c.offreId, c]))

  return (
    <section className="carte" style={{ marginBottom: 22 }}>
      <div className="carte-entete">
        <h2>Offres reçues</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="attenue" style={{ fontSize: 13 }}>{tableau.colonnes.length} offre(s)</span>
          {tableau.colonnes.length > 0 ? (
            <a
              href={`/missions/${missionId}/consultation/${lotId}/comparatif`}
              className="bouton"
              download
            >
              Comparatif (.xlsx)
            </a>
          ) : null}
        </div>
      </div>

      {tableau.colonnes.length === 0 ? (
        <p className="vide">Aucune offre reçue pour l’instant.</p>
      ) : (
        <div className="defilement">
          <table className="tableau">
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Nature</th>
                <th style={{ textAlign: 'right' }}>Montant HT</th>
                <th style={{ textAlign: 'right' }}>Remise</th>
                <th style={{ textAlign: 'right' }}>Écart estimatif</th>
                <th>Détail</th>
                <th>Conforme</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tableau.colonnes.map((c) => (
                <tr key={c.offreId}>
                  <td style={{ fontWeight: 500 }}>
                    {c.entrepriseNom}{' '}
                    {c.moinsDisante ? <span className="etiquette etiquette-accent">mieux-disant</span> : null}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {c.type === 'BASE' ? (
                      <span className="attenue">base</span>
                    ) : (
                      <span className="etiquette">{c.type === 'VARIANTE' ? 'variante' : 'option'}</span>
                    )}
                    {c.libelle ? (
                      <span className="attenue" style={{ marginLeft: 6, fontSize: 12.5 }}>{c.libelle}</span>
                    ) : null}
                  </td>
                  <td className="chiffre">{formaterMontant(c.montantHt)}</td>
                  <td className="chiffre attenue">{c.remiseGlobaleHt !== '0' ? formaterMontant(c.remiseGlobaleHt) : '—'}</td>
                  <td className="chiffre">
                    {!c.ecartComparable ? (
                      <span className="attenue" title="Une option chiffre un complément, pas le dossier : l’écart vis-à-vis de l’estimatif n’aurait pas de sens.">
                        sans objet
                      </span>
                    ) : c.ecartPourcent !== null ? (
                      <span className={Number(c.ecartPourcent) < 0 ? 'attenue' : ''}>
                        {formaterMontantSigne(c.ecartMontantHt)} ({c.ecartPourcent.replace('.', ',').replace(/^(?!-)/, '+')} %)
                      </span>
                    ) : (
                      formaterMontantSigne(c.ecartMontantHt)
                    )}
                  </td>
                  <td className="attenue" style={{ fontSize: 12.5 }}>
                    {c.detaillee ? 'Ligne à ligne' : 'Montant global'}
                  </td>
                  <td>{c.conforme ? '—' : <span className="etiquette etiquette-alerte">non conforme</span>}</td>
                  <td>
                    <BoutonSupprimerOffre missionId={missionId} lotId={lotId} offreId={c.offreId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {consultations.length === 0 ? null : (
        <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)' }}>
          <div className="grille-champs" style={{ marginBottom: 10 }}>
            <div className="champ">
              <label htmlFor="consultationChoisie">Pour quelle entreprise ?</label>
              <select
                id="consultationChoisie"
                value={consultationId}
                onChange={(e) => setChoix(e.target.value)}
              >
                {consultations.map((c) => (
                  <option key={c.id} value={c.id}>{c.entrepriseNom}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button type="button" className={modeExcel ? 'bouton bouton-discret' : 'bouton bouton-primaire'} onClick={() => setModeExcel(false)}>
              Montant global
            </button>
            <button type="button" className={modeExcel ? 'bouton bouton-primaire' : 'bouton bouton-discret'} onClick={() => setModeExcel(true)}>
              DPGF rempli (.xlsx)
            </button>
          </div>

          {modeExcel ? (
            <form action={importerExcel} className="grille-champs">
              <input type="hidden" name="missionId" value={missionId} />
              <input type="hidden" name="lotId" value={lotId} />
              <input type="hidden" name="consultationId" value={consultationId} />
              <div className="champ">
                <label htmlFor="fichierOffre">Classeur rempli par l’entreprise</label>
                <input id="fichierOffre" name="fichier" type="file" accept=".xlsx,.xlsm" required />
              </div>
              <div className="champ">
                <label htmlFor="typeExcel">Nature de l’offre</label>
                <select id="typeExcel" name="type" defaultValue="BASE">
                  <option value="BASE">Base — répond au dossier</option>
                  <option value="VARIANTE">Variante — autre façon de faire</option>
                  <option value="OPTION">Option — complément chiffré à part</option>
                </select>
              </div>
              <div className="champ">
                <label htmlFor="libelleExcel">Intitulé (variantes et options)</label>
                <input id="libelleExcel" name="libelle" placeholder="Ossature bois, éclairage extérieur…" />
              </div>
              <div className="champ">
                <label htmlFor="dateReceptionExcel">Date de réception</label>
                <input id="dateReceptionExcel" name="dateReception" type="date" required />
              </div>
              <div className="champ">
                <label htmlFor="remiseExcel">Remise globale HT (optionnel)</label>
                <input id="remiseExcel" name="remiseGlobaleHt" inputMode="decimal" placeholder="0,00" className="mono" />
              </div>
              <div className="champ" style={{ alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <input id="conformeExcel" name="conforme" type="checkbox" defaultChecked style={{ width: 'auto' }} />
                <label htmlFor="conformeExcel" style={{ marginBottom: 0 }}>Offre conforme</label>
              </div>
              <div style={{ alignSelf: 'end' }}>
                <button type="submit" className="bouton bouton-primaire">Importer l’offre</button>
              </div>
              <p className="attenue" style={{ fontSize: 12.5, gridColumn: '1 / -1', margin: '4px 0 0' }}>
                Le fichier « DPGF à remplir » exporté depuis la fiche mission, tel que l’entreprise l’a renvoyé,
                sans modifier sa structure. Les lignes se retrouvent par leur identifiant, pas par leur libellé.
              </p>
            </form>
          ) : (
            <form action={enregistrerGlobale} className="grille-champs">
              <input type="hidden" name="missionId" value={missionId} />
              <input type="hidden" name="lotId" value={lotId} />
              <input type="hidden" name="consultationId" value={consultationId} />
              <div className="champ">
                <label htmlFor="typeGlobale">Nature de l’offre</label>
                <select id="typeGlobale" name="type" defaultValue="BASE">
                  <option value="BASE">Base — répond au dossier</option>
                  <option value="VARIANTE">Variante — autre façon de faire</option>
                  <option value="OPTION">Option — complément chiffré à part</option>
                </select>
              </div>
              <div className="champ">
                <label htmlFor="libelleGlobale">Intitulé (variantes et options)</label>
                <input id="libelleGlobale" name="libelle" placeholder="Ossature bois, éclairage extérieur…" />
              </div>
              <div className="champ">
                <label htmlFor="montantHt">Montant HT</label>
                <input id="montantHt" name="montantHt" required inputMode="decimal" placeholder="0,00" className="mono" />
              </div>
              <div className="champ">
                <label htmlFor="remiseGlobale">Remise globale HT (optionnel)</label>
                <input id="remiseGlobale" name="remiseGlobaleHt" inputMode="decimal" placeholder="0,00" className="mono" />
              </div>
              <div className="champ">
                <label htmlFor="dateReception">Date de réception</label>
                <input id="dateReception" name="dateReception" type="date" required />
              </div>
              <div className="champ">
                <label htmlFor="observations">Observations</label>
                <input id="observations" name="observationsTechniques" placeholder="Réserves, variantes proposées…" />
              </div>
              <div className="champ" style={{ alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <input id="conformeGlobale" name="conforme" type="checkbox" defaultChecked style={{ width: 'auto' }} />
                <label htmlFor="conformeGlobale" style={{ marginBottom: 0 }}>Offre conforme</label>
              </div>
              <div style={{ alignSelf: 'end' }}>
                <button type="submit" className="bouton bouton-primaire">Enregistrer l’offre</button>
              </div>
            </form>
          )}

          {(etatGlobale.erreur || etatGlobale.succes) && !modeExcel ? (
            <p className={etatGlobale.erreur ? 'message-erreur' : 'attenue'} style={{ marginTop: 10, fontSize: 13.5 }} role={etatGlobale.erreur ? 'alert' : undefined}>
              {etatGlobale.erreur ?? etatGlobale.succes}
            </p>
          ) : null}
          {(etatExcel.erreur || etatExcel.succes) && modeExcel ? (
            <p className={etatExcel.erreur ? 'message-erreur' : 'attenue'} style={{ marginTop: 10, fontSize: 13.5 }} role={etatExcel.erreur ? 'alert' : undefined}>
              {etatExcel.erreur ?? etatExcel.succes}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}

function BoutonSupprimerOffre({ missionId, lotId, offreId }: { missionId: string; lotId: string; offreId: string }) {
  const [, supprimer] = useActionState<EtatConsultation, FormData>(actionSupprimerOffre, {})
  return (
    <form action={supprimer}>
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="lotId" value={lotId} />
      <input type="hidden" name="offreId" value={offreId} />
      <button type="submit" className="bouton bouton-discret bouton-danger">Retirer</button>
    </form>
  )
}

/* ---------------------------------------------------------------------- */

function SectionComparatif({ tableau }: { tableau: TableauAffiche }) {
  const anomaliesParOffre = new Map<string, number>()
  for (const a of tableau.anomaliesGlobales) {
    anomaliesParOffre.set(a.offreId, (anomaliesParOffre.get(a.offreId) ?? 0) + 1)
  }
  for (const ligne of tableau.lignes) {
    for (const a of ligne.anomalies) {
      anomaliesParOffre.set(a.offreId, (anomaliesParOffre.get(a.offreId) ?? 0) + 1)
    }
  }

  const toutesAnomalies = [
    ...tableau.anomaliesGlobales.map((a) => ({ ...a, repere: 'Montant global' })),
    ...tableau.lignes.flatMap((l) => l.anomalies.map((a) => ({ ...a, repere: `${l.code ?? ''} ${l.designation}`.trim() }))),
  ]
  // Une même entreprise peut remettre une base et une variante : son seul nom
  // ne suffit plus à désigner l'offre visée par un écart.
  const nomParOffre = new Map(
    tableau.colonnes.map((c) => [
      c.offreId,
      c.type === 'BASE'
        ? c.entrepriseNom
        : `${c.entrepriseNom} (${c.type === 'VARIANTE' ? 'variante' : 'option'}${c.libelle ? ` — ${c.libelle}` : ''})`,
    ]),
  )

  return (
    <section className="carte" style={{ marginBottom: 22 }}>
      <div className="carte-entete">
        <h2>Tableau comparatif</h2>
        {toutesAnomalies.length > 0 ? (
          <span className="etiquette etiquette-alerte">{toutesAnomalies.length} écart(s) à vérifier</span>
        ) : null}
      </div>

      {tableau.colonnes.length === 0 ? (
        <p className="vide">Le tableau se construit dès la première offre reçue.</p>
      ) : (
        <>
          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Poste</th>
                  <th style={{ textAlign: 'right' }}>Estimatif</th>
                  {tableau.colonnes.map((c) => (
                    <th key={c.offreId} style={{ textAlign: 'right' }}>
                      {c.entrepriseNom}{c.moinsDisante ? ' ★' : ''}
                      {/* Une entreprise peut remettre plusieurs offres : la
                          colonne dit laquelle. */}
                      {c.type !== 'BASE' ? (
                        <span style={{ display: 'block', fontWeight: 400, textTransform: 'none' }}>
                          {c.type === 'VARIANTE' ? 'variante' : 'option'}
                          {c.libelle ? ` — ${c.libelle}` : ''}
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableau.lignes.map((ligne) => (
                  <tr key={ligne.posteId}>
                    <td>
                      <span className="mono" style={{ fontSize: 12.5 }}>{ligne.code}</span> {ligne.designation}
                    </td>
                    <td className="chiffre attenue">{formaterMontant(ligne.montantEstimeHt)}</td>
                    {ligne.cellules.map((cellule) => {
                      const anomalie = ligne.anomalies.find((a) => a.offreId === cellule.offreId)
                      return (
                        <td key={cellule.offreId} className="chiffre" title={anomalie?.message}>
                          {cellule.montantHt !== null ? formaterMontant(cellule.montantHt) : <span className="attenue">—</span>}
                          {anomalie ? ' ⚠' : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 600 }}>Total HT</td>
                  <td className="chiffre" style={{ fontWeight: 600 }}>{formaterMontant(tableau.montantEstimeHt)}</td>
                  {tableau.colonnes.map((c) => (
                    <td key={c.offreId} className="chiffre" style={{ fontWeight: 600 }} title={anomaliesParOffre.has(c.offreId) ? 'Écart global signalé' : undefined}>
                      {formaterMontant(c.montantNetHt)}{anomaliesParOffre.has(c.offreId) ? ' ⚠' : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {toutesAnomalies.length > 0 ? (
            <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)' }}>
              <p className="surtitre" style={{ marginBottom: 8 }}>Écarts signalés</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                {toutesAnomalies.map((a, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>{nomParOffre.get(a.offreId) ?? a.offreId}</strong> — {a.repere} : {a.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------------- */

type EtatEnregistrement = 'enregistre' | 'modifie' | 'enregistrement' | 'erreur'

function SectionBrouillon({
  missionId,
  lotId,
  brouillonInitial,
  brouillonSuggere,
}: {
  missionId: string
  lotId: string
  brouillonInitial: string
  brouillonSuggere: string
}) {
  const [contenu, setContenu] = useState(brouillonInitial)
  const [etat, setEtat] = useState<EtatEnregistrement>('enregistre')
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enAttente = useRef<string | null>(null)

  const envoyer = useCallback(async (): Promise<void> => {
    const valeur = enAttente.current
    if (valeur === null) return
    enAttente.current = null
    setEtat('enregistrement')
    const resultat = await actionEnregistrerBrouillon(missionId, lotId, valeur)
    if (resultat.erreur) {
      setEtat('erreur')
      return
    }
    setEtat(enAttente.current !== null ? 'modifie' : 'enregistre')
  }, [missionId, lotId])

  const saisir = useCallback(
    (valeur: string): void => {
      setContenu(valeur)
      enAttente.current = valeur
      setEtat('modifie')
      if (minuteur.current) clearTimeout(minuteur.current)
      minuteur.current = setTimeout(() => void envoyer(), DELAI_ENREGISTREMENT)
    },
    [envoyer],
  )

  useEffect(() => {
    const avertir = (evenement: BeforeUnloadEvent): void => {
      if (enAttente.current !== null) {
        evenement.preventDefault()
        evenement.returnValue = ''
      }
    }
    const surMasquage = (): void => {
      if (document.visibilityState === 'hidden') {
        if (minuteur.current) clearTimeout(minuteur.current)
        void envoyer()
      }
    }
    window.addEventListener('beforeunload', avertir)
    document.addEventListener('visibilitychange', surMasquage)
    return () => {
      window.removeEventListener('beforeunload', avertir)
      document.removeEventListener('visibilitychange', surMasquage)
    }
  }, [envoyer])

  return (
    <section className="carte" style={{ marginBottom: 22 }}>
      <div className="carte-entete">
        <h2>Brouillon de rapport d’analyse</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="etat-enregistrement" data-etat={etat} role="status" aria-live="polite">
            {etat === 'enregistre' && 'Enregistré'}
            {etat === 'modifie' && 'Modifications non enregistrées…'}
            {etat === 'enregistrement' && 'Enregistrement…'}
            {etat === 'erreur' && 'Échec de l’enregistrement'}
          </span>
          <a href={`/missions/${missionId}/consultation/${lotId}/rapport`} className="bouton bouton-primaire">
            Télécharger (Word)
          </a>
        </div>
      </div>
      <div className="carte-corps">
        <p className="attenue" style={{ fontSize: 13.5, marginTop: 0, maxWidth: '76ch' }}>
          Un brouillon, pas un rapport fini : à compléter et valider avant tout envoi. Le choix de
          l’attributaire reste toujours le vôtre.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button type="button" className="bouton bouton-discret" onClick={() => saisir(brouillonSuggere)}>
            Repartir du brouillon suggéré
          </button>
        </div>
        <textarea
          value={contenu}
          onChange={(e) => saisir(e.target.value)}
          rows={16}
          spellCheck
          style={{ fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }}
        />
      </div>
    </section>
  )
}
