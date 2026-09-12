import Link from 'next/link'
import { contexte } from './session'
import { listerMissions } from '../application/missions/service'
import * as Money from '../domain/money/money'
import { formaterMontant, formaterDate, LIBELLES_STATUT, LIBELLES_TYPE_OUVRAGE } from '../lib/format'

const ORDRE_STATUTS = ['EN_COURS', 'PROSPECT', 'TERMINEE', 'ABANDONNEE'] as const

export default async function TableauDeBord() {
  const { db } = await contexte()
  const missions = await listerMissions(db)

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
    </main>
  )
}
