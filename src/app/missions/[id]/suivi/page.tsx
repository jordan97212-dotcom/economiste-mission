import Link from 'next/link'
import { contexte } from '../../../session'
import { chargerSuivi } from '../../../../application/suivi/service'
import { listerAvenants } from '../../../../application/avenants/service'
import { listerSituations } from '../../../../application/situations/service'
import { SuiviChantier } from './suivi-chantier'

export default async function PageSuivi({ params }: { params: Promise<{ id: string }> }) {
  const { id: missionId } = await params
  const { db } = await contexte()

  const mission = await db.mission.findUnique({
    where: { id: missionId },
    select: { id: true, reference: true, nomOperation: true },
  })
  if (!mission) {
    return (
      <main className="contenu">
        <p className="vide">Mission introuvable.</p>
      </main>
    )
  }

  const [suivi, avenants] = await Promise.all([
    chargerSuivi(db, missionId),
    listerAvenants(db, missionId),
  ])

  // Les situations de chaque lot, pour le détail dépliable.
  const situationsParLot: Record<string, Awaited<ReturnType<typeof listerSituations>>> = {}
  for (const lot of suivi.lots) {
    situationsParLot[lot.lotId] = await listerSituations(db, missionId, lot.lotId)
  }

  // Les offres reçues par lot, pour pouvoir attribuer depuis cet écran.
  const offres = await db.offre.findMany({
    where: { consultation: { lot: { missionId } } },
    select: {
      id: true,
      montantHt: true,
      remiseGlobaleHt: true,
      conforme: true,
      consultation: { select: { lotId: true, entreprise: { select: { raisonSociale: true } } } },
    },
    orderBy: { montantHt: 'asc' },
  })

  const offresParLot: Record<string, { id: string; entrepriseNom: string; montantNetHt: string; conforme: boolean }[]> = {}
  for (const offre of offres) {
    const liste = offresParLot[offre.consultation.lotId] ?? []
    liste.push({
      id: offre.id,
      entrepriseNom: offre.consultation.entreprise.raisonSociale,
      montantNetHt: (offre.montantHt - offre.remiseGlobaleHt).toString(),
      conforme: offre.conforme,
    })
    offresParLot[offre.consultation.lotId] = liste
  }

  return (
    <main className="contenu-large">
      <div style={{ marginBottom: 18 }}>
        <p className="surtitre">
          <Link href={`/missions/${mission.id}`}>{mission.reference}</Link> · {mission.nomOperation}
        </p>
        <h1>Suivi financier de chantier</h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '78ch' }}>
          Marché attribué, avenants, situations de travaux et reste à réaliser. Une situation se
          calcule sur le marché du lot, jamais sur son estimatif : il faut donc avoir retenu une
          offre avant de pouvoir en saisir une.
        </p>
      </div>

      <SuiviChantier
        missionId={mission.id}
        suivi={suivi}
        avenants={avenants.map((a) => ({
          id: a.id,
          numero: a.numero,
          lotId: a.lotId,
          lotLibelle: a.lotLibelle,
          objet: a.objet,
          montantHt: a.montantHt,
          date: a.date.toISOString().slice(0, 10),
          motif: a.motif,
          statut: a.statut,
        }))}
        situationsParLot={Object.fromEntries(
          Object.entries(situationsParLot).map(([lotId, situations]) => [
            lotId,
            situations.map((s) => ({
              id: s.id,
              numeroSituation: s.numeroSituation,
              periode: s.periode.toISOString().slice(0, 10),
              avancementPourcent: s.avancementPourcent,
              montantCumuleHt: s.montantCumuleHt,
              montantPeriodeHt: s.montantPeriodeHt,
              retenueGarantieHt: s.retenueGarantieHt,
              avanceRemboursee: s.avanceRemboursee,
              compteProrataHt: s.compteProrataHt,
              netAPayerHt: s.netAPayerHt,
              dateValidation: s.dateValidation ? s.dateValidation.toISOString().slice(0, 10) : null,
            })),
          ]),
        )}
        offresParLot={offresParLot}
      />
    </main>
  )
}
