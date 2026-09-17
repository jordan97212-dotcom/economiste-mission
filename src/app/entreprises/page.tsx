import Link from 'next/link'
import { contexte } from '../session'
import { listerEntreprises } from '../../application/entreprises/service'
import { Repertoire } from './repertoire'

export default async function PageEntreprises() {
  const { db } = await contexte()
  const entreprises = await listerEntreprises(db)

  return (
    <main className="contenu" style={{ maxWidth: 1200 }}>
      <div style={{ marginBottom: 22 }}>
        <p className="surtitre">Consultation des entreprises</p>
        <h1>Répertoire des entreprises</h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '74ch' }}>
          Le carnet d’adresses transversal à toutes vos missions. Une entreprise consultée sur une
          opération le sera souvent sur la suivante.
        </p>
        <Link href="/entreprises/import" className="bouton" style={{ marginTop: 12 }}>
          Importer depuis un fichier CSV
        </Link>
      </div>

      <Repertoire entreprises={entreprises} />
    </main>
  )
}
