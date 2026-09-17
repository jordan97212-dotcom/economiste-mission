import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contexte } from '../../../session'
import { listerReperes } from '../../../../application/metre/service'
import { GestionReperes } from '../../../../components/GestionReperes'

export default async function PageReperes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await contexte()

  const mission = await db.mission.findUnique({
    where: { id },
    select: { id: true, reference: true, nomOperation: true },
  })
  if (!mission) notFound()

  const reperes = await listerReperes(db, id)

  return (
    <main className="contenu-large">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 6,
        }}
      >
        <div>
          <p className="surtitre mono">
            <Link href={`/missions/${mission.id}`}>{mission.reference}</Link> · Repères de métré
          </p>
          <h1>{mission.nomOperation}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="bouton" href={`/missions/${mission.id}/metre/export`}>
            Exporter le métré
          </a>
          <Link href={`/missions/${mission.id}/chiffrage`} className="bouton">
            Retour au chiffrage
          </Link>
        </div>
      </div>

      <p className="attenue" style={{ maxWidth: 720, marginBottom: 18 }}>
        Un repère est une quantité mesurée une seule fois et reprise dans plusieurs ouvrages. Depuis
        la feuille de métré d’un ouvrage, « Rappel de repère » vient y chercher sa valeur : quand le
        repère change, tous les ouvrages qui le rappellent suivent.
      </p>

      <GestionReperes missionId={mission.id} reperesInitiaux={reperes} />
    </main>
  )
}
