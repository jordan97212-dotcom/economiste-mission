import { contexte } from '../../session'
import { genererReference } from '../../../application/missions/service'
import { FormulaireMission } from '../../../components/FormulaireMission'
import { actionCreerMission } from '../actions'

export default async function PageNouvelleMission() {
  const { db } = await contexte()
  const reference = await genererReference(db)

  return (
    <main className="contenu" style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 22 }}>
        <p className="surtitre">Cadrage</p>
        <h1>Nouvelle mission</h1>
      </div>
      <FormulaireMission
        action={actionCreerMission}
        referenceProposee={reference}
        libelleEnvoi="Créer la mission"
      />
    </main>
  )
}
