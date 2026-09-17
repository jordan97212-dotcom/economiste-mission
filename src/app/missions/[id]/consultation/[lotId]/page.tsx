import Link from 'next/link'
import { piecesDuDossier } from '../../../../../application/pieces/service'
import { contexte } from '../../../../session'
import { listerEntreprises } from '../../../../../application/entreprises/service'
import { listerConsultationsDuLot } from '../../../../../application/consultations/service'
import { chargerTableauComparatif } from '../../../../../application/offres/service'
import { chargerRapportBrouillon, genererBrouillonAutomatique } from '../../../../../application/offres/rapport'
import { ConsultationLot } from './consultation-lot'

export default async function PageConsultationLot({
  params,
}: {
  params: Promise<{ id: string; lotId: string }>
}) {
  const { id: missionId, lotId } = await params
  const { db } = await contexte()

  const [mission, lot, entreprises, consultations, tableau, brouillon] = await Promise.all([
    db.mission.findUnique({ where: { id: missionId }, select: { id: true, reference: true, nomOperation: true } }),
    db.lot.findFirst({ where: { id: lotId, missionId }, select: { id: true, numero: true, intitule: true } }),
    listerEntreprises(db),
    listerConsultationsDuLot(db, missionId, lotId),
    chargerTableauComparatif(db, missionId, lotId),
    chargerRapportBrouillon(db, missionId, lotId),
  ])

  if (!mission || !lot) {
    return (
      <main className="contenu">
        <p className="vide">Lot introuvable.</p>
      </main>
    )
  }

  const entreprisesDejaConsultees = new Set(consultations.map((c) => c.entrepriseId))

  // Ce que l'archive emporterait : les pièces du lot, plus celles de l'opération.
  const nbPiecesDuLot = (await piecesDuDossier(db, mission.id, lot.id)).length

  return (
    <main className="contenu-large">
      <div style={{ marginBottom: 18 }}>
        <p className="surtitre">
          <Link href={`/missions/${mission.id}`}>{mission.reference}</Link> · {mission.nomOperation}
        </p>
        <h1>
          Consultation — Lot {lot.numero} · {lot.intitule}
        </h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '76ch' }}>
          Entreprises consultées, offres reçues et tableau comparatif de ce lot. Une offre anormalement
          basse est un risque de dérive en chantier : elle se signale, elle ne s’écarte jamais seule.
        </p>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <a className="bouton bouton-primaire" href={`/missions/${mission.id}/consultation/${lot.id}/dossier`} download>
            Télécharger le dossier de consultation
          </a>
          <Link href={`/missions/${mission.id}/pieces`} className="bouton">
            Pièces du dossier ({nbPiecesDuLot})
          </Link>
        </div>
      </div>

      <ConsultationLot
        missionId={mission.id}
        lotId={lot.id}
        entreprises={entreprises.map((e) => ({ id: e.id, raisonSociale: e.raisonSociale }))}
        entreprisesDejaConsultees={[...entreprisesDejaConsultees]}
        consultations={consultations.map((c) => ({
          id: c.id,
          entrepriseId: c.entrepriseId,
          entrepriseNom: c.entrepriseNom,
          statut: c.statut,
          dateEnvoiDce: c.dateEnvoiDce ? c.dateEnvoiDce.toISOString().slice(0, 10) : null,
          dateLimiteRemise: c.dateLimiteRemise ? c.dateLimiteRemise.toISOString().slice(0, 10) : null,
          dateRelance: c.dateRelance ? c.dateRelance.toISOString().slice(0, 10) : null,
          dateReceptionOffre: c.dateReceptionOffre ? c.dateReceptionOffre.toISOString().slice(0, 10) : null,
          nbOffres: c.nbOffres,
        }))}
        tableau={{
          montantEstimeHt: (tableau.montantEstimeHt as unknown as bigint).toString(),
          colonnes: tableau.colonnes.map((c) => ({
            offreId: c.offreId,
            entrepriseNom: c.entrepriseNom,
            montantHt: (c.montantHt as unknown as bigint).toString(),
            remiseGlobaleHt: (c.remiseGlobaleHt as unknown as bigint).toString(),
            type: c.type,
            libelle: c.libelle,
            classee: c.classee,
            ecartComparable: c.ecartComparable,
            montantNetHt: (c.montantNetHt as unknown as bigint).toString(),
            ecartMontantHt: (c.ecart.montantHt as unknown as bigint).toString(),
            ecartPourcent: c.ecart.pourcent ? c.ecart.pourcent.toFixed(2) : null,
            conforme: c.conforme,
            detaillee: c.detaillee,
            moinsDisante: c.moinsDisante,
          })),
          lignes: tableau.lignes.map((l) => ({
            posteId: l.poste.posteId,
            code: l.poste.code,
            designation: l.poste.designation,
            unite: l.poste.unite,
            montantEstimeHt: (l.poste.montantEstimeHt as unknown as bigint).toString(),
            cellules: l.cellules.map((c) => ({
              offreId: c.offreId,
              montantHt: c.montantHt !== null ? (c.montantHt as unknown as bigint).toString() : null,
            })),
            anomalies: l.anomalies.map((a) => ({ offreId: String(a.reference), message: a.message })),
          })),
          anomaliesGlobales: tableau.anomaliesGlobales.map((a) => ({
            offreId: String(a.reference),
            message: a.message,
          })),
        }}
        brouillon={brouillon}
        brouillonSuggere={genererBrouillonAutomatique(tableau)}
      />
    </main>
  )
}
