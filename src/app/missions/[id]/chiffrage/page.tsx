import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contexte } from '../../../session'
import { chargerChiffrage, MissionIntrouvable } from '../../../../application/chiffrage/service'
import { GrilleChiffrage } from '../../../../components/GrilleChiffrage'

export default async function PageChiffrage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await contexte()

  let chiffrage
  try {
    chiffrage = await chargerChiffrage(db, id)
  } catch (erreur) {
    if (erreur instanceof MissionIntrouvable) notFound()
    throw erreur
  }

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
            <Link href={`/missions/${chiffrage.mission.id}`}>{chiffrage.mission.reference}</Link> · Chiffrage détaillé
          </p>
          <h1>{chiffrage.mission.nomOperation}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/missions/${chiffrage.mission.id}/metre`} className="bouton">
            Repères de métré
          </Link>
          <Link href={`/missions/${chiffrage.mission.id}`} className="bouton">
            Retour à la fiche
          </Link>
        </div>
      </div>

      <GrilleChiffrage chiffrageInitial={chiffrage} />
    </main>
  )
}
