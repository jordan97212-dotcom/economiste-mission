import { notFound } from 'next/navigation'
import { contexte } from '../../../session'
import { missionVersDTO } from '../../../../application/chiffrage/service'
import { FormulaireMission } from '../../../../components/FormulaireMission'
import { actionModifierMission } from '../../actions'

export default async function PageModifierMission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await contexte()
  const mission = await db.mission.findUnique({ where: { id } })
  if (!mission) notFound()

  return (
    <main className="contenu" style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 22 }}>
        <p className="surtitre mono">{mission.reference}</p>
        <h1>Modifier la mission</h1>
      </div>
      <FormulaireMission
        action={actionModifierMission}
        mission={missionVersDTO(mission)}
        libelleEnvoi="Enregistrer"
      />
    </main>
  )
}
