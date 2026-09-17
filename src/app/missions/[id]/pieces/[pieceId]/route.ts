import { NextResponse } from 'next/server'
import { contexte } from '../../../../session'
import { lirePiece, PieceIntrouvable } from '../../../../../application/pieces/service'

/**
 * Téléchargement d'une pièce déposée.
 *
 * Toujours en pièce jointe, jamais affichée dans la page : un fichier venu de
 * l'extérieur ne doit pas pouvoir s'exécuter dans l'origine de l'application.
 * Le type servi est déduit de l'extension par le service, pas repris de ce que
 * le navigateur avait annoncé au dépôt.
 */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ id: string; pieceId: string }> },
): Promise<Response> {
  const { id: missionId, pieceId } = await params
  const { db } = await contexte()

  try {
    const { piece, donnees } = await lirePiece(db, missionId, pieceId)
    const nom = piece.nomFichier.replace(/["\r\n]/g, '')

    return new NextResponse(new Uint8Array(donnees), {
      headers: {
        'Content-Type': piece.typeMime,
        'Content-Disposition': `attachment; filename="${nom}"`,
        'Content-Length': String(donnees.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    })
  } catch (erreur) {
    if (erreur instanceof PieceIntrouvable) {
      return NextResponse.json({ erreur: 'Pièce introuvable.' }, { status: 404 })
    }
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Lecture impossible.' },
      { status: 500 },
    )
  }
}
