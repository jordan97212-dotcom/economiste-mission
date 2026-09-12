import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contexte } from '../../../../session'
import { chargerChiffrage, MissionIntrouvable } from '../../../../../application/chiffrage/service'
import { chargerTextes } from '../../../../../application/dce/service'
import { EditeurTextes } from '../../../../../components/EditeurTextes'

export default async function PageTextes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await contexte()

  let chiffrage
  try {
    chiffrage = await chargerChiffrage(db, id)
  } catch (erreur) {
    if (erreur instanceof MissionIntrouvable) notFound()
    throw erreur
  }

  const [textes, trames] = await Promise.all([
    chargerTextes(db, id),
    db.trame.findMany({
      where: { type: 'CCTP' },
      orderBy: { intitule: 'asc' },
      select: { id: true, intitule: true, corpsEtatId: true },
    }),
  ])

  const lots = chiffrage.lots.map((lot) => ({
    id: lot.id,
    numero: lot.numero,
    intitule: lot.intitule,
    corpsEtatId: lot.corpsEtatId,
    ouvrages: lot.postes.map((poste) => ({
      id: poste.id,
      lotId: lot.id,
      type: poste.type,
      profondeur: poste.profondeur,
      code: poste.code,
      designation: poste.designation,
      unite: poste.unite,
      contenu: textes.get(poste.id)?.contenu ?? '',
      designationSource: textes.get(poste.id)?.designationSource ?? null,
    })),
  }))

  return (
    <main className="contenu-large">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <p className="surtitre mono">
            <Link href={`/missions/${chiffrage.mission.id}/dce`}>{chiffrage.mission.reference}</Link>{' '}
            · Textes du CCTP
          </p>
          <h1>{chiffrage.mission.nomOperation}</h1>
        </div>
        <Link href={`/missions/${chiffrage.mission.id}/dce`} className="bouton">
          Retour aux pièces écrites
        </Link>
      </div>

      <EditeurTextes missionId={chiffrage.mission.id} lots={lots} trames={trames} />
    </main>
  )
}
