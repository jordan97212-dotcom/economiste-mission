import type { Metadata } from 'next'
import Link from 'next/link'
import { sessionCourante } from '../infrastructure/auth'
import { deconnexion } from './connexion/actions'
import './globals.css'

export const metadata: Metadata = {
  title: 'Missions — économiste de la construction',
  description: 'Chiffrage, DCE et suivi financier des missions d’économiste.',
}

export default async function RacineLayout({ children }: { children: React.ReactNode }) {
  const utilisateur = await sessionCourante()

  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        {utilisateur ? (
          <header className="bandeau">
            <div className="bandeau-corps">
              <Link href="/" className="marque">
                Missions
              </Link>
              <nav style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                <Link href="/">Tableau de bord</Link>
                <Link href="/missions/nouvelle">Nouvelle mission</Link>
                <Link href="/base-prix">Base de prix</Link>
              </nav>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="attenue" style={{ fontSize: 13 }}>
                  {utilisateur.nom ?? utilisateur.email}
                </span>
                <form action={deconnexion}>
                  <button type="submit" className="bouton bouton-discret">
                    Se déconnecter
                  </button>
                </form>
              </div>
            </div>
          </header>
        ) : null}
        {children}
      </body>
    </html>
  )
}
