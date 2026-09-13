import { NextResponse } from 'next/server'
import { contexte } from '../../session'
import { construireArchive } from '../../../application/export/archive'

/**
 * Export complet des données — §2.4 de la spécification.
 * Une archive zip, sans format propriétaire, téléchargeable à tout moment.
 */
export async function GET(): Promise<Response> {
  const { db, utilisateur } = await contexte()

  const archive = await construireArchive(db, {
    email: utilisateur.email,
    nom: utilisateur.nom,
  })

  return new NextResponse(new Uint8Array(archive.fichier), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${archive.nom}"`,
      'Content-Length': String(archive.fichier.length),
      'Cache-Control': 'no-store',
    },
  })
}
