'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import type { MissionDTO } from '../application/dto'
import type { EtatFormulaire } from '../app/missions/actions'
import {
  LIBELLES_STATUT,
  LIBELLES_TYPE_OUVRAGE,
  LIBELLES_NATURE,
  LIBELLES_MARCHE,
  LIBELLES_FACTURATION,
  PHASES,
} from '../lib/format'

type Action = (precedent: EtatFormulaire, donnees: FormData) => Promise<EtatFormulaire>

function BoutonEnvoi({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="bouton bouton-primaire" disabled={pending}>
      {pending ? 'Enregistrement…' : libelle}
    </button>
  )
}

function euros(centimes: string | null): string {
  if (!centimes) return ''
  const negatif = centimes.startsWith('-')
  const absolu = (negatif ? centimes.slice(1) : centimes).padStart(3, '0')
  const entier = absolu.slice(0, -2)
  const decimales = absolu.slice(-2)
  return `${negatif ? '-' : ''}${entier},${decimales}`
}

export function FormulaireMission({
  action,
  mission,
  referenceProposee,
  libelleEnvoi,
}: {
  action: Action
  mission?: MissionDTO
  referenceProposee?: string
  libelleEnvoi: string
}) {
  const [etat, envoyer] = useActionState<EtatFormulaire, FormData>(action, {})
  const phasesRetenues = new Set(mission?.phasesContractuelles ?? ['APD', 'PRO', 'DCE'])

  return (
    <form action={envoyer} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {mission ? <input type="hidden" name="id" value={mission.id} /> : null}

      {etat.erreur ? (
        <p className="message-erreur" role="alert">
          {etat.erreur}
        </p>
      ) : null}

      <section className="carte">
        <div className="carte-entete">
          <h2>Identification</h2>
        </div>
        <div className="carte-corps">
          <div className="grille-champs">
            <div className="champ">
              <label htmlFor="reference">Référence</label>
              <input
                id="reference"
                name="reference"
                type="text"
                defaultValue={mission?.reference ?? referenceProposee ?? ''}
                className="mono"
              />
            </div>
            <div className="champ" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="nomOperation">Nom de l’opération</label>
              <input
                id="nomOperation"
                name="nomOperation"
                type="text"
                required
                defaultValue={mission?.nomOperation ?? ''}
              />
            </div>
            <div className="champ">
              <label htmlFor="maitreOuvrage">Maître d’ouvrage</label>
              <input id="maitreOuvrage" name="maitreOuvrage" type="text" defaultValue={mission?.maitreOuvrage ?? ''} />
            </div>
            <div className="champ">
              <label htmlFor="maitreOeuvre">Maître d’œuvre</label>
              <input id="maitreOeuvre" name="maitreOeuvre" type="text" defaultValue={mission?.maitreOeuvre ?? ''} />
            </div>
            <div className="champ">
              <label htmlFor="typeOuvrage">Type d’ouvrage</label>
              <select id="typeOuvrage" name="typeOuvrage" defaultValue={mission?.typeOuvrage ?? 'LOGEMENT_COLLECTIF'}>
                {Object.entries(LIBELLES_TYPE_OUVRAGE).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="nature">Nature</label>
              <select id="nature" name="nature" defaultValue={mission?.nature ?? 'CONSTRUCTION_NEUVE'}>
                {Object.entries(LIBELLES_NATURE).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="typeMarche">Type de marché</label>
              <select id="typeMarche" name="typeMarche" defaultValue={mission?.typeMarche ?? 'PUBLIC'}>
                {Object.entries(LIBELLES_MARCHE).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="statut">Statut</label>
              <select id="statut" name="statut" defaultValue={mission?.statut ?? 'PROSPECT'}>
                {Object.entries(LIBELLES_STATUT).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="carte">
        <div className="carte-entete">
          <h2>Ouvrage et budget</h2>
          <span className="attenue" style={{ fontSize: 13 }}>
            Les surfaces servent au calcul du ratio au mètre carré.
          </span>
        </div>
        <div className="carte-corps">
          <div className="grille-champs">
            <div className="champ">
              <label htmlFor="surfaceShon">Surface SHON (m²)</label>
              <input id="surfaceShon" name="surfaceShon" type="text" inputMode="decimal" className="mono" defaultValue={mission?.surfaceShon ?? ''} />
            </div>
            <div className="champ">
              <label htmlFor="surfaceUtile">Surface utile (m²)</label>
              <input id="surfaceUtile" name="surfaceUtile" type="text" inputMode="decimal" className="mono" defaultValue={mission?.surfaceUtile ?? ''} />
            </div>
            <div className="champ">
              <label htmlFor="budgetPrevisionnelHt">Budget prévisionnel HT (€)</label>
              <input
                id="budgetPrevisionnelHt"
                name="budgetPrevisionnelHt"
                type="text"
                inputMode="decimal"
                className="mono"
                defaultValue={euros(mission?.budgetPrevisionnelHt ?? null)}
              />
            </div>
            <div className="champ">
              <label htmlFor="dateDebut">Date de début</label>
              <input id="dateDebut" name="dateDebut" type="date" defaultValue={mission?.dateDebut?.slice(0, 10) ?? ''} />
            </div>
            <div className="champ">
              <label htmlFor="dateFinPrevue">Fin prévue</label>
              <input id="dateFinPrevue" name="dateFinPrevue" type="date" defaultValue={mission?.dateFinPrevue?.slice(0, 10) ?? ''} />
            </div>
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: '20px 0 0' }}>
            <legend className="surtitre" style={{ padding: 0, marginBottom: 8 }}>
              Phases contractuelles
            </legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {PHASES.map((phase) => (
                <label
                  key={phase}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}
                >
                  <input
                    type="checkbox"
                    name="phasesContractuelles"
                    value={phase}
                    defaultChecked={phasesRetenues.has(phase)}
                    style={{ width: 'auto' }}
                  />
                  <span className="mono">{phase}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section className="carte">
        <div className="carte-entete">
          <h2>Ajustement local et honoraires</h2>
          <span className="etiquette etiquette-accent">Cœur du chiffrage</span>
        </div>
        <div className="carte-corps">
          <p className="attenue" style={{ fontSize: 13.5, marginTop: 0, marginBottom: 16, maxWidth: '68ch' }}>
            Le coefficient d’ajustement local s’applique à toutes les lignes de la mission. Il reste
            surchargeable lot par lot et ligne par ligne. La précision du prix unitaire fixe à la fois
            l’affichage et le calcul : le prix est arrondi à cette précision avant d’être multiplié par
            la quantité, pour que votre total soit celui que l’entreprise retrouve.
          </p>
          <div className="grille-champs">
            <div className="champ">
              <label htmlFor="coefficientLocalDefaut">Coefficient local</label>
              <input
                id="coefficientLocalDefaut"
                name="coefficientLocalDefaut"
                type="text"
                inputMode="decimal"
                className="mono"
                defaultValue={mission?.coefficientLocalDefaut ?? '1.25'}
              />
            </div>
            <div className="champ">
              <label htmlFor="precisionPu">Décimales du prix unitaire</label>
              <select id="precisionPu" name="precisionPu" defaultValue={String(mission?.precisionPu ?? 2)}>
                <option value="2">2 — usage courant</option>
                <option value="3">3</option>
                <option value="4">4 — prix faibles, quantités fortes</option>
              </select>
            </div>
            <div className="champ">
              <label htmlFor="tauxTva">Taux de TVA (%)</label>
              <input id="tauxTva" name="tauxTva" type="text" inputMode="decimal" className="mono" defaultValue={mission?.tauxTva ?? '8.50'} />
            </div>
            <div className="champ">
              <label htmlFor="seuilDerivePourcent">Seuil d’alerte de dérive (%)</label>
              <input
                id="seuilDerivePourcent"
                name="seuilDerivePourcent"
                type="text"
                inputMode="decimal"
                className="mono"
                defaultValue={mission?.seuilDerivePourcent ?? '5.00'}
              />
            </div>
            <div className="champ">
              <label htmlFor="honorairesMissionHt">Honoraires HT (€)</label>
              <input
                id="honorairesMissionHt"
                name="honorairesMissionHt"
                type="text"
                inputMode="decimal"
                className="mono"
                defaultValue={euros(mission?.honorairesMissionHt ?? null)}
              />
            </div>
            <div className="champ">
              <label htmlFor="modeFacturation">Mode de facturation</label>
              <select id="modeFacturation" name="modeFacturation" defaultValue={mission?.modeFacturation ?? ''}>
                <option value="">Non précisé</option>
                {Object.entries(LIBELLES_FACTURATION).map(([cle, libelle]) => (
                  <option key={cle} value={cle}>
                    {libelle}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 10 }}>
        <BoutonEnvoi libelle={libelleEnvoi} />
        <Link href={mission ? `/missions/${mission.id}` : '/'} className="bouton">
          Annuler
        </Link>
      </div>
    </form>
  )
}
