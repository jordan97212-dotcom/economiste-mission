import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contexte } from '../../../session'
import { chargerChiffrage, MissionIntrouvable } from '../../../../application/chiffrage/service'
import {
  verifierMission,
  variablesMission,
  VARIABLES_DISPONIBLES,
} from '../../../../application/dce/service'
import { conversionDisponible } from '../../../../infrastructure/docx/pdf'
import { chargerTextes } from '../../../../application/dce/service'

const LIBELLES_ANOMALIE: Record<string, string> = {
  ouvrage_sans_texte: 'Ouvrage sans texte',
  article_sans_ligne_chiffree: 'Article non chiffré',
  designation_divergente: 'Désignation modifiée',
  unite_incoherente: 'Unité incohérente',
  quantite_nulle: 'Quantité nulle',
  prix_nul: 'Prix à zéro',
  unite_absente: 'Unité absente',
  lot_vide: 'Lot vide',
  mission_sans_lot: 'Aucun lot',
  norme_annulee: 'Norme annulée',
  norme_remplacee: 'Norme remplacée',
  norme_projet: 'Norme à l’état de projet',
  norme_inconnue: 'Norme non référencée',
  statut_ancien: 'Statut à revérifier',
}

export default async function PageDce({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await contexte()

  let chiffrage
  try {
    chiffrage = await chargerChiffrage(db, id)
  } catch (erreur) {
    if (erreur instanceof MissionIntrouvable) notFound()
    throw erreur
  }

  const [synthese, textes, pdfDispo, trames] = await Promise.all([
    verifierMission(db, id),
    chargerTextes(db, id),
    conversionDisponible(),
    db.trame.findMany({ select: { id: true, type: true, intitule: true } }),
  ])

  const mission = chiffrage.mission
  const variables = variablesMission(chiffrage)
  const nbOuvrages = chiffrage.lots.reduce(
    (total, lot) => total + lot.postes.filter((p) => p.type === 'OUVRAGE').length,
    0,
  )
  const nbRediges = chiffrage.lots.reduce(
    (total, lot) =>
      total + lot.postes.filter((p) => p.type === 'OUVRAGE' && textes.has(p.id)).length,
    0,
  )

  const aTrameCcap = trames.some((t) => t.type === 'CCAP')
  const aTrameCctg = trames.some((t) => t.type === 'CCTG')

  const bloquantes = synthese.anomalies.filter((a) => a.severite === 'bloquante')
  const avertissements = synthese.anomalies.filter((a) => a.severite === 'avertissement')

  return (
    <main className="contenu" style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="surtitre mono">
            <Link href={`/missions/${mission.id}`}>{mission.reference}</Link> · Dossier de consultation
          </p>
          <h1>Pièces écrites</h1>
          <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '72ch' }}>
            Le CCTP est assemblé depuis les textes portés par chaque ouvrage, dans l’ordre des lots.
            Le contrôle de cohérence tourne avant toute génération.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Link href={`/missions/${mission.id}/dce/textes`} className="bouton bouton-primaire">
            Rédiger les textes
          </Link>
          <Link href="/trames" className="bouton">
            Bibliothèque de trames
          </Link>
        </div>
      </div>

      <section className="carte" style={{ marginBottom: 20 }}>
        <div className="carte-corps">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
            <div>
              <p className="surtitre">Ouvrages rédigés</p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                {nbRediges} / {nbOuvrages}
              </p>
            </div>
            <div>
              <p className="surtitre">Anomalies bloquantes</p>
              <p
                className="mono"
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: bloquantes.length > 0 ? 'var(--color-danger)' : 'var(--color-accent-encre)',
                }}
              >
                {bloquantes.length}
              </p>
            </div>
            <div>
              <p className="surtitre">Points à vérifier</p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 600, color: avertissements.length > 0 ? 'var(--color-alerte)' : undefined }}>
                {avertissements.length}
              </p>
            </div>
            <div>
              <p className="surtitre">Conversion PDF</p>
              <p style={{ marginTop: 6 }}>
                <span className={pdfDispo ? 'etiquette etiquette-accent' : 'etiquette etiquette-alerte'}>
                  {pdfDispo ? 'disponible' : 'indisponible sur ce serveur'}
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="carte" style={{ marginBottom: 20 }}>
        <div className="carte-entete">
          <h2>Contrôle de cohérence</h2>
          <span className={synthese.exportPossible ? 'etiquette etiquette-accent' : 'etiquette etiquette-alerte'}>
            {synthese.exportPossible ? 'Prêt pour l’export' : 'Export du CCTP bloqué'}
          </span>
        </div>

        {synthese.anomalies.length === 0 ? (
          <p className="vide">Aucune anomalie. Le DPGF et les pièces écrites se répondent.</p>
        ) : (
          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Sévérité</th>
                  <th>Type</th>
                  <th>Où</th>
                  <th>Détail</th>
                </tr>
              </thead>
              <tbody>
                {synthese.anomalies.slice(0, 100).map((anomalie, index) => (
                  <tr key={`${anomalie.code}-${anomalie.posteId ?? anomalie.lotId ?? index}`}>
                    <td>
                      <span
                        className={
                          anomalie.severite === 'bloquante'
                            ? 'etiquette etiquette-alerte'
                            : 'etiquette'
                        }
                      >
                        {anomalie.severite === 'bloquante' ? 'bloquante' : 'à vérifier'}
                      </span>
                    </td>
                    <td className="attenue" style={{ fontSize: 13 }}>
                      {LIBELLES_ANOMALIE[anomalie.code] ?? anomalie.code}
                    </td>
                    <td style={{ fontSize: 13.5 }}>{anomalie.repere}</td>
                    <td style={{ fontSize: 13.5 }}>{anomalie.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {synthese.anomalies.length > 100 ? (
          <p className="attenue" style={{ padding: '10px 18px', margin: 0, fontSize: 13 }}>
            {synthese.anomalies.length - 100} anomalie(s) supplémentaires non affichées.
          </p>
        ) : null}
      </section>

      <section className="carte" style={{ marginBottom: 20 }}>
        <div className="carte-entete">
          <h2>Générer les pièces</h2>
          <span className="attenue" style={{ fontSize: 13 }}>
            Le PDF est la conversion du Word, par le même moteur de mise en page.
          </span>
        </div>
        <div className="carte-corps" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <PieceRangee
            missionId={mission.id}
            piece="CCTP"
            libelle="CCTP — Cahier des clauses techniques particulières"
            detail={`Assemblé depuis ${nbRediges} texte(s) d’ouvrage.`}
            disponible
            bloque={!synthese.exportPossible}
            pdfDispo={pdfDispo}
          />
          <PieceRangee
            missionId={mission.id}
            piece="CCAP"
            libelle="CCAP — Cahier des clauses administratives particulières"
            detail={
              aTrameCcap
                ? 'Produit depuis votre trame, variables de mission résolues.'
                : 'Aucune trame de CCAP : créez-la dans la bibliothèque.'
            }
            disponible={aTrameCcap}
            bloque={false}
            pdfDispo={pdfDispo}
          />
          <PieceRangee
            missionId={mission.id}
            piece="CCTG"
            libelle="CCTG — Cahier des clauses techniques générales"
            detail={
              aTrameCctg
                ? 'Produit depuis votre trame, variables de mission résolues.'
                : 'Aucune trame de CCTG : créez-la dans la bibliothèque.'
            }
            disponible={aTrameCctg}
            bloque={false}
            pdfDispo={pdfDispo}
          />
        </div>
      </section>

      <section className="carte">
        <div className="carte-entete">
          <h2>Variables utilisables dans vos trames</h2>
        </div>
        <div className="defilement">
          <table className="tableau">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Valeur pour cette mission</th>
              </tr>
            </thead>
            <tbody>
              {VARIABLES_DISPONIBLES.map((nom) => (
                <tr key={nom}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{`{{${nom}}}`}</td>
                  <td className={variables[nom] ? '' : 'attenue'}>
                    {variables[nom] ?? 'non renseignée'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function PieceRangee({
  missionId,
  piece,
  libelle,
  detail,
  disponible,
  bloque,
  pdfDispo,
}: {
  missionId: string
  piece: string
  libelle: string
  detail: string
  disponible: boolean
  bloque: boolean
  pdfDispo: boolean
}) {
  const base = `/missions/${missionId}/piece?piece=${piece}`

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        paddingBottom: 14,
        borderBottom: '1px solid var(--color-filet-doux)',
      }}
    >
      <div style={{ flex: 1, minWidth: 280 }}>
        <p style={{ margin: 0, fontWeight: 500 }}>{libelle}</p>
        <p className="attenue" style={{ margin: 0, fontSize: 13 }}>
          {detail}
        </p>
      </div>

      {disponible ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`${base}&format=docx`} className="bouton" download>
            Word
          </a>
          {pdfDispo ? (
            <a href={`${base}&format=pdf`} className="bouton" download>
              PDF
            </a>
          ) : null}
          {bloque ? (
            <a href={`${base}&format=docx&forcer=1`} className="bouton bouton-danger" download>
              Générer malgré les anomalies
            </a>
          ) : null}
        </div>
      ) : (
        <span className="attenue" style={{ fontSize: 13 }}>
          Indisponible
        </span>
      )}
    </div>
  )
}
