import { NextResponse } from 'next/server'
import { contexte } from '../../../session'
import { chargerChiffrage, MissionIntrouvable } from '../../../../application/chiffrage/service'
import {
  genererDpgfExcel,
  nomFichierDpgf,
  type VarianteDpgf,
} from '../../../../infrastructure/excel/dpgf-export'

const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Export Excel du DPGF. Deux variantes :
 *   ?variante=avec-prix   le bordereau chiffré
 *   ?variante=a-remplir   la version entreprise, prix vides et feuille protégée
 */
export async function GET(
  requete: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const { db } = await contexte()

  const demande = new URL(requete.url).searchParams.get('variante')
  const variante: VarianteDpgf = demande === 'a-remplir' ? 'a-remplir' : 'avec-prix'

  let chiffrage
  try {
    chiffrage = await chargerChiffrage(db, id)
  } catch (erreur) {
    if (erreur instanceof MissionIntrouvable) {
      return NextResponse.json({ erreur: 'Mission introuvable.' }, { status: 404 })
    }
    throw erreur
  }

  const classeur = await genererDpgfExcel(chiffrage, { variante })
  const nom = nomFichierDpgf(chiffrage, variante)

  await db.documentGenere.create({
    data: {
      missionId: id,
      type: variante === 'a-remplir' ? 'DPGF_ENTREPRISE_XLSX' : 'DPGF_XLSX',
      nomFichier: nom,
      empreinte: '',
    },
  })

  return new NextResponse(new Uint8Array(classeur), {
    headers: {
      'Content-Type': TYPE_XLSX,
      'Content-Disposition': `attachment; filename="${nom}"`,
      'Content-Length': String(classeur.length),
      'Cache-Control': 'no-store',
    },
  })
}
