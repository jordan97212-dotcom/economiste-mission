'use client'

import { useActionState, useState } from 'react'
import { formaterDate, formaterMontant } from '../../../../lib/format'
import type { SuiviMission } from '../../../../application/suivi/service'
import {
  actionAnnulerAttribution,
  actionCreerAvenant,
  actionCreerSituation,
  actionModifierStatutAvenant,
  actionRetenirOffre,
  actionSupprimerAvenant,
  actionSupprimerSituation,
  type EtatSuivi,
} from './actions'

const LIBELLES_STATUT_AVENANT: Record<string, string> = {
  PROPOSE: 'Proposé',
  ACCEPTE: 'Accepté',
  REFUSE: 'Refusé',
}

export interface AvenantAffiche {
  readonly id: string
  readonly numero: number
  readonly lotId: string | null
  readonly lotLibelle: string | null
  readonly objet: string
  readonly montantHt: string
  readonly date: string
  readonly motif: string | null
  readonly statut: string
}

export interface SituationAffichee {
  readonly id: string
  readonly numeroSituation: number
  readonly periode: string
  readonly avancementPourcent: string
  readonly montantCumuleHt: string
  readonly montantPeriodeHt: string
  readonly retenueGarantieHt: string
  readonly avanceRemboursee: string
  readonly compteProrataHt: string
  readonly netAPayerHt: string
  readonly dateValidation: string | null
}

export interface OffreAttribuable {
  readonly id: string
  readonly entrepriseNom: string
  readonly montantNetHt: string
  readonly conforme: boolean
}

/** Montant signé, pour qu'une moins-value se lise comme telle. */
function montantSigne(centimes: string): string {
  const negatif = centimes.startsWith('-')
  const texte = formaterMontant(negatif ? centimes.slice(1) : centimes)
  return negatif ? `-${texte}` : texte
}

export function SuiviChantier({
  missionId,
  suivi,
  avenants,
  situationsParLot,
  offresParLot,
}: {
  missionId: string
  suivi: SuiviMission
  avenants: readonly AvenantAffiche[]
  situationsParLot: Record<string, readonly SituationAffichee[]>
  offresParLot: Record<string, readonly OffreAttribuable[]>
}) {
  return (
    <>
      <SectionSynthese missionId={missionId} suivi={suivi} />
      <SectionLots
        missionId={missionId}
        suivi={suivi}
        situationsParLot={situationsParLot}
        offresParLot={offresParLot}
      />
      <SectionAvenants missionId={missionId} suivi={suivi} avenants={avenants} />
    </>
  )
}

/* ---------------------------------------------------------------------- */

