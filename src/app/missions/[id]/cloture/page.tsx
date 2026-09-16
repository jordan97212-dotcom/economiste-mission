import Link from 'next/link'
import { contexte } from '../../../session'
import {
  candidatsReinjection,
  chargerDecompteGeneral,
  chargerEtatCloture,
} from '../../../../application/cloture/service'
import { ClotureOperation } from './cloture-operation'

export default async function PageCloture({ params }: { params: Promise<{ id: string }> }) {
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

  const [decompte, proposition, etat] = await Promise.all([
    chargerDecompteGeneral(db, missionId),
    candidatsReinjection(db, missionId),
    chargerEtatCloture(db, missionId),
  ])

  return (
    <main className="contenu-large">
      <div style={{ marginBottom: 18 }}>
        <p className="surtitre">
          <Link href={`/missions/${mission.id}`}>{mission.reference}</Link> · {mission.nomOperation}
        </p>
        <h1>Clôture de l’opération</h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '78ch' }}>
          Le décompte général, le versement des prix réellement pratiqués dans votre base, et
          l’archivage. C’est ce versement qui referme la boucle : chaque chantier terminé rend
          l’estimation du suivant plus juste.
        </p>
      </div>

      <ClotureOperation
        missionId={mission.id}
        decompte={decompte}
        candidats={proposition.candidats}
        ecartes={proposition.ecartes}
        nbLotsSansAttribution={proposition.nbLotsSansAttribution}
        etat={{
          archivee: etat.archivee,
          archiveeLe: etat.archiveeLe ? etat.archiveeLe.toISOString().slice(0, 10) : null,
          statut: etat.statut,
          nbPrixVerses: etat.nbPrixVerses,
        }}
      />
    </main>
  )
}
