import { NextResponse } from 'next/server'
import { contexte } from '../../../../../session'
import { assemblerDossier, DossierImpossible } from '../../../../../../application/dce/dossier'

/**
 * Dossier de consultation d'un lot, en archive ZIP.
 *   ?forcer=1   constituer malgré les anomalies bloquantes
 */
export async function GET(
  requete: Request,
  { params }: { params: Promise<{ id: string; lotId: string }> },
): Promise<Response> {
  const { id: missionId, lotId } = await params
  const { db } = await contexte()
  const forcer = new URL(requete.url).searchParams.get('forcer') === '1'

  try {
    const dossier = await assemblerDossier(db, missionId, { lotId, forcer })

    await db.documentGenere.create({
      data: {
        missionId,
        type: 'DOSSIER_CONSULTATION_ZIP',
        nomFichier: dossier.nomFichier,
        empreinte: '',
      },
    })

    return new NextResponse(new Uint8Array(dossier.archive), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${dossier.nomFichier}"`,
        'Content-Length': String(dossier.archive.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (erreur) {
    if (erreur instanceof DossierImpossible) {
      return NextResponse.json({ erreur: erreur.message, detail: erreur.detail }, { status: 409 })
    }
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Dossier impossible.' },
      { status: 400 },
    )
  }
}
