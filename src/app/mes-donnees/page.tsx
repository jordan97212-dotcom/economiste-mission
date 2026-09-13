import Link from 'next/link'
import { contexte } from '../session'
import { listerJournal, type EntiteAuditee } from '../../application/audit/service'
import {
  LIBELLES_ACTION,
  LIBELLES_ENTITE,
  resumerChangement,
} from '../../application/audit/lisibilite'

export default async function PageMesDonnees({
  searchParams,
}: {
  searchParams: Promise<{ entite?: string }>
}) {
  const { entite } = await searchParams
  const { db, utilisateur } = await contexte()

  const [journal, compteurs] = await Promise.all([
    listerJournal(db, { entite: (entite as EntiteAuditee) || null, limite: 200 }),
    Promise.all([
      db.mission.count(),
      db.prixReference.count(),
      db.trame.count(),
      db.journalAudit.count(),
    ]),
  ])

  const [nbMissions, nbPrix, nbTrames, nbEntrees] = compteurs

  return (
    <main className="contenu" style={{ maxWidth: 1200 }}>
      <div style={{ marginBottom: 22 }}>
        <p className="surtitre">Compte</p>
        <h1>Mes données</h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '72ch' }}>
          Tout ce que contient l’application vous appartient et doit pouvoir en sortir à tout
          moment. Le journal, lui, répond à une seule question : qui a modifié quoi, et quand.
        </p>
      </div>

      <section className="carte" style={{ marginBottom: 22 }}>
        <div className="carte-entete">
          <h2>Exporter toutes mes données</h2>
          <span className="etiquette etiquette-accent">aucun format propriétaire</span>
        </div>
        <div className="carte-corps" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <p style={{ marginTop: 0, fontSize: 14, maxWidth: '68ch' }}>
              Une archive contenant, pour chaque opération, le bordereau en Excel, toutes ses
              données en JSON et les textes de CCTP en fichiers texte. S’y ajoutent la base de
              prix, les trames, les référentiels et le journal des modifications.
            </p>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12 }}>
              <div>
                <p className="surtitre">Missions</p>
                <p className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{nbMissions}</p>
              </div>
              <div>
                <p className="surtitre">Prix de référence</p>
                <p className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{nbPrix}</p>
              </div>
              <div>
                <p className="surtitre">Trames</p>
                <p className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{nbTrames}</p>
              </div>
              <div>
                <p className="surtitre">Entrées de journal</p>
                <p className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{nbEntrees}</p>
              </div>
            </div>
          </div>
          <a href="/mes-donnees/archive" className="bouton bouton-primaire" download>
            Télécharger l’archive
          </a>
        </div>
      </section>

      <section className="carte">
        <div className="carte-entete">
          <h2>Journal des modifications</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Link
              href="/mes-donnees"
              className={entite ? 'bouton bouton-discret' : 'bouton bouton-discret etiquette-accent'}
            >
              Tout
            </Link>
            {['Mission', 'Lot', 'Poste', 'TexteCctp', 'Import'].map((cle) => (
              <Link
                key={cle}
                href={`/mes-donnees?entite=${cle}`}
                className="bouton bouton-discret"
                style={entite === cle ? { background: 'var(--color-accent-clair)', color: 'var(--color-accent-encre)' } : undefined}
              >
                {LIBELLES_ENTITE[cle]}
              </Link>
            ))}
          </div>
        </div>

        {journal.length === 0 ? (
          <p className="vide">
            Rien pour le moment. Le journal se remplit dès qu’une donnée financière change.
          </p>
        ) : (
          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Quand</th>
                  <th>Quoi</th>
                  <th>Action</th>
                  <th>Détail</th>
                  <th>Par</th>
                </tr>
              </thead>
              <tbody>
                {journal.map((entree) => (
                  <tr key={entree.id}>
                    <td className="mono attenue" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {entree.survenuLe.toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ fontSize: 13.5, whiteSpace: 'nowrap' }}>
                      {LIBELLES_ENTITE[entree.entite] ?? entree.entite}
                    </td>
                    <td>
                      <span
                        className={
                          entree.action === 'SUPPRESSION' ? 'etiquette etiquette-alerte' : 'etiquette'
                        }
                      >
                        {LIBELLES_ACTION[entree.action] ?? entree.action}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{resumerChangement(entree.avant, entree.apres)}</td>
                    <td className="attenue" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {utilisateur.nom ?? utilisateur.email}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)' }}>
          <p className="attenue" style={{ fontSize: 13, margin: 0, maxWidth: '74ch' }}>
            Le journal enregistre l’intention, pas le recalcul : les prix unitaires finaux, les
            montants et les totaux de lot sont recalculés à chaque écriture et n’y figurent pas. Un
            import de DPGF laisse une entrée de synthèse, pas une par ligne.
          </p>
        </div>
      </section>
    </main>
  )
}
