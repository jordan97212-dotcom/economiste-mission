import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contexte } from '../../../../session'
import { chargerChiffrage, MissionIntrouvable } from '../../../../../application/chiffrage/service'
import { proposerGeneration } from '../../../../../application/dce/generation'
import { GenerationCctp } from './generation-cctp'

export default async function PageGenerationCctp({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { db } = await contexte()

  let chiffrage
  try {
    chiffrage = await chargerChiffrage(db, id)
  } catch (erreur) {
    if (erreur instanceof MissionIntrouvable) notFound()
    throw erreur
  }

  const proposition = await proposerGeneration(db, id)

  return (
    <main className="contenu">
      <div style={{ marginBottom: 22 }}>
        <p className="surtitre mono">
          {chiffrage.mission.reference} ·{' '}
          <Link href={`/missions/${id}/dce`}>Pièces écrites</Link>
        </p>
        <h1>Générer le CCTP depuis vos trames</h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '78ch' }}>
          Chaque ouvrage du bordereau est rapproché de votre bibliothèque. Les correspondances
          franches arrivent cochées, les approximatives attendent votre regard, et les ouvrages sans
          trame sont listés à part. Rien n’est écrit avant que vous n’appliquiez.
        </p>
      </div>

      <GenerationCctp
        missionId={id}
        lots={proposition.lots.map((lot) => ({
          lotId: lot.lotId,
          numero: lot.numero,
          intitule: lot.intitule,
          corpsEtat: lot.corpsEtat,
          nbTramesDisponibles: lot.nbTramesDisponibles,
          synthese: lot.synthese,
          appariements: lot.appariements.map((a) => ({ ...a })),
        }))}
        synthese={proposition.synthese}
      />
    </main>
  )
}
