'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { connexion, initialiser, type EtatConnexion } from './actions'

function BoutonEnvoi({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="bouton bouton-primaire" disabled={pending} style={{ width: '100%', justifyContent: 'center' }}>
      {pending ? 'Un instant…' : libelle}
    </button>
  )
}

export function FormulaireConnexion({ premiereMiseEnService }: { premiereMiseEnService: boolean }) {
  const action = premiereMiseEnService ? initialiser : connexion
  const [etat, envoyer] = useActionState<EtatConnexion, FormData>(action, {})

  return (
    <form action={envoyer} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {etat.erreur ? (
        <p className="message-erreur" role="alert">
          {etat.erreur}
        </p>
      ) : null}

      {premiereMiseEnService ? (
        <div className="champ">
          <label htmlFor="nom">Nom</label>
          <input id="nom" name="nom" type="text" autoComplete="name" />
        </div>
      ) : null}

      <div className="champ">
        <label htmlFor="email">Adresse électronique</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>

      <div className="champ">
        <label htmlFor="motDePasse">Mot de passe</label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete={premiereMiseEnService ? 'new-password' : 'current-password'}
          required
          minLength={premiereMiseEnService ? 12 : undefined}
        />
        {premiereMiseEnService ? (
          <span className="attenue" style={{ fontSize: 12 }}>
            Douze caractères au minimum.
          </span>
        ) : null}
      </div>

      <BoutonEnvoi libelle={premiereMiseEnService ? 'Créer le compte' : 'Se connecter'} />
    </form>
  )
}
