import { contexte } from '../session'
import { listerPrix } from '../../application/prix/service'
import { ImportBasePrix } from '../../components/ImportBasePrix'
import { FormulairePrix } from './formulaire'
import { actionSupprimerPrix } from './actions'
import {
  formaterPrixUnitaire,
  formaterDate,
  LIBELLES_UNITE,
  LIBELLES_TYPE_OUVRAGE,
} from '../../lib/format'

const LIBELLES_ZONE: Record<string, string> = {
  METROPOLE: 'Métropole',
  MARTINIQUE: 'Martinique',
  AUTRE: 'Autre',
}

export default async function PageBasePrix({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; corps?: string }>
}) {
  const { q, corps } = await searchParams
  const { db } = await contexte()

  const [prix, corpsEtats] = await Promise.all([
    listerPrix(db, { texte: q ?? '', corpsEtatId: corps ?? null }),
    db.corpsEtat.findMany({
      where: { masque: false },
      orderBy: { ordre: 'asc' },
      select: { id: true, code: true, libelle: true },
    }),
  ])

  const total = await db.prixReference.count()

  return (
    <main className="contenu">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="surtitre">Référentiel</p>
          <h1>Ma base de prix</h1>
          <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '72ch' }}>
            Chaque mission close viendra l’enrichir avec les prix réellement pratiqués. C’est
            l’effet cumulatif qui fait la valeur de l’outil : au bout de quelques dizaines
            d’opérations, un historique local vaut mieux qu’une base métropole générique.
          </p>
        </div>
        <div>
          <p className="surtitre">Entrées</p>
          <p className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
            {total}
          </p>
        </div>
      </div>

      <section className="carte" style={{ marginBottom: 20 }}>
        <div className="carte-corps">
          <form style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="champ" style={{ flex: 1, minWidth: 240 }}>
              <label htmlFor="q">Rechercher</label>
              <input id="q" name="q" type="text" defaultValue={q ?? ''} placeholder="béton, cloison, VRD…" />
            </div>
            <div className="champ" style={{ minWidth: 240 }}>
              <label htmlFor="corps">Corps d’état</label>
              <select id="corps" name="corps" defaultValue={corps ?? ''}>
                <option value="">Tous</option>
                {corpsEtats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.libelle}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="bouton">
              Filtrer
            </button>
          </form>
        </div>
      </section>

      <section className="carte" style={{ marginBottom: 20 }}>
        <div className="carte-entete">
          <h2>Prix enregistrés</h2>
          <span className="etiquette">{prix.length} affichés</span>
        </div>

        {prix.length === 0 ? (
          <p className="vide">
            Aucun prix pour le moment. Ajoutez-en un ci-dessous, ou importez un classeur existant.
          </p>
        ) : (
          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Désignation</th>
                  <th>Unité</th>
                  <th style={{ textAlign: 'right' }}>Prix HT</th>
                  <th>Corps d’état</th>
                  <th>Contexte</th>
                  <th>Zone</th>
                  <th>Relevé le</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {prix.map((entree) => (
                  <tr key={entree.id}>
                    <td className="mono">{entree.code ?? '—'}</td>
                    <td style={{ fontWeight: 500 }}>{entree.designation}</td>
                    <td>{LIBELLES_UNITE[entree.unite] ?? entree.unite}</td>
                    <td className="chiffre">
                      {formaterPrixUnitaire(entree.prixUnitaireHt.toString(), 2, true)}
                    </td>
                    <td className="attenue">{entree.corpsEtat?.libelle ?? '—'}</td>
                    <td className="attenue" style={{ fontSize: 13 }}>
                      {entree.contexteTypeOuvrage
                        ? (LIBELLES_TYPE_OUVRAGE[entree.contexteTypeOuvrage] ?? entree.contexteTypeOuvrage)
                        : '—'}
                    </td>
                    <td className="attenue" style={{ fontSize: 13 }}>
                      {LIBELLES_ZONE[entree.zone] ?? entree.zone}
                    </td>
                    <td className="mono attenue" style={{ fontSize: 13 }}>
                      {formaterDate(entree.dateReleve.toISOString())}
                    </td>
                    <td>
                      <form action={actionSupprimerPrix}>
                        <input type="hidden" name="id" value={entree.id} />
                        <button type="submit" className="bouton bouton-discret bouton-danger">
                          Supprimer
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
        <section className="carte">
          <div className="carte-entete">
            <h2>Ajouter un prix</h2>
          </div>
          <div className="carte-corps">
            <FormulairePrix corpsEtats={corpsEtats} />
          </div>
        </section>

        <section className="carte">
          <div className="carte-entete">
            <h2>Importer un classeur</h2>
            <span className="attenue" style={{ fontSize: 13 }}>
              Désignation et prix suffisent.
            </span>
          </div>
          <div className="carte-corps">
            <ImportBasePrix />
          </div>
        </section>
      </div>
    </main>
  )
}
