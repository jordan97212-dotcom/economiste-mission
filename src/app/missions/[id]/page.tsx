import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contexte } from '../../session'
import { chargerChiffrage, MissionIntrouvable } from '../../../application/chiffrage/service'
import {
  actionCreerLot,
  actionModifierLot,
  actionSupprimerLot,
  actionDupliquerMission,
  actionSupprimerMission,
} from '../actions'
import {
  formaterMontant,
  formaterDate,
  LIBELLES_STATUT,
  LIBELLES_TYPE_OUVRAGE,
  LIBELLES_NATURE,
  LIBELLES_MARCHE,
} from '../../../lib/format'

export default async function PageMission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await contexte()

  let chiffrage
  try {
    chiffrage = await chargerChiffrage(db, id)
  } catch (erreur) {
    if (erreur instanceof MissionIntrouvable) notFound()
    throw erreur
  }

  const { mission, lots, recapitulatif } = chiffrage
  const corpsEtats = await db.corpsEtat.findMany({
    where: { masque: false },
    orderBy: { ordre: 'asc' },
    select: { id: true, code: true, libelle: true },
  })

  // Sur une mission encore vide, importer est l'action la plus probable : le
  // bouton passe donc devant, au lieu d'être rangé derrière la clôture.
  const chiffrageVide = lots.every((lot) => lot.postes.length === 0)

  const surface = mission.surfaceShon ?? mission.surfaceUtile
  const trameHonoraires = await db.trame.findFirst({
    where: { type: 'HONORAIRES' },
    select: { id: true, intitule: true },
  })

  return (
    <main className="contenu">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="surtitre mono">
            {mission.reference} · {LIBELLES_STATUT[mission.statut] ?? mission.statut}
          </p>
          <h1>{mission.nomOperation}</h1>
          <p className="attenue" style={{ fontSize: 14, marginTop: 4 }}>
            {[
              mission.maitreOuvrage,
              LIBELLES_TYPE_OUVRAGE[mission.typeOuvrage],
              LIBELLES_NATURE[mission.nature],
              `marché ${(LIBELLES_MARCHE[mission.typeMarche] ?? '').toLowerCase()}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Link
            href={`/missions/${mission.id}/chiffrage`}
            className={`bouton ${chiffrageVide ? '' : 'bouton-primaire'}`}
          >
            Ouvrir le chiffrage
          </Link>
          <Link
            href={`/missions/${mission.id}/import`}
            className={`bouton ${chiffrageVide ? 'bouton-primaire' : ''}`}
          >
            Importer un DPGF
          </Link>
          <Link href={`/missions/${mission.id}/dce`} className="bouton">
            Pièces écrites
          </Link>
          <Link href={`/missions/${mission.id}/versions`} className="bouton">
            Versions
          </Link>
          <Link href={`/missions/${mission.id}/suivi`} className="bouton">
            Suivi de chantier
          </Link>
          <Link href={`/missions/${mission.id}/cloture`} className="bouton">
            Clôture
          </Link>
          <Link href={`/missions/${mission.id}/modifier`} className="bouton">
            Modifier
          </Link>
          <form action={actionDupliquerMission}>
            <input type="hidden" name="id" value={mission.id} />
            <button type="submit" className="bouton">
              Dupliquer
            </button>
          </form>
        </div>
      </div>

      <section className="carte" style={{ marginBottom: 22 }}>
        <div className="carte-corps">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 }}>
            <div>
              <p className="surtitre">Estimatif TCE HT</p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                {formaterMontant(recapitulatif.totalTceHt)}
              </p>
            </div>
            <div>
              <p className="surtitre">Ratio au m²</p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                {recapitulatif.ratioEuroParM2 && recapitulatif.totalTceHt !== '0'
                  ? `${recapitulatif.ratioEuroParM2.replace('.', ',')} €`
                  : '—'}
              </p>
              <p className="attenue" style={{ fontSize: 12 }}>
                {surface ? `sur ${surface.replace('.', ',')} m²` : 'surface non renseignée'}
              </p>
            </div>
            <div>
              <p className="surtitre">Coefficient local</p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                {mission.coefficientLocalDefaut.replace('.', ',')}
              </p>
              <p className="attenue" style={{ fontSize: 12 }}>
                prix unitaire à {mission.precisionPu} décimales
              </p>
            </div>
            <div>
              <p className="surtitre">Budget prévisionnel HT</p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                {formaterMontant(mission.budgetPrevisionnelHt)}
              </p>
            </div>
            <div>
              <p className="surtitre">Phases</p>
              <p style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {mission.phasesContractuelles.length === 0 ? (
                  <span className="attenue">—</span>
                ) : (
                  mission.phasesContractuelles.map((phase) => (
                    <span key={phase} className="etiquette">
                      {phase}
                    </span>
                  ))
                )}
              </p>
            </div>
            <div>
              <p className="surtitre">Fin prévue</p>
              <p className="mono" style={{ fontSize: 16, marginTop: 6 }}>
                {formaterDate(mission.dateFinPrevue)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="carte" style={{ marginBottom: 22 }}>
        <div className="carte-entete">
          <h2>Proposition d’honoraires</h2>
          <span className="attenue" style={{ fontSize: 13 }}>
            Produite depuis votre modèle, variables de mission résolues.
          </span>
        </div>
        <div className="carte-corps" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {trameHonoraires ? (
            <>
              <p style={{ margin: 0, flex: 1, minWidth: 300, fontSize: 14 }}>
                Modèle utilisé : <strong>{trameHonoraires.intitule}</strong>.
                {mission.honorairesMissionHt
                  ? ''
                  : ' Les honoraires ne sont pas renseignés sur cette mission : la variable restera visible dans le document.'}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`/missions/${mission.id}/piece?piece=HONORAIRES&format=docx`} className="bouton" download>
                  Word
                </a>
                <a href={`/missions/${mission.id}/piece?piece=HONORAIRES&format=pdf`} className="bouton" download>
                  PDF
                </a>
              </div>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 14 }}>
              Aucun modèle d’honoraires. <Link href="/trames">Créez-en un</Link> dans la
              bibliothèque de trames : il servira pour toutes vos opérations.
            </p>
          )}
        </div>
      </section>

      <section className="carte" style={{ marginBottom: 22 }}>
        <div className="carte-entete">
          <h2>Exports</h2>
          <span className="attenue" style={{ fontSize: 13 }}>
            Le prix exporté est le prix unitaire final, coefficient déjà appliqué.
          </span>
        </div>
        <div className="carte-corps" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <a
            href={`/missions/${mission.id}/export?variante=avec-prix`}
            className="bouton"
            download
          >
            DPGF chiffré (.xlsx)
          </a>
          <a
            href={`/missions/${mission.id}/export?variante=a-remplir`}
            className="bouton"
            download
          >
            DPGF à remplir par l’entreprise (.xlsx)
          </a>
          <span className="attenue" style={{ fontSize: 13, maxWidth: '52ch' }}>
            La version à remplir a ses colonnes de prix vides, la feuille protégée et les seules
            cellules de saisie déverrouillées. Les montants s’y calculent tout seuls.
          </span>
        </div>
      </section>

      <section className="carte" style={{ marginBottom: 22 }}>
        <div className="carte-entete">
          <h2>Lots</h2>
          <span className="attenue" style={{ fontSize: 13 }}>
            Le coefficient d’un lot remplace celui de la mission pour toutes ses lignes.
          </span>
        </div>

        {lots.length === 0 ? (
          <p className="vide">
            Aucun lot. Créez le premier ci-dessous et saisissez son chiffrage au clavier, ou{' '}
            <Link href={`/missions/${mission.id}/import`}>importez un DPGF existant</Link> — lots et
            ouvrages sont alors créés d’un coup, sans ressaisie.
          </p>
        ) : (
          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Intitulé</th>
                  <th>Corps d’état</th>
                  <th>Coefficient</th>
                  <th style={{ textAlign: 'right' }}>Montant HT</th>
                  <th style={{ textAlign: 'right' }}>Part</th>
                  <th>Postes</th>
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => {
                  const ligneRecap = recapitulatif.lots.find((l) => l.lotId === lot.id)
                  return (
                    <tr key={lot.id}>
                      <td className="mono">{lot.numero}</td>
                      <td style={{ fontWeight: 500 }}>
                        <Link href={`/missions/${mission.id}/chiffrage#lot-${lot.id}`}>{lot.intitule}</Link>
                      </td>
                      <td className="attenue">
                        {corpsEtats.find((c) => c.id === lot.corpsEtatId)?.libelle ?? '—'}
                      </td>
                      <td className="mono">
                        {lot.coefficientLocal ? (
                          lot.coefficientLocal.replace('.', ',')
                        ) : (
                          <span className="attenue" title="Hérité de la mission">
                            {mission.coefficientLocalDefaut.replace('.', ',')} (hérité)
                          </span>
                        )}
                      </td>
                      <td className="chiffre">{formaterMontant(lot.montantEstimeHt)}</td>
                      <td className="chiffre attenue">
                        {ligneRecap?.partPourcent ? `${ligneRecap.partPourcent.replace('.', ',')} %` : '—'}
                      </td>
                      <td className="chiffre">{lot.postes.length}</td>
                      <td>
                        <Link href={`/missions/${mission.id}/consultation/${lot.id}`} className="bouton bouton-discret">
                          Consultation
                        </Link>
                      </td>
                      <td>
                        <form action={actionSupprimerLot}>
                          <input type="hidden" name="missionId" value={mission.id} />
                          <input type="hidden" name="lotId" value={lot.id} />
                          <button type="submit" className="bouton bouton-discret bouton-danger">
                            Supprimer
                          </button>
                        </form>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 600, borderTop: '1.5px solid var(--color-encre)' }}>
                    Total tous corps d’état
                  </td>
                  <td
                    className="chiffre"
                    style={{ fontWeight: 600, borderTop: '1.5px solid var(--color-encre)' }}
                  >
                    {formaterMontant(recapitulatif.totalTceHt)}
                  </td>
                  <td colSpan={3} style={{ borderTop: '1.5px solid var(--color-encre)' }} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)' }}>
          <form action={actionCreerLot} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <input type="hidden" name="missionId" value={mission.id} />
            <div className="champ" style={{ width: 90 }}>
              <label htmlFor="numero">N°</label>
              <input id="numero" name="numero" type="text" required className="mono" placeholder="02" />
            </div>
            <div className="champ" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="intitule">Intitulé du lot</label>
              <input id="intitule" name="intitule" type="text" required placeholder="Gros œuvre — Maçonnerie" />
            </div>
            <div className="champ" style={{ minWidth: 220 }}>
              <label htmlFor="corpsEtatId">Corps d’état</label>
              <select id="corpsEtatId" name="corpsEtatId" defaultValue="">
                <option value="">—</option>
                {corpsEtats.map((corps) => (
                  <option key={corps.id} value={corps.id}>
                    {corps.code} · {corps.libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="champ" style={{ width: 130 }}>
              <label htmlFor="coefficientLocal">Coefficient</label>
              <input
                id="coefficientLocal"
                name="coefficientLocal"
                type="text"
                inputMode="decimal"
                className="mono"
                placeholder="hérité"
              />
            </div>
            <button type="submit" className="bouton">
              Ajouter le lot
            </button>
          </form>
        </div>
      </section>

      <details>
        <summary className="attenue" style={{ fontSize: 13, cursor: 'pointer' }}>
          Actions irréversibles
        </summary>
        <div className="carte" style={{ marginTop: 10, borderColor: '#f3c2bd' }}>
          <div className="carte-corps" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <p className="attenue" style={{ fontSize: 13.5, margin: 0, maxWidth: '60ch' }}>
              Supprimer la mission efface ses lots, ses postes et tout son chiffrage. Cette action ne
              peut pas être annulée.
            </p>
            <form action={actionSupprimerMission}>
              <input type="hidden" name="id" value={mission.id} />
              <button type="submit" className="bouton bouton-danger">
                Supprimer la mission
              </button>
            </form>
          </div>
        </div>
      </details>
    </main>
  )
}
