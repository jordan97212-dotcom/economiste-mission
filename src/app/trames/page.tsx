import { contexte } from '../session'
import { listerTrames, contenuDeTrame } from '../../application/trames/service'
import { VARIABLES_DISPONIBLES } from '../../application/dce/service'
import { Bibliotheque } from './bibliotheque'
import { actionSupprimerTrame } from './actions'

export default async function PageTrames() {
  const { db } = await contexte()

  const [trames, corpsEtats] = await Promise.all([
    listerTrames(db),
    db.corpsEtat.findMany({
      where: { masque: false },
      orderBy: { ordre: 'asc' },
      select: { id: true, code: true, libelle: true },
    }),
  ])

  return (
    <main className="contenu">
      <div style={{ marginBottom: 22 }}>
        <p className="surtitre">Référentiel</p>
        <h1>Bibliothèque de trames</h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '72ch' }}>
          Vos textes réutilisables : prescriptions de CCTP par corps d’état, clauses de CCAP et de
          CCTG. Une trame de CCTP s’applique ensuite à un ouvrage comme point de départ, jamais
          comme texte imposé. Les variables entre doubles accolades sont remplacées par les données
          de la mission au moment de produire le document.
        </p>
      </div>

      <Bibliotheque
        trames={trames.map((trame) => ({
          id: trame.id,
          type: trame.type,
          intitule: trame.intitule,
          corpsEtatId: trame.corpsEtatId,
          corpsEtat: trame.corpsEtat ? `${trame.corpsEtat.code} · ${trame.corpsEtat.libelle}` : null,
          contenu: contenuDeTrame(trame.contenu),
        }))}
        corpsEtats={corpsEtats}
        variables={[...VARIABLES_DISPONIBLES]}
      />

      {trames.length > 0 ? (
        <section className="carte" style={{ marginTop: 20 }}>
          <div className="carte-entete">
            <h2>Supprimer une trame</h2>
          </div>
          <div className="carte-corps" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {trames.map((trame) => (
              <form key={trame.id} action={actionSupprimerTrame}>
                <input type="hidden" name="id" value={trame.id} />
                <button type="submit" className="bouton bouton-discret bouton-danger">
                  {trame.intitule}
                </button>
              </form>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