function SectionSynthese({ missionId, suivi }: { missionId: string; suivi: SuiviMission }) {
  return (
    <section className="carte" style={{ marginBottom: 22 }}>
      <div className="carte-entete">
        <h2>Situation financière de l’opération</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {suivi.deriveDetectee ? (
            <span className="etiquette etiquette-alerte">
              dérive au-delà de {suivi.seuilDerivePourcent.replace('.', ',')} %
            </span>
          ) : (
            <span className="etiquette etiquette-accent">écart sous le seuil</span>
          )}
          <a href={`/missions/${missionId}/suivi/export`} className="bouton bouton-primaire" download>
            Export Excel
          </a>
        </div>
      </div>

      <div className="total-bandeau">
        <div>
          <p className="surtitre">Marché actuel HT</p>
          <p className="valeur">{formaterMontant(suivi.marcheActuelHt)}</p>
          <p className="attenue" style={{ fontSize: 12.5 }}>
            dont {montantSigne(suivi.avenantsCumulesHt)} d’avenants
          </p>
        </div>
        <div>
          <p className="surtitre">Travaux réalisés</p>
          <p className="valeur">{formaterMontant(suivi.travauxRealisesHt)}</p>
          <p className="attenue" style={{ fontSize: 12.5 }}>
            {suivi.avancementPourcent !== null
              ? `${suivi.avancementPourcent.replace('.', ',')} % du marché`
              : 'aucun marché attribué'}
          </p>
        </div>
        <div>
          <p className="surtitre">Reste à réaliser</p>
          <p className="valeur">{formaterMontant(suivi.resteARealiserHt)}</p>
        </div>
        <div>
          <p className="surtitre">Écart vs estimatif</p>
          <p className="valeur">{montantSigne(suivi.ecartVsEstimatifHt)}</p>
          <p className="attenue" style={{ fontSize: 12.5 }}>
            {suivi.ecartVsEstimatifPourcent !== null
              ? `${suivi.ecartVsEstimatifPourcent.replace('.', ',')} % · estimatif ${formaterMontant(suivi.estimatifHt)}`
              : 'estimatif nul'}
          </p>
        </div>
      </div>

      <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)' }}>
        <p className="attenue" style={{ fontSize: 13, margin: 0, maxWidth: '78ch' }}>
          {suivi.nbLotsAttribues} lot(s) attribué(s) sur {suivi.nbLots}.{' '}
          {suivi.referenceEstimatif.origine === 'version_figee' ? (
            <>
              La comparaison se fait avec la version figée «&nbsp;{suivi.referenceEstimatif.libelle}
              &nbsp;», du {formaterDate(suivi.referenceEstimatif.figeLe)} : un référent qui ne bouge
              plus, quoi qu’il arrive ensuite au bordereau.
            </>
          ) : (
            <>
              La comparaison se fait avec l’estimatif <strong>courant</strong> du chiffrage, faute de
              version figée : il se déplace donc avec le bordereau, et parler d’« estimatif initial »
              serait inexact. <a href={`/missions/${missionId}/versions`}>Figer une version</a>{' '}
              donne un référent stable.
            </>
          )}
          {Number(suivi.retenueGarantieCumuleeHt) !== 0
            ? ` Retenue de garantie cumulée : ${formaterMontant(suivi.retenueGarantieCumuleeHt)}, à restituer à la levée des réserves.`
            : ''}
        </p>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------- */

function SectionLots({
  missionId,
  suivi,
  situationsParLot,
  offresParLot,
}: {
  missionId: string
  suivi: SuiviMission
  situationsParLot: Record<string, readonly SituationAffichee[]>
  offresParLot: Record<string, readonly OffreAttribuable[]>
}) {
  const [ouvert, setOuvert] = useState<string | null>(null)

  return (
    <section className="carte" style={{ marginBottom: 22 }}>
      <div className="carte-entete">
        <h2>Lots</h2>
        <span className="attenue" style={{ fontSize: 13 }}>
          Ouvrez un lot pour saisir ses situations de travaux.
        </span>
      </div>

      {suivi.lots.length === 0 ? (
        <p className="vide">Cette opération ne porte aucun lot.</p>
      ) : (
        <div className="defilement">
          <table className="tableau">
            <thead>
              <tr>
                <th>N°</th>
                <th>Intitulé</th>
                <th>Entreprise</th>
                <th style={{ textAlign: 'right' }}>Marché actuel</th>
                <th style={{ textAlign: 'right' }}>Réalisé</th>
                <th style={{ textAlign: 'right' }}>Reste</th>
                <th style={{ textAlign: 'right' }}>Avancement</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {suivi.lots.map((lot) => (
                <tr key={lot.lotId}>
                  <td className="mono">{lot.numero}</td>
                  <td style={{ fontWeight: 500 }}>{lot.intitule}</td>
                  <td style={{ fontSize: 13.5 }}>
                    {lot.entrepriseNom ?? <span className="attenue">non attribué</span>}
                  </td>
                  <td className="chiffre">
                    {lot.marcheActuelHt !== null ? formaterMontant(lot.marcheActuelHt) : '—'}
                  </td>
                  <td className="chiffre">{formaterMontant(lot.travauxRealisesHt)}</td>
                  <td className="chiffre">
                    {lot.resteARealiserHt !== null ? formaterMontant(lot.resteARealiserHt) : '—'}
                  </td>
                  <td className="chiffre">
                    {lot.avancementPourcent !== null
                      ? `${lot.avancementPourcent.replace('.', ',')} %`
                      : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="bouton bouton-discret"
                      onClick={() => setOuvert(ouvert === lot.lotId ? null : lot.lotId)}
                    >
                      {ouvert === lot.lotId ? 'Fermer' : `Situations (${lot.nbSituations})`}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ouvert ? (
        <DetailLot
          missionId={missionId}
          lot={suivi.lots.find((l) => l.lotId === ouvert)!}
          situations={situationsParLot[ouvert] ?? []}
          offres={offresParLot[ouvert] ?? []}
        />
      ) : null}
    </section>
  )
}

function DetailLot({
  missionId,
  lot,
  situations,
  offres,
}: {
  missionId: string
  lot: SuiviMission['lots'][number]
  situations: readonly SituationAffichee[]
  offres: readonly OffreAttribuable[]
}) {
  const [etatAttribution, attribuer] = useActionState<EtatSuivi, FormData>(actionRetenirOffre, {})
  const [, annuler] = useActionState<EtatSuivi, FormData>(actionAnnulerAttribution, {})
  const [etatSituation, creerSituation] = useActionState<EtatSuivi, FormData>(actionCreerSituation, {})

  return (
    <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)', background: 'var(--color-surface-alt)' }}>
      <p className="surtitre" style={{ marginBottom: 10 }}>
        Lot {lot.numero} · {lot.intitule}
      </p>

      {/* --- Attribution --- */}
      {!lot.attribue ? (
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 14, marginTop: 0, maxWidth: '74ch' }}>
            Ce lot n’a pas encore de marché. Retenez une offre pour pouvoir saisir des situations.
          </p>
          {offres.length === 0 ? (
            <p className="attenue" style={{ fontSize: 13.5 }}>
              Aucune offre reçue sur ce lot.{' '}
              <a href={`/missions/${missionId}/consultation/${lot.lotId}`}>Ouvrir la consultation.</a>
            </p>
          ) : (
            <form action={attribuer} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <input type="hidden" name="missionId" value={missionId} />
              <input type="hidden" name="lotId" value={lot.lotId} />
              <div className="champ" style={{ minWidth: 300 }}>
                <label htmlFor={`offre-${lot.lotId}`}>Offre retenue</label>
                <select id={`offre-${lot.lotId}`} name="offreId" required>
                  {offres.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.entrepriseNom} — {formaterMontant(o.montantNetHt)}
                      {o.conforme ? '' : ' (non conforme)'}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="bouton bouton-primaire">Retenir cette offre</button>
            </form>
          )}
          {etatAttribution.erreur ? (
            <p className="message-erreur" style={{ marginTop: 10 }} role="alert">{etatAttribution.erreur}</p>
          ) : null}
        </div>
      ) : (
        <div style={{ marginBottom: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>
            Marché attribué à <strong>{lot.entrepriseNom}</strong> pour{' '}
            <span className="mono">{formaterMontant(lot.marcheInitialHt)}</span>
            {Number(lot.avenantsAcceptesHt) !== 0
              ? ` , porté à ${formaterMontant(lot.marcheActuelHt)} par avenant`
              : ''}
            .
          </span>
          {lot.nbSituations === 0 ? (
            <form action={annuler}>
              <input type="hidden" name="missionId" value={missionId} />
              <input type="hidden" name="lotId" value={lot.lotId} />
              <button type="submit" className="bouton bouton-discret bouton-danger">
                Annuler l’attribution
              </button>
            </form>
          ) : null}
        </div>
      )}

      {/* --- Situations --- */}
      {situations.length > 0 ? (
        <div className="defilement" style={{ marginBottom: 14 }}>
          <table className="tableau">
            <thead>
              <tr>
                <th>N°</th>
                <th>Période</th>
                <th style={{ textAlign: 'right' }}>Avancement</th>
                <th style={{ textAlign: 'right' }}>Cumulé HT</th>
                <th style={{ textAlign: 'right' }}>Période HT</th>
                <th style={{ textAlign: 'right' }}>Retenue</th>
                <th style={{ textAlign: 'right' }}>Avance</th>
                <th style={{ textAlign: 'right' }}>Prorata</th>
                <th style={{ textAlign: 'right' }}>Net à payer</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {situations.map((s) => (
                <LigneSituation key={s.id} missionId={missionId} situation={s} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* --- Nouvelle situation --- */}
      {lot.attribue ? (
        <form action={creerSituation}>
          <input type="hidden" name="missionId" value={missionId} />
          <input type="hidden" name="lotId" value={lot.lotId} />
          <p className="surtitre" style={{ marginBottom: 8 }}>
            Situation n° {situations.length + 1}
          </p>
          <div className="grille-champs">
            <div className="champ">
              <label htmlFor={`periode-${lot.lotId}`}>Période</label>
              <input id={`periode-${lot.lotId}`} name="periode" type="date" required />
            </div>
            <div className="champ">
              <label htmlFor={`avancement-${lot.lotId}`}>Avancement cumulé (%)</label>
              <input id={`avancement-${lot.lotId}`} name="avancementPourcent" inputMode="decimal" placeholder="35,00" className="mono" />
            </div>
            <div className="champ">
              <label htmlFor={`cumul-${lot.lotId}`}>…ou montant cumulé HT</label>
              <input id={`cumul-${lot.lotId}`} name="montantCumuleHt" inputMode="decimal" placeholder="0,00" className="mono" />
            </div>
            <div className="champ">
              <label htmlFor={`retenue-${lot.lotId}`}>Retenue de garantie</label>
              <input id={`retenue-${lot.lotId}`} name="retenueGarantieHt" inputMode="decimal" placeholder="0,00" className="mono" />
            </div>
            <div className="champ">
              <label htmlFor={`avance-${lot.lotId}`}>Avance remboursée</label>
              <input id={`avance-${lot.lotId}`} name="avanceRemboursee" inputMode="decimal" placeholder="0,00" className="mono" />
            </div>
            <div className="champ">
              <label htmlFor={`prorata-${lot.lotId}`}>Compte prorata</label>
              <input id={`prorata-${lot.lotId}`} name="compteProrataHt" inputMode="decimal" placeholder="0,00" className="mono" />
            </div>
            <div className="champ">
              <label htmlFor={`validation-${lot.lotId}`}>Date de validation</label>
              <input id={`validation-${lot.lotId}`} name="dateValidation" type="date" />
            </div>
          </div>
          <p className="attenue" style={{ fontSize: 12.5, marginTop: 6, maxWidth: '76ch' }}>
            L’avancement ou le montant cumulé, l’un des deux suffit. C’est le montant cumulé qui est
            conservé : une situation déjà validée ne bouge plus quand un avenant élargit le marché,
            seul son pourcentage se relit.
          </p>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="bouton bouton-primaire">Enregistrer la situation</button>
          </div>
          {etatSituation.erreur ? (
            <p className="message-erreur" style={{ marginTop: 10 }} role="alert">{etatSituation.erreur}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  )
}

function LigneSituation({ missionId, situation }: { missionId: string; situation: SituationAffichee }) {
  const [, supprimer] = useActionState<EtatSuivi, FormData>(actionSupprimerSituation, {})

  return (
    <tr>
      <td className="mono">{situation.numeroSituation}</td>
      <td className="mono attenue" style={{ fontSize: 12.5 }}>{situation.periode}</td>
      <td className="chiffre">{situation.avancementPourcent.replace('.', ',')} %</td>
      <td className="chiffre">{formaterMontant(situation.montantCumuleHt)}</td>
      <td className="chiffre">{montantSigne(situation.montantPeriodeHt)}</td>
      <td className="chiffre attenue">{formaterMontant(situation.retenueGarantieHt)}</td>
      <td className="chiffre attenue">{formaterMontant(situation.avanceRemboursee)}</td>
      <td className="chiffre attenue">{formaterMontant(situation.compteProrataHt)}</td>
      <td className="chiffre" style={{ fontWeight: 600 }}>{montantSigne(situation.netAPayerHt)}</td>
      <td>
        <form action={supprimer}>
          <input type="hidden" name="missionId" value={missionId} />
          <input type="hidden" name="id" value={situation.id} />
          <button type="submit" className="bouton bouton-discret bouton-danger">Retirer</button>
        </form>
      </td>
    </tr>
  )
}

/* ---------------------------------------------------------------------- */

function SectionAvenants({
  missionId,
  suivi,
  avenants,
}: {
  missionId: string
  suivi: SuiviMission
  avenants: readonly AvenantAffiche[]
}) {
  const [etat, creer] = useActionState<EtatSuivi, FormData>(actionCreerAvenant, {})
  const acceptes = avenants.filter((a) => a.statut === 'ACCEPTE').length

  return (
    <section className="carte" style={{ marginBottom: 22 }}>
      <div className="carte-entete">
        <h2>Avenants</h2>
        <span className="attenue" style={{ fontSize: 13 }}>
          {acceptes} accepté(s) sur {avenants.length} — seuls les acceptés déplacent le marché.
        </span>
      </div>

      {avenants.length === 0 ? (
        <p className="vide">Aucun avenant.</p>
      ) : (
        <div className="defilement">
          <table className="tableau">
            <thead>
              <tr>
                <th>N°</th>
                <th>Objet</th>
                <th>Lot</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Montant HT</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {avenants.map((a) => (
                <LigneAvenant key={a.id} missionId={missionId} avenant={a} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)' }}>
        <form action={creer} className="grille-champs">
          <input type="hidden" name="missionId" value={missionId} />
          <div className="champ" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="objet">Objet</label>
            <input id="objet" name="objet" required placeholder="Reprise de fondations en sous-œuvre" />
          </div>
          <div className="champ">
            <label htmlFor="lotIdAvenant">Lot concerné</label>
            <select id="lotIdAvenant" name="lotId" defaultValue="">
              <option value="">Opération entière</option>
              {suivi.lots.map((l) => (
                <option key={l.lotId} value={l.lotId}>
                  {l.numero} · {l.intitule}
                </option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="montantAvenant">Montant HT</label>
            <input id="montantAvenant" name="montantHt" required inputMode="decimal" placeholder="0,00 (négatif pour une moins-value)" className="mono" />
          </div>
          <div className="champ">
            <label htmlFor="dateAvenant">Date</label>
            <input id="dateAvenant" name="date" type="date" required />
          </div>
          <div className="champ">
            <label htmlFor="statutAvenant">Statut</label>
            <select id="statutAvenant" name="statut" defaultValue="PROPOSE">
              {Object.entries(LIBELLES_STATUT_AVENANT).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>{libelle}</option>
              ))}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="motifAvenant">Motif</label>
            <input id="motifAvenant" name="motif" placeholder="Aléa de chantier, demande du maître d’ouvrage…" />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <button type="submit" className="bouton bouton-primaire">Ajouter l’avenant</button>
          </div>
        </form>
        {etat.erreur ? <p className="message-erreur" style={{ marginTop: 10 }} role="alert">{etat.erreur}</p> : null}
      </div>
    </section>
  )
}

function LigneAvenant({ missionId, avenant }: { missionId: string; avenant: AvenantAffiche }) {
  const [, modifier] = useActionState<EtatSuivi, FormData>(actionModifierStatutAvenant, {})
  const [, supprimer] = useActionState<EtatSuivi, FormData>(actionSupprimerAvenant, {})
  const moinsValue = avenant.montantHt.startsWith('-')

  return (
    <tr>
      <td className="mono">{avenant.numero}</td>
      <td style={{ fontWeight: 500 }}>
        {avenant.objet}
        {avenant.motif ? (
          <div className="attenue" style={{ fontSize: 12, fontWeight: 400 }}>{avenant.motif}</div>
        ) : null}
      </td>
      <td className="attenue" style={{ fontSize: 13 }}>{avenant.lotLibelle ?? 'Opération'}</td>
      <td className="mono attenue" style={{ fontSize: 12.5 }}>{avenant.date}</td>
      <td className="chiffre" style={{ color: moinsValue ? 'var(--color-accent-encre)' : undefined }}>
        {montantSigne(avenant.montantHt)}
      </td>
      <td>
        <form action={modifier} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="hidden" name="missionId" value={missionId} />
          <input type="hidden" name="id" value={avenant.id} />
          <select name="statut" defaultValue={avenant.statut} aria-label={`Statut de l’avenant ${avenant.numero}`} style={{ width: 'auto', minWidth: 110 }}>
            {Object.entries(LIBELLES_STATUT_AVENANT).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>{libelle}</option>
            ))}
          </select>
          <button type="submit" className="bouton bouton-discret">Noter</button>
        </form>
      </td>
      <td>
        <form action={supprimer}>
          <input type="hidden" name="missionId" value={missionId} />
          <input type="hidden" name="id" value={avenant.id} />
          <button type="submit" className="bouton bouton-discret bouton-danger">Retirer</button>
        </form>
      </td>
    </tr>
  )
}
