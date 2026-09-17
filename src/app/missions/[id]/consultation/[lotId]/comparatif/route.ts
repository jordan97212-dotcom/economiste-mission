import { NextResponse } from 'next/server'
import { contexte } from '../../../../../session'
import { chargerTableauComparatif } from '../../../../../../application/offres/service'
import {
  genererComparatifExcel,
  nomFichierComparatif,
} from '../../../../../../infrastructure/excel/comparatif-export'

/** Export Excel du tableau comparatif des offres — §5.5. */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ id: string; lotId: string }> },
): Promise<Response> {
  const { id: missionId, lotId } = await params
  const { db } = await contexte()

  try {
    const mission = await db.mission.findUnique({
      where: { id: missionId },
      select: { reference: true, nomOperation: true },
    })
    if (!mission) return NextResponse.json({ erreur: 'Mission introuvable.' }, { status: 404 })

    const lot = await db.lot.findFirst({
      where: { id: lotId, missionId },
      select: { numero: true, intitule: true },
    })
    if (!lot) return NextResponse.json({ erreur: 'Lot introuvable.' }, { status: 404 })

    const tableau = await chargerTableauComparatif(db, missionId, lotId)

    const info = {
      reference: mission.reference,
      nomOperation: mission.nomOperation,
      lotNumero: lot.numero,
      lotIntitule: lot.intitule,
      dateGeneration: new Date(),
    }

    const fichier = await genererComparatifExcel(info, tableau)
    const nom = nomFichierComparatif(info)

    await db.documentGenere.create({
      data: { missionId, type: 'COMPARATIF_XLSX', nomFichier: nom, empreinte: '' },
    })

    return new NextResponse(new Uint8Array(fichier), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nom}"`,
        'Content-Length': String(fichier.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Export impossible.' },
      { status: 400 },
    )
  }
}
