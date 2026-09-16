import { NextResponse } from 'next/server'
import { contexte } from '../../../../../session'
import { genererDocumentRapport } from '../../../../../../application/offres/rapport'

/** Téléchargement du rapport d'analyse des offres, en Word. */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ id: string; lotId: string }> },
): Promise<Response> {
  const { id: missionId, lotId } = await params
  const { db } = await contexte()

  try {
    const { fichier, nom } = await genererDocumentRapport(db, missionId, lotId)

    return new NextResponse(new Uint8Array(fichier), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${nom}"`,
        'Content-Length': String(fichier.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (erreur) {
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Génération impossible.' },
      { status: 400 },
    )
  }
}
