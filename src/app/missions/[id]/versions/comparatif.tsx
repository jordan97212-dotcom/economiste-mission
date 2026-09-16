'use client'

import { Fragment, useActionState, useState } from 'react'
import { formaterMontant, formaterQuantite } from '../../../../lib/format'
import { actionFiger, actionSupprimer, type EtatVersion } from './actions'

/**
 * Versions de chiffrage et comparatif — point 10.4.
 *
 * La question utile n'est pas « de combien le total a-t-il bougé », qu'une
 * soustraction suffit à répondre, mais « pourquoi ». L'écran répond donc en
 * séparant ce qui vient de lignes apparues ou disparues de ce qui vient de
 * lignes qui ont changé.
 */

const PHASES = [
  ['ESQ', 'Esquisse'],
  ['APS', 'Avant-projet sommaire'],
  ['APD', 'Avant-projet définitif'],
  ['PRO', 'Projet'],
  ['DCE', 'Dossier de consultation'],
  ['ACT', 'Assistance aux contrats de travaux'],
  ['DET', 'Direction de l’exécution'],
  ['AOR', 'Réception'],
] as const

const LIBELLES_CHAMP: Record<string, string> = {
  designation: 'désignation',
  unite: 'unité',
  quantite: 'quantité',
  prixUnitaire: 'prix unitaire',
}

const LIBELLES_ETAT: Record<string, string> = {
  apparue: 'apparue',
  disparue: 'disparue',
  modifiee: 'modifiée',
  inchangee: 'inchangée',
}

interface Version {
  readonly id: string
  readonly phase: string
  readonly libelle: string
  readonly figeLe: string
  readonly montantTceHt: string
  readonly nbLots: number
  readonly nbLignes: number
}

interface LigneComparee {
  readonly etat: string
  readonly code: string | null
  readonly designation: string
  readonly quantiteAvant: string | null
  readonly quantiteApres: string | null
  readonly montantAvantHt: string
  readonly montantApresHt: string
  readonly ecartMontantHt: string
  readonly champsModifies: readonly string[]
}

interface LotCompare {
  readonly numero: string
  readonly intitule: string
  readonly etat: string
  readonly montantAvantHt: string
  readonly montantApresHt: string
  readonly ecartMontantHt: string
  readonly ecartPourcent: string | null
  readonly lignes: readonly LigneComparee[]
}

export interface ComparaisonAffichee {
  readonly libelleAvant: string
  readonly libelleApres: string
  readonly montantAvantHt: string
  readonly montantApresHt: string
  readonly ecartMontantHt: string
  readonly ecartPourcent: string | null
  readonly lots: readonly LotCompare[]
  readonly synthese: {
    readonly nbApparues: number
    readonly nbDisparues: number
    readonly nbModifiees: number
    readonly nbInchangees: number
    readonly ecartParApparitionHt: string
    readonly ecartParModificationHt: string
  }
}

/** Un écart se lit avec son signe : « + 5 000,00 € » ou « − 2 000,00 € ». */
function montantSigne(centimes: string): string {
  const negatif = centimes.startsWith('-')
  const texte = formaterMontant(negatif ? centimes.slice(1) : centimes)
  if (centimes === '0') return texte
  return `${negatif ? '−' : '+'} ${texte}`
}

function classeEcart(centimes: string): string {
  if (centimes === '0') return 'attenue'
  return centimes.startsWith('-') ? 'chiffre' : 'chiffre'
}

