import { NextResponse } from 'next/server'
import { contexte } from '../../../../session'
import { deposerPiece, DepotRefuse } from '../../../../../application/pieces/service'

/**
 * Dépôt d'une pièce du dossier — point 10.9.
 *
 * Une route HTTP, et non une action serveur : celles-ci sont plafonnées à un
 * mégaoctet de corps de requête, ce qui ne laisse pas passer un plan. Un
 * fichier par requête, pour que le navigateur puisse les envoyer les uns après
 * les autres et dire lequel a échoué.
 */
export async function POST(
  requete: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: missionId } = await params
  const { db } = await contexte()

  let formulaire: FormData
  try {
    formulaire = await requete.formData()
  } catch {
    return NextResponse.json({ erreur: 'Envoi illisible.' }, { status: 400 })
  }

  const fichier = formulaire.get('fichier')
  if (!(fichier instanceof File)) {
    return NextResponse.json({ erreur: 'Aucun fichier reçu.' }, { status: 400 })
  }

  const texte = (cle: string): string | null => {
    const valeur = formulaire.get(cle)
    return typeof valeur === 'string' && valeur.trim() !== '' ? valeur : null
  }

  try {
    const piece = await deposerPiece(db, missionId, {
      nomFichier: fichier.name,
      donnees: Buffer.from(await fichier.arrayBuffer()),
      categorie: texte('categorie') ?? 'AUTRE',
      libelle: texte('libelle'),
      indice: texte('indice'),
      lotId: texte('lotId'),
      inclureAuDce: formulaire.get('inclureAuDce') !== 'non',
    })
    return NextResponse.json({ piece })
  } catch (erreur) {
    if (erreur instanceof DepotRefuse) {
      return NextResponse.json({ erreur: erreur.message, code: erreur.code }, { status: 400 })
    }
    return NextResponse.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Dépôt impossible.' },
      { status: 500 },
    )
  }
}
