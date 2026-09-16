import type { Metadata } from 'next'
import { Public_Sans, IBM_Plex_Mono } from 'next/font/google'
import Link from 'next/link'
import { sessionCourante } from '../infrastructure/auth'
import { deconnexion } from './connexion/actions'
import './globals.css'

/**
 * Les polices sont téléchargées à la construction et servies par l'application
 * elle-même. Aucune page n'appelle un tiers à l'affichage : l'application porte
 * des noms de clients et des montants, elle n'a pas à signaler chaque
 * consultation à un service extérieur, et elle reste lisible sur un serveur
 * sans accès sortant.
 */
const policeCorps = Public_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
  variable: '--police-corps',
})

const policeMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--police-mono',
})

export const metadata: Metadata = {
  title: 'Missions — économiste de la construction',
  description: 'Chiffrage, DCE et suivi financier des missions d’économiste.',
}

export default async function RacineLayout({ children }: { children: React.ReactNode }) {
  const utilisateur = await sessionCourante()

  return (
    <html lang="fr" className={`${policeCorps.variable} ${policeMono.variable}`}>
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
                <Link href="/trames">Trames</Link>
                <Link href="/normes">Normes</Link>
                <Link href="/entreprises">Entreprises</Link>
                <Link href="/mes-donnees">Mes données</Link>
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