export function Comparatif({
  missionId,
  versions,
  comparaison,
  avantId,
  apresId,
}: {
  missionId: string
  versions: readonly Version[]
  comparaison: ComparaisonAffichee | null
  avantId: string
  apresId: string
}) {
  const [etatFigeage, figer, figeageEnCours] = useActionState<EtatVersion, FormData>(actionFiger, {})
  const [etatSuppression, supprimer] = useActionState<EtatVersion, FormData>(actionSupprimer, {})
  const [lotDeplie, setLotDeplie] = useState<string | null>(null)
  const [masquerInchangees, setMasquerInchangees] = useState(true)

  return (
    <>
      {etatFigeage.succes ? (
        <p className="message-succes" style={{ marginBottom: 18 }}>{etatFigeage.succes}</p>
      ) : null}
      {etatFigeage.erreur ? (
        <p className="message-erreur" role="alert" style={{ marginBottom: 18 }}>{etatFigeage.erreur}</p>
      ) : null}
      {etatSuppression.erreur ? (
        <p className="message-erreur" role="alert" style={{ marginBottom: 18 }}>{etatSuppression.erreur}</p>
      ) : null}

      <section className="carte" style={{ marginBottom: 22 }}>
        <div className="carte-entete">
          <h2>Figer le chiffrage actuel</h2>
          <span className="attenue" style={{ fontSize: 13 }}>
            {versions.length} version(s) figée(s)
          </span>
        </div>
        <div className="carte-corps">
          <p style={{ marginTop: 0, fontSize: 14, maxWidth: '78ch' }}>
            Une version figée ne bouge plus, quoi qu’il arrive ensuite au bordereau. C’est ce qui lui
            donne sa valeur : elle sert de témoin, et un témoin qu’on retouche ne témoigne de rien.
            Elle se supprime, mais ne se modifie pas.
          </p>
          <form action={figer} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input type="hidden" name="missionId" value={missionId} />
            <label>
              Phase contractuelle
              <select name="phase" defaultValue="APD">
                {PHASES.map(([code, libelle]) => (
                  <option key={code} value={code}>{code} · {libelle}</option>
                ))}
              </select>
            </label>
            <label style={{ flex: '1 1 260px' }}>
              Intitulé (facultatif)
              <input type="text" name="libelle" placeholder="Par défaut : le nom de la phase" />
            </label>
            <button type="submit" className="bouton bouton-primaire" disabled={figeageEnCours}>
              {figeageEnCours ? 'Figeage…' : 'Figer'}
            </button>
          </form>
        </div>

        {versions.length > 0 ? (
          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Phase</th>
                  <th>Figée le</th>
                  <th style={{ textAlign: 'right' }}>Total TCE HT</th>
                  <th style={{ textAlign: 'right' }}>Lignes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id}>
                    <td>{version.libelle}</td>
                    <td><span className="etiquette">{version.phase}</span></td>
                    <td className="attenue" style={{ fontSize: 13 }}>{version.figeLe}</td>
                    <td className="chiffre">{formaterMontant(version.montantTceHt)}</td>
                    <td className="chiffre attenue">{version.nbLignes}</td>
                    <td>
                      <form action={supprimer}>
                        <input type="hidden" name="missionId" value={missionId} />
                        <input type="hidden" name="versionId" value={version.id} />
                        <button type="submit" className="bouton bouton-discret">Supprimer</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="vide">
            Aucune version figée. Tant qu’il n’y en a pas, le suivi de chantier compare au chiffrage
            du moment — ce qui se déplace avec lui, donc ne mesure pas grand-chose.
          </p>
        )}
      </section>

      {versions.length > 0 ? (
        <section className="carte" style={{ marginBottom: 22 }}>
          <div className="carte-entete">
            <h2>Comparer deux états</h2>
          </div>
          <div className="carte-corps">
            <form method="get" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label>
                De
                <select name="avant" defaultValue={avantId}>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>{v.libelle}</option>
                  ))}
                </select>
              </label>
              <label>
                À
                <select name="apres" defaultValue={apresId}>
                  <option value="courant">Chiffrage actuel</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>{v.libelle}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="bouton">Comparer</button>
            </form>
          </div>
        </section>
      ) : null}

      {comparaison ? (
        <>
          <div className="total-bandeau" style={{ marginBottom: 22 }}>
            <div>
              <p className="surtitre">{comparaison.libelleAvant}</p>
              <p className="valeur">{formaterMontant(comparaison.montantAvantHt)}</p>
            </div>
            <div>
              <p className="surtitre">{comparaison.libelleApres}</p>
              <p className="valeur">{formaterMontant(comparaison.montantApresHt)}</p>
            </div>
            <div>
              <p className="surtitre">Écart</p>
              <p className="valeur">{montantSigne(comparaison.ecartMontantHt)}</p>
              <p className="attenue" style={{ fontSize: 12.5 }}>
                {comparaison.ecartPourcent !== null
                  ? `${comparaison.ecartPourcent.replace('.', ',')} %`
                  : 'pas de référence'}
              </p>
            </div>
            <div>
              <p className="surtitre">Dû aux lignes nouvelles</p>
              <p className="valeur">{montantSigne(comparaison.synthese.ecartParApparitionHt)}</p>
              <p className="attenue" style={{ fontSize: 12.5 }}>
                {comparaison.synthese.nbApparues} apparue(s) · {comparaison.synthese.nbDisparues} disparue(s)
              </p>
            </div>
            <div>
              <p className="surtitre">Dû aux lignes modifiées</p>
              <p className="valeur">{montantSigne(comparaison.synthese.ecartParModificationHt)}</p>
              <p className="attenue" style={{ fontSize: 12.5 }}>
                {comparaison.synthese.nbModifiees} ligne(s)
              </p>
            </div>
          </div>

          <section className="carte">
            <div className="carte-entete">
              <h2>Par lot</h2>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={masquerInchangees}
                  onChange={(e) => setMasquerInchangees(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Masquer les lignes inchangées
              </label>
            </div>

            <div className="defilement">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th style={{ textAlign: 'right' }}>{comparaison.libelleAvant}</th>
                    <th style={{ textAlign: 'right' }}>{comparaison.libelleApres}</th>
                    <th style={{ textAlign: 'right' }}>Écart</th>
                    <th style={{ textAlign: 'right' }}>%</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {comparaison.lots.map((lot) => {
                    const visibles = lot.lignes.filter(
                      (l) => !masquerInchangees || l.etat !== 'inchangee',
                    )
                    const ouvert = lotDeplie === lot.numero
                    return (
                      <Fragment key={lot.numero}>
                        <tr>
                          <td>
                            <span className="mono">{lot.numero}</span> {lot.intitule}
                            {lot.etat === 'apparu' || lot.etat === 'disparu' ? (
                              <span className="etiquette etiquette-alerte" style={{ marginLeft: 8 }}>
                                {lot.etat}
                              </span>
                            ) : null}
                          </td>
                          <td className="chiffre attenue">{formaterMontant(lot.montantAvantHt)}</td>
                          <td className="chiffre">{formaterMontant(lot.montantApresHt)}</td>
                          <td className={classeEcart(lot.ecartMontantHt)}>
                            {montantSigne(lot.ecartMontantHt)}
                          </td>
                          <td className="chiffre attenue">
                            {lot.ecartPourcent !== null ? `${lot.ecartPourcent.replace('.', ',')} %` : '—'}
                          </td>
                          <td>
                            {visibles.length > 0 ? (
                              <button
                                type="button"
                                className="bouton bouton-discret"
                                onClick={() => setLotDeplie(ouvert ? null : lot.numero)}
                              >
                                {ouvert ? 'Replier' : `${visibles.length} ligne(s)`}
                              </button>
                            ) : (
                              <span className="attenue" style={{ fontSize: 12.5 }}>rien à signaler</span>
                            )}
                          </td>
                        </tr>
                        {ouvert
                          ? visibles.map((ligne, index) => (
                              <tr key={`${lot.numero}-${String(index)}`} style={{ background: 'var(--color-surface-alt)' }}>
                                <td style={{ paddingLeft: 28, fontSize: 13 }}>
                                  {ligne.code ? <span className="mono">{ligne.code} </span> : null}
                                  {ligne.designation}
                                  <span className="etiquette" style={{ marginLeft: 8 }}>
                                    {LIBELLES_ETAT[ligne.etat] ?? ligne.etat}
                                  </span>
                                  {ligne.champsModifies.length > 0 ? (
                                    <span className="attenue" style={{ fontSize: 12.5, marginLeft: 8 }}>
                                      {ligne.champsModifies.map((c) => LIBELLES_CHAMP[c] ?? c).join(', ')}
                                    </span>
                                  ) : null}
                                  {ligne.quantiteAvant !== ligne.quantiteApres ? (
                                    <span className="attenue mono" style={{ fontSize: 12, marginLeft: 8 }}>
                                      {formaterQuantite(ligne.quantiteAvant)} → {formaterQuantite(ligne.quantiteApres)}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="chiffre attenue">{formaterMontant(ligne.montantAvantHt)}</td>
                                <td className="chiffre">{formaterMontant(ligne.montantApresHt)}</td>
                                <td className={classeEcart(ligne.ecartMontantHt)}>
                                  {montantSigne(ligne.ecartMontantHt)}
                                </td>
                                <td colSpan={2} />
                              </tr>
                            ))
                          : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </>
  )
}
