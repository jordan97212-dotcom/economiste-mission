import Link from 'next/link'
import { contexte } from './session'
import { listerMissions } from '../application/missions/service'
import { actionArchiverMission, actionSupprimerMission } from './missions/actions'
import * as Money from '../domain/money/money'
import { formaterMontant, formaterDate, LIBELLES_STATUT, LIBELLES_TYPE_OUVRAGE } from '../lib/format'

const ORDRE_STATUTS = ['EN_COURS', 'PROSPECT', 'TERMINEE', 'ABANDONNEE'] as const

export default async function TableauDeBord() {
  const { db } = await contexte()
  const [missions, archivees] = await Promise.all([
    listerMissions(db),
    listerMissions(db, { archivees: true }),
  ])

  const parStatut = new Map<string, typeof missions>()
  for (const mission of missions) {
    const liste = parStatut.get(mission.statut) ?? []
    liste.push(mission)
    parStatut.set(mission.statut, liste)
  }

  const totalEnCours = Money.somme(
    (parStatut.get('EN_COURS') ?? []).flatMap((m) =>
      m.lots.map((l) => Money.depuisCentimes(l.montantEstimeHt)),
    ),
  )

  return (
    <main className="contenu">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <p className="surtitre">Tableau de bord</p>
          <h1>Missions</h1>
        </div>
        <div style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
          <div>
            <p className="surtitre">En cours</p>
            <p className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
              {(parStatut.get('EN_COURS') ?? []).length}
            </p>
          </div>
          <div>
            <p className="surtitre">Travaux estimés en cours</p>
            <p className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
              {Money.formater(totalEnCours)}
            </p>
          </div>
          <Link href="/missions/nouvelle" className="bouton bouton-primaire">
            Nouvelle mission
          </Link>
        </div>
      </div>

      {missions.length === 0 ? (
        <div className="carte">
          <p className="vide">
            Aucune mission pour le moment.{' '}
            <Link href="/missions/nouvelle">Créez la première</Link>, ou dupliquez-en une plus tard
            pour démarrer plus vite sur une opération similaire.
          </p>
        </div>
      ) : null}

      {ORDRE_STATUTS.map((statut) => {
        const liste = parStatut.get(statut)
        if (!liste || liste.length === 0) return null

        return (
          <section key={statut} style={{ marginBottom: 28 }}>
            <div className="carte">
              <div className="carte-entete">
                <h2>{LIBELLES_STATUT[statut]}</h2>
                <span className="etiquette">{liste.length}</span>
              </div>
              <div className="defilement">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Opération</th>
                      <th>Maître d’ouvrage</th>
                      <th>Type</th>
                      <th>Lots</th>
                      <th style={{ textAlign: 'right' }}>Estimatif HT</th>
                      <th style={{ textAlign: 'right' }}>Honoraires HT</th>
                      <th>Échéance</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((mission) => {
                      const estimatif = Money.somme(
                        mission.lots.map((l) => Money.depuisCentimes(l.montantEstimeHt)),
                      )
                      return (
                        <tr key={mission.id}>
                          <td className="mono">
                            <Link href={`/missions/${mission.id}`}>{mission.reference}</Link>
                          </td>
                          <td style={{ fontWeight: 500 }}>
                            <Link href={`/missions/${mission.id}`}>{mission.nomOperation}</Link>
                          </td>
                          <td className="attenue">{mission.maitreOuvrage ?? '—'}</td>
                          <td className="attenue">
                            {LIBELLES_TYPE_OUVRAGE[mission.typeOuvrage] ?? mission.typeOuvrage}
                          </td>
                          <td className="chiffre">{mission._count.lots}</td>
                          <td className="chiffre">
                            {Money.estZero(estimatif) ? '—' : Money.formater(estimatif)}
                          </td>
                          <td className="chiffre">
                            {formaterMontant(mission.honorairesMissionHt?.toString() ?? null)}
                          </td>
                          <td className="attenue mono" style={{ fontSize: 13 }}>
                            {formaterDate(mission.dateFinPrevue?.toISOString() ?? null)}
                          </td>
                          <td>
                            <form action={actionArchiverMission}>
                              <input type="hidden" name="id" value={mission.id} />
                              <input type="hidden" name="archivee" value="oui" />
                              <button type="submit" className="bouton bouton-discret">
                                Archiver
                              </button>
                            </form>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )
      })}

      {archivees.length > 0 ? (
        <details style={{ marginTop: 8 }}>
          <summary className="attenue" style={{ fontSize: 13.5, cursor: 'pointer' }}>
            Archives ({archivees.length})
          </summary>
          <div className="carte" style={{ marginTop: 10 }}>
            <div className="carte-corps">
              <p className="attenue" style={{ fontSize: 13.5, marginTop: 0, maxWidth: '70ch' }}>
                Une mission archivée n’est plus comptée au tableau de bord, mais rien n’est perdu :
                son chiffrage, ses offres et ses pièces sont intacts, et elle revient telle quelle si
                vous la ressortez. La suppression, elle, est définitive.
              </p>
            </div>
            <div className="defilement">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Opération</th>
                    <th>Maître d’ouvrage</th>
                    <th>Archivée le</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {archivees.map((mission) => (
                    <tr key={mission.id}>
                      <td className="mono">
                        <Link href={`/missions/${mission.id}`}>{mission.reference}</Link>
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        <Link href={`/missions/${mission.id}`}>{mission.nomOperation}</Link>
                      </td>
                      <td className="attenue">{mission.maitreOuvrage ?? '—'}</td>
                      <td className="attenue mono" style={{ fontSize: 13 }}>
                        {formaterDate(mission.archiveeLe?.toISOString() ?? null)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <form action={actionArchiverMission}>
                            <input type="hidden" name="id" value={mission.id} />
                            <input type="hidden" name="archivee" value="non" />
                            <button type="submit" className="bouton bouton-discret">
                              Sortir de l’archive
                            </button>
                          </form>
                          {/* La suppression n'est offerte qu'ici : il faut avoir
                              rangé une mission avant de pouvoir l'effacer, ce qui
                              met un geste délibéré entre le tableau de bord et une
                              perte irréversible. */}
                          <form action={actionSupprimerMission}>
                            <input type="hidden" name="id" value={mission.id} />
                            <button type="submit" className="bouton bouton-danger">
                              Supprimer définitivement
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      ) : null}
    </main>
  )
}
