import { NextResponse } from 'next/server'
import { contexte } from '../../../../session'
import { chargerDecompteGeneral } from '../../../../../application/cloture/service'
import {
  genererDecompteGeneral,
  nomFichierDecompte,
} from '../../../../../infrastructure/docx/decompte-general'

/** Téléchargement du projet de décompte général, en Word — §5.7. */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: missionId } = await params
  const { db } = await contexte()

  try {
    const mission = await db.mission.findUnique({
      where: { id: missionId },
      select: { reference: true, nomOperation: true, maitreOuvrage: true },
    })
    if (!mission) return NextResponse.json({ erreur: 'Mission introuvable.' }, { status: 404 })

    const decompte = await chargerDecompteGeneral(db, missionId)
    const info = {
      reference: mission.reference,
      nomOperation: mission.nomOperation,
      maitreOuvrage: mission.maitreOuvrage,
      dateGeneration: new Date(),
    }

    const fichier = await genererDecompteGeneral(info, decompte)
    const nom = nomFichierDecompte(info)

    await db.documentGenere.create({
      data: { missionId, type: 'DECOMPTE_GENERAL_DOCX', nomFichier: nom, empreinte: '' },
    })

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
