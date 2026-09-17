import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contexte } from '../../../session'
import { listerPieces } from '../../../../application/pieces/service'
import { PiecesDossier } from '../../../../components/PiecesDossier'

export default async function PagePieces({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await contexte()

  const mission = await db.mission.findUnique({
    where: { id },
    select: { id: true, reference: true, nomOperation: true },
  })
  if (!mission) notFound()

  const [pieces, lots] = await Promise.all([
    listerPieces(db, id),
    db.lot.findMany({
      where: { missionId: id },
      orderBy: [{ ordre: 'asc' }, { numero: 'asc' }],
      select: { id: true, numero: true, intitule: true },
    }),
  ])

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
            <Link href={`/missions/${mission.id}`}>{mission.reference}</Link> · Pièces du dossier
          </p>
          <h1>{mission.nomOperation}</h1>
        </div>
        <Link href={`/missions/${mission.id}`} className="bouton">
          Retour à la fiche
        </Link>
      </div>

      <p className="attenue" style={{ maxWidth: 760, marginBottom: 18 }}>
        Plans, rapports de sol, diagnostics, notices : les pièces que vous ne rédigez pas mais que
        les entreprises doivent recevoir. Une pièce peut valoir pour toute l’opération ou pour un
        lot seulement, et ne part avec le dossier de consultation que si la case « Au DCE » est
        cochée.
      </p>

      <PiecesDossier missionId={mission.id} lots={lots} piecesInitiales={pieces} />
    </main>
  )
}
