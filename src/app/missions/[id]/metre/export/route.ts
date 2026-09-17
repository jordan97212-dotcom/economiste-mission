import { NextResponse } from 'next/server'
import { contexte } from '../../../../session'
import { chargerMetreMission } from '../../../../../application/metre/service'
import { genererMetreExcel, nomFichierMetre } from '../../../../../infrastructure/excel/metre-export'

/** Export Excel du métré — pièce justificative des quantités, §5.2. */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: missionId } = await params
  const { db } = await contexte()

  try {
    const metre = await chargerMetreMission(db, missionId)
    const fichier = await genererMetreExcel(metre, { dateGeneration: new Date() })
    const nom = nomFichierMetre(metre)

    await db.documentGenere.create({
      data: { missionId, type: 'METRE_XLSX', nomFichier: nom, empreinte: '' },
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
