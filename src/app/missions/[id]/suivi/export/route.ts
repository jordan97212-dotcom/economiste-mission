import { NextResponse } from 'next/server'
import { contexte } from '../../../../session'
import { chargerSuivi } from '../../../../../application/suivi/service'
import { genererSuiviExcel, nomFichierSuivi } from '../../../../../infrastructure/excel/suivi-export'

/** Export Excel du tableau de suivi financier — §5.6. */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: missionId } = await params
  const { db } = await contexte()

  try {
    const mission = await db.mission.findUnique({
      where: { id: missionId },
      select: { reference: true, nomOperation: true },
    })
    if (!mission) return NextResponse.json({ erreur: 'Mission introuvable.' }, { status: 404 })

    const suivi = await chargerSuivi(db, missionId)
    const info = {
      reference: mission.reference,
      nomOperation: mission.nomOperation,
      dateGeneration: new Date(),
    }

    const fichier = await genererSuiviExcel(info, suivi)
    const nom = nomFichierSuivi(info)

    await db.documentGenere.create({
      data: { missionId, type: 'SUIVI_XLSX', nomFichier: nom, empreinte: '' },
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
