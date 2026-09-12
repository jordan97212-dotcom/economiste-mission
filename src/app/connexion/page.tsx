import { redirect } from 'next/navigation'
import { prisma } from '../../infrastructure/prisma'
import { sessionCourante } from '../../infrastructure/auth'
import { FormulaireConnexion } from './formulaire'

export default async function PageConnexion() {
  const utilisateur = await sessionCourante()
  if (utilisateur) redirect('/')

  const comptes = await prisma.user.count({ where: { motDePasse: { not: null } } })
  const premiereMiseEnService = comptes === 0

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '40px 20px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <p className="surtitre" style={{ marginBottom: 10 }}>
          Économiste de la construction
        </p>
        <h1 style={{ marginBottom: 6 }}>
          {premiereMiseEnService ? 'Créer votre compte' : 'Missions'}
        </h1>
        <p className="attenue" style={{ fontSize: 14, marginBottom: 24 }}>
          {premiereMiseEnService
            ? 'Aucun compte n’existe encore sur cette installation. Celui-ci sera le vôtre.'
            : 'Chiffrage, pièces écrites et suivi financier de vos opérations.'}
        </p>

        <div className="carte">
          <div className="carte-corps">
            <FormulaireConnexion premiereMiseEnService={premiereMiseEnService} />
          </div>
        </div>

        <p className="attenue" style={{ fontSize: 12.5, marginTop: 18, lineHeight: 1.5 }}>
          Cette application contient des informations clients et des montants financiers. La session
          expire au bout de trente jours et reste révocable depuis le serveur.
        </p>
      </div>
    </main>
  )
}
