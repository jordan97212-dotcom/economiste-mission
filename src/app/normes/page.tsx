import { contexte } from '../session'
import { DELAI_REVERIFICATION_MOIS } from '../../domain/normes/verification'
import { Referentiel } from './referentiel'

export default async function PageNormes() {
  const { db } = await contexte()

  const [normes, nbMissions] = await Promise.all([
    db.referenceNormative.findMany({ orderBy: [{ statut: 'asc' }, { reference: 'asc' }] }),
    db.mission.count(),
  ])

  const aujourdhui = new Date()
  const limite = new Date(aujourdhui)
  limite.setMonth(limite.getMonth() - DELAI_REVERIFICATION_MOIS)

  const aRevoir = normes.filter(
    (norme) =>
      norme.statut === 'EN_VIGUEUR' &&
      (norme.dateVerification === null || norme.dateVerification < limite),
  ).length

  return (
    <main className="contenu" style={{ maxWidth: 1200 }}>
      <div style={{ marginBottom: 22 }}>
        <p className="surtitre">Pièces écrites</p>
        <h1>Normes et DTU</h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '74ch' }}>
          Les références que vos CCTP citent, et leur statut. Un DTU annulé cité dans une pièce
          contractuelle bloque la génération du CCTP, comme un ouvrage sans texte.
        </p>
      </div>

      <Referentiel
        normes={normes.map((norme) => ({
          id: norme.id,
          reference: norme.reference,
          titre: norme.titre,
          statut: norme.statut,
          remplaceePar: norme.remplaceePar,
          source: norme.source,
          commentaire: norme.commentaire,
          dateEdition: norme.dateEdition ? norme.dateEdition.toISOString().slice(0, 10) : null,
          dateVerification: norme.dateVerification
            ? norme.dateVerification.toISOString().slice(0, 10)
            : null,
          aRevoir:
            norme.statut === 'EN_VIGUEUR' &&
            (norme.dateVerification === null || norme.dateVerification < limite),
        }))}
        nbARevoir={aRevoir}
        nbMissions={nbMissions}
        delaiMois={DELAI_REVERIFICATION_MOIS}
      />
    </main>
  )
}
