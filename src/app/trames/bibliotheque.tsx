'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { analyserTexte, listerVariables } from '../../domain/texte/structure'
import { actionCreerTrame, actionModifierTrame, type EtatTrame } from './actions'

export interface TrameListee {
  readonly id: string
  readonly type: string
  readonly intitule: string
  readonly corpsEtatId: string | null
  readonly corpsEtat: string | null
  readonly contenu: string
}

const LIBELLES_TYPE: Record<string, string> = {
  CCTP: 'CCTP',
  CCAP: 'CCAP',
  CCTG: 'CCTG',
  HONORAIRES: 'Honoraires',
}

const AIDE_TYPE: Record<string, string> = {
  CCTP: 'Par corps d’état, ou sans corps d’état pour les généralités placées en tête du document.',
  CCAP: 'Une seule trame vaut pour toutes vos opérations. Les variables sont résolues à la génération.',
  CCTG: 'Clauses techniques générales, communes à vos opérations.',
  HONORAIRES: 'Modèle de proposition d’honoraires.',
}

function BoutonEnvoi({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="bouton bouton-primaire" disabled={pending}>
      {pending ? 'Enregistrement…' : libelle}
    </button>
  )
}

export function Bibliotheque({
  trames,
  corpsEtats,
  variables,
}: {
  trames: readonly TrameListee[]
  corpsEtats: readonly { id: string; code: string; libelle: string }[]
  variables: readonly string[]
}) {
  const [selection, setSelection] = useState<string | null>(null)
  const trameEditee = trames.find((trame) => trame.id === selection) ?? null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
      <section className="carte">
        <div className="carte-entete">
          <h2>{trameEditee ? 'Modifier la trame' : 'Nouvelle trame'}</h2>
          {trameEditee ? (
            <button type="button" className="bouton bouton-discret" onClick={() => setSelection(null)}>
              Créer une nouvelle trame
            </button>
          ) : null}
        </div>
        <div className="carte-corps">
          <FormulaireTrame
            key={trameEditee?.id ?? 'nouvelle'}
            trame={trameEditee}
            corpsEtats={corpsEtats}
            variables={variables}
            onEnregistre={() => setSelection(null)}
          />
        </div>
      </section>

      <section className="carte">
        <div className="carte-entete">
          <h2>Trames enregistrées</h2>
          <span className="etiquette">{trames.length}</span>
        </div>
        {trames.length === 0 ? (
          <p className="vide">
            Aucune trame. Commencez par une trame de CCTP sur un corps d’état que vous retrouvez
            souvent, puis une trame de CCAP.
          </p>
        ) : (
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {trames.map((trame) => (
              <button
                key={trame.id}
                type="button"
                className={`redaction-item${selection === trame.id ? ' actif' : ''}`}
                onClick={() => setSelection(trame.id)}
              >
                <span className="redaction-titre">
                  <span className="etiquette" style={{ marginRight: 8 }}>
                    {LIBELLES_TYPE[trame.type] ?? trame.type}
                  </span>
                  {trame.intitule}
                  {trame.corpsEtat ? (
                    <span className="attenue" style={{ fontSize: 12 }}>
                      {' '}
                      · {trame.corpsEtat}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function FormulaireTrame({
  trame,
  corpsEtats,
  variables,
  onEnregistre,
}: {
  trame: TrameListee | null
  corpsEtats: readonly { id: string; code: string; libelle: string }[]
  variables: readonly string[]
  onEnregistre: () => void
}) {
  const [etat, envoyer] = useActionState<EtatTrame, FormData>(
    trame ? actionModifierTrame : actionCreerTrame,
    {},
  )
  const [type, setType] = useState(trame?.type ?? 'CCTP')
  const [contenu, setContenu] = useState(trame?.contenu ?? '')

  const blocs = useMemo(() => analyserTexte(contenu), [contenu])
  const variablesUtilisees = useMemo(() => listerVariables(contenu), [contenu])
  const inconnues = variablesUtilisees.filter((nom) => !variables.includes(nom))

  return (
    <form
      action={(donnees) => {
        envoyer(donnees)
        if (trame) onEnregistre()
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {trame ? <input type="hidden" name="id" value={trame.id} /> : null}

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
          <label htmlFor="t-type">Pièce</label>
          <select
            id="t-type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={trame !== null}
          >
            {Object.entries(LIBELLES_TYPE).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </div>

        {type === 'CCTP' ? (
          <div className="champ">
            <label htmlFor="t-corps">Corps d’état</label>
            <select id="t-corps" name="corpsEtatId" defaultValue={trame?.corpsEtatId ?? ''}>
              <option value="">Généralités, tous lots</option>
              {corpsEtats.map((corps) => (
                <option key={corps.id} value={corps.id}>
                  {corps.code} · {corps.libelle}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="champ" style={{ gridColumn: 'span 2' }}>
          <label htmlFor="t-intitule">Intitulé</label>
          <input
            id="t-intitule"
            name="intitule"
            type="text"
            required
            defaultValue={trame?.intitule ?? ''}
            placeholder="Béton armé — prescriptions générales"
          />
        </div>
      </div>

      <p className="attenue" style={{ fontSize: 13, margin: 0 }}>
        {AIDE_TYPE[type]}
      </p>

      <div className="champ">
        <label htmlFor="t-contenu">Texte</label>
        <textarea
          id="t-contenu"
          name="contenu"
          rows={14}
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          spellCheck
          style={{ fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }}
          placeholder={'## Origine et qualité\nLes matériaux seront conformes à…\n- première exigence'}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="attenue" style={{ fontSize: 12.5 }}>
          {blocs.length} bloc(s) de texte
          {variablesUtilisees.length > 0
            ? ` · variables : ${variablesUtilisees.map((v) => `{{${v}}}`).join(' ')}`
            : ''}
        </span>
      </div>

      {inconnues.length > 0 ? (
        <p className="etiquette etiquette-alerte" style={{ alignSelf: 'flex-start' }}>
          Variables inconnues : {inconnues.map((v) => `{{${v}}}`).join(' ')}
        </p>
      ) : null}

      <div>
        <BoutonEnvoi libelle={trame ? 'Enregistrer les modifications' : 'Créer la trame'} />
      </div>
    </form>
  )
}
