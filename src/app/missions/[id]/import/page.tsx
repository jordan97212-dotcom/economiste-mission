import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contexte } from '../../../session'
import { ImportDpgf } from '../../../../components/ImportDpgf'

export default async function PageImport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await contexte()

  const mission = await db.mission.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      nomOperation: true,
      precisionPu: true,
      lots: {
        orderBy: [{ ordre: 'asc' }, { numero: 'asc' }],
        select: { id: true, numero: true, intitule: true, _count: { select: { postes: true } } },
      },
    },
  })
  if (!mission) notFound()

  return (
    <main className="contenu" style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <p className="surtitre mono">
            <Link href={`/missions/${mission.id}`}>{mission.reference}</Link> · Import
          </p>
          <h1>Importer un DPGF</h1>
          <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '70ch' }}>
            Le mappage des colonnes est proposé puis corrigé par vous. Une ligne qui porte un
            intitulé mais ni quantité ni prix devient un sous-lot, et les lignes suivantes lui sont
            rattachées. Rien n’est écrit tant que l’aperçu n’est pas conforme.
          </p>
        </div>
        <Link href={`/missions/${mission.id}`} className="bouton">
          Retour à la fiche
        </Link>
      </div>

      <ImportDpgf
        missionId={mission.id}
        precisionPu={mission.precisionPu}
        lots={mission.lots.map((lot) => ({
          id: lot.id,
          numero: lot.numero,
          intitule: lot.intitule,
          nbPostes: lot._count.postes,
        }))}
      />
    </main>
  )
}
