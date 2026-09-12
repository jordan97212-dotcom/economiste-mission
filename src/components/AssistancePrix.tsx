'use client'

import { useEffect, useRef } from 'react'
import type { PropositionPrixDTO } from '../app/missions/actions-prix'
import { formaterPrixUnitaire, formaterDate, LIBELLES_UNITE, LIBELLES_TYPE_OUVRAGE } from '../lib/format'

/**
 * Propositions de prix venues de la base personnelle — §5.3.
 *
 * Le panneau montre d'où vient chaque prix, de quand il date, combien de
 * relevés le soutiennent et comment ils se dispersent. Rien ne s'applique tant
 * que l'économiste n'a pas choisi : la responsabilité du chiffrage reste la
 * sienne.
 */
export function AssistancePrix({
  propositions,
  position,
  precision,
  chargement,
  onChoisir,
  onFermer,
}: {
  propositions: readonly PropositionPrixDTO[]
  position: { haut: number; gauche: number }
  precision: number
  chargement: boolean
  onChoisir: (proposition: PropositionPrixDTO) => void
  onFermer: () => void
}) {
  const panneau = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent): void => {
      if (evenement.key === 'Escape') onFermer()
    }
    const surClic = (evenement: MouseEvent): void => {
      if (panneau.current && !panneau.current.contains(evenement.target as Node)) onFermer()
    }
    document.addEventListener('keydown', surTouche)
    document.addEventListener('mousedown', surClic)
    return () => {
      document.removeEventListener('keydown', surTouche)
      document.removeEventListener('mousedown', surClic)
    }
  }, [onFermer])

  if (!chargement && propositions.length === 0) return null

  return (
    <div
      ref={panneau}
      className="assistance"
      style={{ top: position.haut, left: position.gauche }}
      role="listbox"
      aria-label="Propositions de prix"
    >
      <div className="assistance-entete">
        <span className="surtitre">Ma base de prix</span>
        {chargement ? <span className="attenue" style={{ fontSize: 11 }}>recherche…</span> : null}
      </div>

      {propositions.map((proposition, index) => (
        <button
          key={`${proposition.code ?? proposition.designation}-${index}`}
          type="button"
          className="assistance-ligne"
          onClick={() => onChoisir(proposition)}
        >
          <div className="assistance-titre">
            <span>{proposition.designation}</span>
            <span className="mono assistance-prix">
              {formaterPrixUnitaire(proposition.prixUnitaireHt, precision, true)}
            </span>
          </div>

          <div className="assistance-details">
            {proposition.code ? <span className="mono">{proposition.code}</span> : null}
            <span>{LIBELLES_UNITE[proposition.unite] ?? proposition.unite}</span>
            <span>{formaterDate(proposition.dateReleve)}</span>
            {proposition.contexteTypeOuvrage ? (
              <span>
                {LIBELLES_TYPE_OUVRAGE[proposition.contexteTypeOuvrage] ??
                  proposition.contexteTypeOuvrage}
              </span>
            ) : null}
          </div>

          <div className="assistance-details">
            <span className={proposition.fiable ? 'etiquette' : 'etiquette etiquette-alerte'}>
              {proposition.nbReferences} relevé{proposition.nbReferences > 1 ? 's' : ''}
              {proposition.fiable ? '' : ' · historique mince'}
            </span>
            {proposition.dispersion ? (
              <span className="mono" style={{ fontSize: 11 }}>
                {formaterPrixUnitaire(proposition.dispersion.minimum, precision, false)} à{' '}
                {formaterPrixUnitaire(proposition.dispersion.maximum, precision, false)} €
                {proposition.dispersion.ecartRelatif
                  ? ` · étendue ${proposition.dispersion.ecartRelatif.replace('.', ',')} %`
                  : ''}
              </span>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  )
}
