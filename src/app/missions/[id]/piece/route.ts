import { NextResponse } from 'next/server'
import { contexte } from '../../../session'
import { MissionIntrouvable } from '../../../../application/chiffrage/service'
import { preparerPiece, verifierMission, type PieceEcrite } from '../../../../application/dce/service'
import {
  genererCctp,
  genererPieceSimple,
  nomFichierPiece,
} from '../../../../infrastructure/docx/pieces-ecrites'
import { convertirEnPdf, ConversionPdfIndisponible } from '../../../../infrastructure/docx/pdf'

const TYPES_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
} as const

function estPiece(valeur: string | null): valeur is PieceEcrite {
  return valeur === 'CCTP' || valeur === 'CCAP' || valeur === 'CCTG' || valeur === 'HONORAIRES'
}

/**
 * Génération d'une pièce écrite.
 *   ?piece=CCTP|CCAP|CCTG   la pièce voulue
 *   ?format=docx|pdf        Word, ou sa conversion PDF
 *   ?forcer=1               produire malgré les anomalies bloquantes
 */
export async function GET(
  requete: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const { db } = await contexte()

  const parametres = new URL(requete.url).searchParams
  const demande = parametres.get('piece')
  if (!estPiece(demande)) {
    return NextResponse.json({ erreur: 'Pièce inconnue.' }, { status: 400 })
  }
  const format = parametres.get('format') === 'pdf' ? 'pdf' : 'docx'
  const forcer = parametres.get('forcer') === '1'

  try {
    // Le contrôle de cohérence tourne avant toute génération de CCTP : une
    // pièce contractuelle incomplète ne doit pas partir par inadvertance.
    if (demande === 'CCTP' && !forcer) {
      const synthese = await verifierMission(db, id)
      if (!synthese.exportPossible) {
        return NextResponse.json(
          {
            erreur: 'Anomalies bloquantes',
            nbBloquantes: synthese.nbBloquantes,
            detail: synthese.anomalies.filter((a) => a.severite === 'bloquante').slice(0, 20),
          },
          { status: 409 },
        )
      }
    }

    const preparation = await preparerPiece(db, id, demande)

    const docx =
      demande === 'CCTP'
        ? await genererCctp(preparation.chiffrage, preparation.textes, preparation.contenu)
        : await genererPieceSimple(preparation.chiffrage, demande, preparation.contenu ?? '')

    const nom = nomFichierPiece(preparation.chiffrage, demande, format)
    const fichier = format === 'pdf' ? await convertirEnPdf(docx, nom.replace(/\.pdf$/, '')) : docx

    await db.documentGenere.create({
      data: {
        missionId: id,
        type: `${demande}_${format.toUpperCase()}`,
        nomFichier: nom,
        empreinte: '',
      },
    })

    return new NextResponse(new Uint8Array(fichier), {
      headers: {
        'Content-Type': TYPES_MIME[format],
        'Content-Disposition': `attachment; filename="${nom}"`,
        'Content-Length': String(fichier.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (erreur) {
    if (erreur instanceof MissionIntrouvable) {
      return NextResponse.json({ erreur: 'Mission introuvable.' }, { status: 404 })
    }
    if (erreur instanceof ConversionPdfIndisponible) {
      return NextResponse.json({ erreur: erreur.message }, { status: 503 })
    }
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Génération impossible.' },
      { status: 400 },
    )
  }
}
