'use client'

import { useActionState, useState } from 'react'
import type { EntrepriseDTO } from '../../application/entreprises/service'
import {
  actionCreerEntreprise,
  actionModifierEntreprise,
  actionSupprimerEntreprise,
  type EtatEntreprise,
} from './actions'

/** Répertoire des entreprises — SPEC_APP_ECONOMISTE.md §3 et §5.5. */
export function Repertoire({ entreprises }: { entreprises: readonly EntrepriseDTO[] }) {
  const [enEdition, setEnEdition] = useState<string | null>(null)
  const [etatAjout, ajouter] = useActionState<EtatEntreprise, FormData>(actionCreerEntreprise, {})

  return (
    <>
      <section className="carte" style={{ marginBottom: 22 }}>
        <div className="carte-entete">
          <h2>Ajouter une entreprise</h2>
        </div>
        <form action={ajouter} className="carte-corps">
          <div className="grille-champs">
            <div className="champ">
              <label htmlFor="raisonSociale">Raison sociale</label>
              <input id="raisonSociale" name="raisonSociale" required placeholder="Bâti Antilles SARL" />
            </div>
            <div className="champ">
              <label htmlFor="siret">SIRET</label>
              <input id="siret" name="siret" className="mono" placeholder="123 456 789 00012" />
            </div>
            <div className="champ">
              <label htmlFor="contactNom">Contact</label>
              <input id="contactNom" name="contactNom" placeholder="Nom du contact" />
            </div>
            <div className="champ">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" placeholder="contact@entreprise.fr" />
            </div>
            <div className="champ">
              <label htmlFor="telephone">Téléphone</label>
              <input id="telephone" name="telephone" placeholder="0596 00 00 00" />
            </div>
            <div className="champ">
              <label htmlFor="zoneIntervention">Zone d’intervention</label>
              <input id="zoneIntervention" name="zoneIntervention" placeholder="Martinique" />
            </div>
            <div className="champ">
              <label htmlFor="corpsEtatQualifies">Corps d’état qualifiés</label>
              <input id="corpsEtatQualifies" name="corpsEtatQualifies" placeholder="02, 13, 17 (séparés par des virgules)" />
            </div>
          </div>
          <div className="champ" style={{ marginTop: 12 }}>
            <label htmlFor="historiqueNotes">Notes</label>
            <input id="historiqueNotes" name="historiqueNotes" placeholder="Délais tenus, qualité d’exécution…" />
          </div>

          {etatAjout.erreur ? (
            <p className="message-erreur" style={{ marginTop: 12 }} role="alert">
              {etatAjout.erreur}
            </p>
          ) : null}

          <div style={{ marginTop: 14 }}>
            <button type="submit" className="bouton bouton-primaire">
              Ajouter au répertoire
            </button>
          </div>
        </form>
      </section>

      <section className="carte">
        <div className="carte-entete">
          <h2>Répertoire</h2>
          <span className="attenue" style={{ fontSize: 13 }}>
            {entreprises.length} entreprise(s)
          </span>
        </div>

        {entreprises.length === 0 ? (
          <p className="vide">Aucune entreprise pour l’instant. Ajoutez-en une ci-dessus.</p>
        ) : (
          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Raison sociale</th>
                  <th>Contact</th>
                  <th>Corps d’état</th>
                  <th>Zone</th>
                  <th>Consultations</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entreprises.map((entreprise) =>
                  enEdition === entreprise.id ? (
                    <LigneEdition key={entreprise.id} entreprise={entreprise} onFin={() => setEnEdition(null)} />
                  ) : (
                    <LigneLecture
                      key={entreprise.id}
                      entreprise={entreprise}
                      onEditer={() => setEnEdition(entreprise.id)}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function LigneLecture({
  entreprise,
  onEditer,
}: {
  entreprise: EntrepriseDTO
  onEditer: () => void
}) {
  const [, supprimer] = useActionState<EtatEntreprise, FormData>(actionSupprimerEntreprise, {})

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>
        {entreprise.raisonSociale}
        {entreprise.historiqueNotes ? (
          <div className="attenue" style={{ fontSize: 12, fontWeight: 400 }}>{entreprise.historiqueNotes}</div>
        ) : null}
      </td>
      <td style={{ fontSize: 13.5 }}>
        {entreprise.contactNom ?? <span className="attenue">—</span>}
        {entreprise.email ? <div className="attenue" style={{ fontSize: 12 }}>{entreprise.email}</div> : null}
        {entreprise.telephone ? <div className="attenue" style={{ fontSize: 12 }}>{entreprise.telephone}</div> : null}
      </td>
      <td className="mono attenue" style={{ fontSize: 12.5 }}>
        {entreprise.corpsEtatQualifies.length > 0 ? entreprise.corpsEtatQualifies.join(', ') : '—'}
      </td>
      <td className="attenue" style={{ fontSize: 13 }}>{entreprise.zoneIntervention ?? '—'}</td>
      <td className="chiffre">{entreprise.nbConsultations}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button type="button" className="bouton bouton-discret" onClick={onEditer}>
          Modifier
        </button>
        <form action={supprimer} style={{ display: 'inline' }}>
          <input type="hidden" name="id" value={entreprise.id} />
          <button type="submit" className="bouton bouton-danger">
            Retirer
          </button>
        </form>
      </td>
    </tr>
  )
}

function LigneEdition({ entreprise, onFin }: { entreprise: EntrepriseDTO; onFin: () => void }) {
  const [etat, modifier] = useActionState<EtatEntreprise, FormData>(actionModifierEntreprise, {})

  if (etat.succes) onFin()

  return (
    <tr>
      <td colSpan={6}>
        <form action={modifier} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '6px 0' }}>
          <input type="hidden" name="id" value={entreprise.id} />
          <div className="champ" style={{ minWidth: 180 }}>
            <label htmlFor={`rs-${entreprise.id}`}>Raison sociale</label>
            <input id={`rs-${entreprise.id}`} name="raisonSociale" defaultValue={entreprise.raisonSociale} required />
          </div>
          <div className="champ" style={{ minWidth: 160 }}>
            <label htmlFor={`ct-${entreprise.id}`}>Contact</label>
            <input id={`ct-${entreprise.id}`} name="contactNom" defaultValue={entreprise.contactNom ?? ''} />
          </div>
          <div className="champ" style={{ minWidth: 180 }}>
            <label htmlFor={`em-${entreprise.id}`}>E-mail</label>
            <input id={`em-${entreprise.id}`} name="email" type="email" defaultValue={entreprise.email ?? ''} />
          </div>
          <div className="champ" style={{ minWidth: 140 }}>
            <label htmlFor={`tel-${entreprise.id}`}>Téléphone</label>
            <input id={`tel-${entreprise.id}`} name="telephone" defaultValue={entreprise.telephone ?? ''} />
          </div>
          <div className="champ" style={{ minWidth: 140 }}>
            <label htmlFor={`zone-${entreprise.id}`}>Zone</label>
            <input id={`zone-${entreprise.id}`} name="zoneIntervention" defaultValue={entreprise.zoneIntervention ?? ''} />
          </div>
          <div className="champ" style={{ minWidth: 160 }}>
            <label htmlFor={`corps-${entreprise.id}`}>Corps d’état</label>
            <input id={`corps-${entreprise.id}`} name="corpsEtatQualifies" defaultValue={entreprise.corpsEtatQualifies.join(', ')} />
          </div>
          <div className="champ" style={{ minWidth: 200, flex: 1 }}>
            <label htmlFor={`notes-${entreprise.id}`}>Notes</label>
            <input id={`notes-${entreprise.id}`} name="historiqueNotes" defaultValue={entreprise.historiqueNotes ?? ''} />
          </div>
          <button type="submit" className="bouton bouton-primaire">Enregistrer</button>
          <button type="button" className="bouton bouton-discret" onClick={onFin}>Annuler</button>
        </form>
        {etat.erreur ? <p className="message-erreur" role="alert">{etat.erreur}</p> : null}
      </td>
    </tr>
  )
}
