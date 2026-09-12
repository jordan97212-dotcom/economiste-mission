'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { actionCreerPrix, type EtatPrix } from './actions'
import { UNITES, LIBELLES_UNITE, LIBELLES_TYPE_OUVRAGE, LIBELLES_NATURE } from '../../lib/format'

function BoutonEnvoi() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="bouton bouton-primaire" disabled={pending}>
      {pending ? 'Enregistrement…' : 'Ajouter à ma base'}
    </button>
  )
}

export function FormulairePrix({
  corpsEtats,
}: {
  corpsEtats: readonly { id: string; code: string; libelle: string }[]
}) {
  const [etat, envoyer] = useActionState<EtatPrix, FormData>(actionCreerPrix, {})

  return (
    <form action={envoyer} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {etat.erreur ? (
        <p className="message-erreur" role="alert">
          {etat.erreur}
        </p>
      ) : null}
      {etat.succes ? (
        <p style={{ color: 'var(--color-accent-encre)', fontWeight: 500, margin: 0 }} role="status">
          {etat.succes}
        </p>
      ) : null}

      <div className="grille-champs">
        <div className="champ">
          <label htmlFor="p-code">Code</label>
          <input id="p-code" name="code" type="text" className="mono" placeholder="02.03.01" />
        </div>
        <div className="champ" style={{ gridColumn: 'span 2' }}>
          <label htmlFor="p-designation">Désignation</label>
          <input id="p-designation" name="designation" type="text" required placeholder="Béton armé pour voiles" />
        </div>
        <div className="champ">
          <label htmlFor="p-unite">Unité</label>
          <select id="p-unite" name="unite" defaultValue="M3">
            {UNITES.map((unite) => (
              <option key={unite} value={unite}>
                {LIBELLES_UNITE[unite]}
              </option>
            ))}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="p-prix">Prix unitaire HT (€)</label>
          <input id="p-prix" name="prixUnitaireHt" type="text" inputMode="decimal" required className="mono" placeholder="285,43" />
        </div>
        <div className="champ">
          <label htmlFor="p-date">Date du relevé</label>
          <input id="p-date" name="dateReleve" type="date" />
        </div>
        <div className="champ">
          <label htmlFor="p-corps">Corps d’état</label>
          <select id="p-corps" name="corpsEtatId" defaultValue="">
            <option value="">—</option>
            {corpsEtats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="p-zone">Zone</label>
          <select id="p-zone" name="zone" defaultValue="MARTINIQUE">
            <option value="MARTINIQUE">Martinique</option>
            <option value="METROPOLE">Métropole</option>
            <option value="AUTRE">Autre</option>
          </select>
        </div>
        <div className="champ">
          <label htmlFor="p-type">Contexte — type d’ouvrage</label>
          <select id="p-type" name="contexteTypeOuvrage" defaultValue="">
            <option value="">—</option>
            {Object.entries(LIBELLES_TYPE_OUVRAGE).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="p-nature">Contexte — nature</label>
          <select id="p-nature" name="contexteNature" defaultValue="">
            <option value="">—</option>
            {Object.entries(LIBELLES_NATURE).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <BoutonEnvoi />
      </div>
    </form>
  )
}
