'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import type { ChiffrageDTO, LotDTO, ModificationPoste, PosteDTO } from '../application/dto'
import { recalculerLot, type ResultatLot } from '../lib/chiffrage-client'
import * as Money from '../domain/money/money'
import { ratioEuroParM2 } from '../domain/chiffrage/calcul'
import {
  formaterMontant,
  formaterPrixUnitaire,
  formaterQuantite,
  saisieVersPrixUnitaire,
  normaliserQuantite,
  normaliserCoefficient,
  LIBELLES_UNITE,
  UNITES,
} from '../lib/format'
import {
  actionEnregistrerPostes,
  actionAjouterPoste,
  actionSupprimerPoste,
  actionDeplacerPoste,
  actionCollerBloc,
} from '../app/missions/actions-chiffrage'
import type { ColonneCollable } from '../application/chiffrage/coller'
import { AssistancePrix } from './AssistancePrix'
import {
  actionRechercherPrix,
  actionAppliquerPrix,
  type PropositionPrixDTO,
} from '../app/missions/actions-prix'

const COLONNES: readonly ColonneCollable[] = [
  'code',
  'designation',
  'unite',
  'quantite',
  'prixUnitaireHtBase',
  'coefficientApplique',
]

const DELAI_ENREGISTREMENT = 1200
const DELAI_RECHERCHE_PRIX = 350
const LONGUEUR_MIN_RECHERCHE = 3

interface EtatAssistance {
  readonly posteId: string
  readonly propositions: readonly PropositionPrixDTO[]
  readonly position: { haut: number; gauche: number }
  readonly chargement: boolean
}

type EtatEnregistrement = 'enregistre' | 'modifie' | 'enregistrement' | 'erreur'

export function GrilleChiffrage({ chiffrageInitial }: { chiffrageInitial: ChiffrageDTO }) {
  const [chiffrage, setChiffrage] = useState(chiffrageInitial)
  const [etat, setEtat] = useState<EtatEnregistrement>('enregistre')
  const [messageErreur, setMessageErreur] = useState<string | null>(null)
  const [ligneActive, setLigneActive] = useState<string | null>(null)

  const [assistance, setAssistance] = useState<EtatAssistance | null>(null)

  const enAttente = useRef(new Map<string, ModificationPoste>())
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minuteurPrix = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cellules = useRef(new Map<string, HTMLElement>())

  const { mission, lots } = chiffrage
  const precision = mission.precisionPu

  const calculs = useMemo(() => {
    const parLot = new Map<string, ResultatLot>()
    for (const lot of lots) {
      parLot.set(
        lot.id,
        recalculerLot(lot.postes, { mission: mission.coefficientLocalDefaut, lot: lot.coefficientLocal }, precision),
      )
    }
    return parLot
  }, [lots, mission.coefficientLocalDefaut, precision])

  const totalTce = useMemo(() => {
    let somme = 0n
    for (const resultat of calculs.values()) somme += BigInt(resultat.totalHt)
    return somme.toString()
  }, [calculs])

  const ratio = useMemo(() => {
    // Un ratio n'a de sens qu'une fois le chiffrage commencé : à zéro, on
    // n'affiche rien plutôt qu'un « 0 € » qui ressemblerait à une estimation.
    if (BigInt(totalTce) === 0n) return null
    const surface = mission.surfaceShon ?? mission.surfaceUtile
    const valeur = ratioEuroParM2(Money.depuisCentimes(totalTce), surface)
    return valeur ? valeur.toFixed(2).replace('.', ',') : null
  }, [totalTce, mission.surfaceShon, mission.surfaceUtile])

  const envoyer = useCallback(async (): Promise<void> => {
    if (enAttente.current.size === 0) return
    const lot = [...enAttente.current.values()]
    enAttente.current.clear()
    setEtat('enregistrement')
    setMessageErreur(null)
    try {
      const frais = await actionEnregistrerPostes(mission.id, lot)
      setChiffrage(frais)
      setEtat(enAttente.current.size > 0 ? 'modifie' : 'enregistre')
    } catch (erreur) {
      setEtat('erreur')
      setMessageErreur(erreur instanceof Error ? erreur.message : 'Enregistrement impossible.')
    }
  }, [mission.id])

  const programmerEnregistrement = useCallback((): void => {
    if (minuteur.current) clearTimeout(minuteur.current)
    minuteur.current = setTimeout(() => {
      void envoyer()
    }, DELAI_ENREGISTREMENT)
  }, [envoyer])

  /** Applique une modification en local, puis programme son enregistrement. */
  const modifier = useCallback(
    (lotId: string, posteId: string, champ: ColonneCollable, valeurStockee: string | null): void => {
      setChiffrage((precedent) => ({
        ...precedent,
        lots: precedent.lots.map((l) =>
          l.id !== lotId
            ? l
            : {
                ...l,
                postes: l.postes.map((p) => (p.id === posteId ? { ...p, [champ]: valeurStockee } : p)),
              },
        ),
      }))

      const existante = enAttente.current.get(posteId) ?? { id: posteId }
      enAttente.current.set(posteId, { ...existante, [champ]: valeurStockee })
      setEtat('modifie')
      programmerEnregistrement()
    },
    [programmerEnregistrement],
  )

  const appelerAction = useCallback(
    async (action: () => Promise<ChiffrageDTO>): Promise<void> => {
      if (minuteur.current) clearTimeout(minuteur.current)
      await envoyer()
      setEtat('enregistrement')
      try {
        setChiffrage(await action())
        setEtat('enregistre')
        setMessageErreur(null)
      } catch (erreur) {
        setEtat('erreur')
        setMessageErreur(erreur instanceof Error ? erreur.message : 'Opération impossible.')
      }
    },
    [envoyer],
  )

  /**
   * Assistance au prix : à la frappe d'une désignation, on interroge la base
   * personnelle. La proposition ne s'applique jamais seule (§2.2).
   */
  const rechercherPrix = useCallback(
    (posteId: string, texte: string, corpsEtatId: string | null, element: HTMLElement): void => {
      if (minuteurPrix.current) clearTimeout(minuteurPrix.current)

      if (texte.trim().length < LONGUEUR_MIN_RECHERCHE) {
        setAssistance(null)
        return
      }

      const rectangle = element.getBoundingClientRect()
      const position = { haut: rectangle.bottom + 2, gauche: rectangle.left }
      setAssistance({ posteId, propositions: [], position, chargement: true })

      minuteurPrix.current = setTimeout(() => {
        void actionRechercherPrix(texte, corpsEtatId)
          .then((propositions) => {
            setAssistance((precedent) =>
              precedent && precedent.posteId === posteId
                ? { ...precedent, propositions, chargement: false }
                : precedent,
            )
          })
          .catch(() => setAssistance(null))
      }, DELAI_RECHERCHE_PRIX)
    },
    [],
  )

  const appliquerPrix = useCallback(
    (posteId: string, proposition: PropositionPrixDTO): void => {
      setAssistance(null)
      void appelerAction(() =>
        actionAppliquerPrix(
          mission.id,
          posteId,
          proposition.prixUnitaireHt,
          proposition.dateReleve,
          proposition.unite,
        ),
      )
    },
    [appelerAction, mission.id],
  )

  const lignesPlates = useMemo(
    () => lots.flatMap((lot) => lot.postes.map((poste) => ({ lotId: lot.id, poste }))),
    [lots],
  )

  const deplacerFocus = useCallback(
    (posteId: string, colonne: ColonneCollable, delta: number): void => {
      const index = lignesPlates.findIndex((l) => l.poste.id === posteId)
      const cible = lignesPlates[index + delta]
      if (!cible) return
      const element = cellules.current.get(`${cible.poste.id}:${colonne}`)
      if (element) {
        element.focus()
        if (element instanceof HTMLInputElement) element.select()
      }
    },
    [lignesPlates],
  )

  const gererTouche = useCallback(
    (evenement: React.KeyboardEvent, posteId: string, colonne: ColonneCollable): void => {
      if (evenement.key === 'ArrowDown' || evenement.key === 'Enter') {
        evenement.preventDefault()
        deplacerFocus(posteId, colonne, 1)
      } else if (evenement.key === 'ArrowUp') {
        evenement.preventDefault()
        deplacerFocus(posteId, colonne, -1)
      } else if (evenement.key === 'Escape') {
        ;(evenement.target as HTMLElement).blur()
      }
    },
    [deplacerFocus],
  )

  const gererCollage = useCallback(
    (evenement: React.ClipboardEvent, lotId: string, posteId: string, colonne: ColonneCollable): void => {
      const texte = evenement.clipboardData.getData('text/plain')
      if (!texte.includes('\t') && !texte.includes('\n')) return

      evenement.preventDefault()
      const lignes = texte
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((ligne, index, tableau) => ligne !== '' || index < tableau.length - 1)
        .map((ligne) => ligne.split('\t'))

      if (lignes.length === 0) return
      void appelerAction(() => actionCollerBloc(mission.id, lotId, posteId, colonne, lignes))
    },
    [appelerAction, mission.id],
  )

  const enregistrerReference = useCallback((cle: string, element: HTMLElement | null): void => {
    if (element) cellules.current.set(cle, element)
    else cellules.current.delete(cle)
  }, [])

  return (
    <>
      <div className="barre-outils">
        <span
          className="etat-enregistrement"
          data-etat={etat}
          role="status"
          aria-live="polite"
        >
          {etat === 'enregistre' && 'Modifications enregistrées'}
          {etat === 'modifie' && 'Modifications non enregistrées…'}
          {etat === 'enregistrement' && 'Enregistrement en cours…'}
          {etat === 'erreur' && 'Échec de l’enregistrement'}
        </span>
        <button
          type="button"
          className="bouton bouton-discret"
          onClick={() => {
            if (minuteur.current) clearTimeout(minuteur.current)
            void envoyer()
          }}
          disabled={etat === 'enregistre' || etat === 'enregistrement'}
        >
          Enregistrer maintenant
        </button>
        <span className="attenue" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
          Flèches et Entrée pour circuler · collez un bloc de cellules depuis votre tableur
        </span>
      </div>

      {messageErreur ? (
        <p className="message-erreur" role="alert" style={{ marginBottom: 12 }}>
          {messageErreur}
        </p>
      ) : null}

      {lots.length === 0 ? (
        <div className="carte">
          <p className="vide">
            Cette mission n’a pas encore de lot. Revenez à la fiche de mission pour en créer un.
          </p>
        </div>
      ) : null}

      {lots.map((lot) => {
        const resultat = calculs.get(lot.id)
        return (
          <LotGrille
            key={lot.id}
            lot={lot}
            resultat={resultat}
            precision={precision}
            coefficientMission={mission.coefficientLocalDefaut}
            ligneActive={ligneActive}
            onLigneActive={setLigneActive}
            onModifier={modifier}
            onTouche={gererTouche}
            onCollage={gererCollage}
            onRechercherPrix={rechercherPrix}
            enregistrerReference={enregistrerReference}
            onAjouter={(type, apres) =>
              void appelerAction(() => actionAjouterPoste(mission.id, lot.id, type, apres))
            }
            onSupprimer={(posteId) =>
              void appelerAction(() => actionSupprimerPoste(mission.id, posteId))
            }
            onDeplacer={(posteId, sens) =>
              void appelerAction(() => actionDeplacerPoste(mission.id, posteId, sens))
            }
          />
        )
      })}

      {assistance ? (
        <AssistancePrix
          propositions={assistance.propositions}
          position={assistance.position}
          precision={precision}
          chargement={assistance.chargement}
          onChoisir={(proposition) => appliquerPrix(assistance.posteId, proposition)}
          onFermer={() => setAssistance(null)}
        />
      ) : null}

      <div className="total-bandeau">
        <div>
          <div className="surtitre">Total tous corps d’état HT</div>
          <div className="valeur">{formaterMontant(totalTce)}</div>
        </div>
        <div>
          <div className="surtitre">Ratio au m²</div>
          <div className="valeur">{ratio ? `${ratio} €` : '—'}</div>
        </div>
        <div>
          <div className="surtitre">Coefficient mission</div>
          <div className="valeur">{mission.coefficientLocalDefaut.replace('.', ',')}</div>
        </div>
        <div>
          <div className="surtitre">Décimales du prix unitaire</div>
          <div className="valeur">{precision}</div>
        </div>
      </div>
    </>
  )
}

interface ProprietesLot {
  lot: LotDTO
  resultat: ResultatLot | undefined
  precision: number
  coefficientMission: string
  ligneActive: string | null
  onLigneActive: (id: string | null) => void
  onModifier: (lotId: string, posteId: string, champ: ColonneCollable, valeur: string | null) => void
  onTouche: (evenement: React.KeyboardEvent, posteId: string, colonne: ColonneCollable) => void
  onCollage: (
    evenement: React.ClipboardEvent,
    lotId: string,
    posteId: string,
    colonne: ColonneCollable,
  ) => void
  onRechercherPrix: (
    posteId: string,
    texte: string,
    corpsEtatId: string | null,
    element: HTMLElement,
  ) => void
  enregistrerReference: (cle: string, element: HTMLElement | null) => void
  onAjouter: (type: 'SOUS_LOT' | 'OUVRAGE', apres: string | null) => void
  onSupprimer: (posteId: string) => void
  onDeplacer: (posteId: string, sens: 'haut' | 'bas' | 'indenter' | 'desindenter') => void
}

function LotGrille({
  lot,
  resultat,
  precision,
  coefficientMission,
  ligneActive,
  onLigneActive,
  onModifier,
  onTouche,
  onCollage,
  onRechercherPrix,
  enregistrerReference,
  onAjouter,
  onSupprimer,
  onDeplacer,
}: ProprietesLot) {
  const coefficientEffectifLot = lot.coefficientLocal ?? coefficientMission

  return (
    <section id={`lot-${lot.id}`} className="carte" style={{ marginBottom: 20, overflow: 'hidden' }}>
      <div className="carte-entete">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontWeight: 600 }}>
            {lot.numero}
          </span>
          <h2>{lot.intitule}</h2>
          <span className={lot.coefficientLocal ? 'etiquette etiquette-accent' : 'etiquette'}>
            coef {coefficientEffectifLot.replace('.', ',')}
            {lot.coefficientLocal ? ' (lot)' : ' (mission)'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
            {formaterMontant(resultat?.totalHt ?? lot.montantEstimeHt)}
          </span>
        </div>
      </div>

      <div className="defilement">
        <table className="grille">
          <thead>
            <tr>
              <th style={{ width: 96 }}>Code</th>
              <th style={{ minWidth: 300 }}>Désignation</th>
              <th style={{ width: 76 }}>Unité</th>
              <th style={{ width: 96, textAlign: 'right' }}>Quantité</th>
              <th style={{ width: 110, textAlign: 'right' }}>PU base HT</th>
              <th style={{ width: 82, textAlign: 'right' }}>Coef.</th>
              <th style={{ width: 110, textAlign: 'right' }}>PU final HT</th>
              <th style={{ width: 130, textAlign: 'right' }}>Montant HT</th>
              <th style={{ width: 132 }} />
            </tr>
          </thead>
          <tbody>
            {lot.postes.map((poste) => (
              <LignePoste
                key={poste.id}
                lotId={lot.id}
                poste={poste}
                calcul={resultat?.parPoste.get(poste.id)}
                precision={precision}
                active={ligneActive === poste.id}
                onLigneActive={onLigneActive}
                onModifier={onModifier}
                onTouche={onTouche}
                onCollage={onCollage}
                onRechercherPrix={onRechercherPrix}
                corpsEtatId={lot.corpsEtatId}
                enregistrerReference={enregistrerReference}
                onAjouter={onAjouter}
                onSupprimer={onSupprimer}
                onDeplacer={onDeplacer}
              />
            ))}
          </tbody>
        </table>
      </div>

      {lot.postes.length === 0 ? (
        <p className="vide">Aucun poste dans ce lot.</p>
      ) : null}

      <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)', display: 'flex', gap: 8 }}>
        <button type="button" className="bouton" onClick={() => onAjouter('OUVRAGE', null)}>
          Ajouter un ouvrage
        </button>
        <button type="button" className="bouton" onClick={() => onAjouter('SOUS_LOT', null)}>
          Ajouter un sous-lot
        </button>
      </div>
    </section>
  )
}

interface ProprietesLigne {
  lotId: string
  poste: PosteDTO
  calcul: ReturnType<ResultatLot['parPoste']['get']>
  precision: number
  active: boolean
  onLigneActive: (id: string | null) => void
  onModifier: (lotId: string, posteId: string, champ: ColonneCollable, valeur: string | null) => void
  onTouche: (evenement: React.KeyboardEvent, posteId: string, colonne: ColonneCollable) => void
  onCollage: (
    evenement: React.ClipboardEvent,
    lotId: string,
    posteId: string,
    colonne: ColonneCollable,
  ) => void
  onRechercherPrix: (
    posteId: string,
    texte: string,
    corpsEtatId: string | null,
    element: HTMLElement,
  ) => void
  corpsEtatId: string | null
  enregistrerReference: (cle: string, element: HTMLElement | null) => void
  onAjouter: (type: 'SOUS_LOT' | 'OUVRAGE', apres: string | null) => void
  onSupprimer: (posteId: string) => void
  onDeplacer: (posteId: string, sens: 'haut' | 'bas' | 'indenter' | 'desindenter') => void
}

function LignePoste({
  lotId,
  poste,
  calcul,
  precision,
  active,
  onLigneActive,
  onModifier,
  onTouche,
  onCollage,
  onRechercherPrix,
  corpsEtatId,
  enregistrerReference,
  onAjouter,
  onSupprimer,
  onDeplacer,
}: ProprietesLigne) {
  const estSousLot = poste.type === 'SOUS_LOT'
  const classes = [estSousLot ? 'ligne-sous-lot' : '', active ? 'ligne-selectionnee' : '']
    .filter(Boolean)
    .join(' ')

  const proprietesCommunes = (colonne: ColonneCollable) => ({
    onFocus: () => onLigneActive(poste.id),
    onKeyDown: (evenement: React.KeyboardEvent) => onTouche(evenement, poste.id, colonne),
    onPaste: (evenement: React.ClipboardEvent) => onCollage(evenement, lotId, poste.id, colonne),
    ref: (element: HTMLElement | null) => enregistrerReference(`${poste.id}:${colonne}`, element),
  })

  return (
    <tr className={classes}>
      <td>
        <input
          {...proprietesCommunes('code')}
          className="cellule mono"
          defaultValue={poste.code ?? ''}
          aria-label="Code"
          onBlur={(e) => {
            if ((poste.code ?? '') !== e.target.value) {
              onModifier(lotId, poste.id, 'code', e.target.value.trim() || null)
            }
          }}
        />
      </td>

      <td>
        <input
          {...proprietesCommunes('designation')}
          className="cellule"
          style={{ paddingLeft: 8 + poste.profondeur * 18, fontWeight: estSousLot ? 600 : 400 }}
          defaultValue={poste.designation}
          aria-label="Désignation"
          placeholder={estSousLot ? 'Intitulé du sous-lot' : 'Désignation de l’ouvrage'}
          onChange={
            estSousLot
              ? undefined
              : (e) => onRechercherPrix(poste.id, e.target.value, corpsEtatId, e.target)
          }
          onBlur={(e) => {
            if (poste.designation !== e.target.value) {
              onModifier(lotId, poste.id, 'designation', e.target.value)
            }
          }}
        />
      </td>

      <td>
        {estSousLot ? (
          <span className="cellule-calculee" />
        ) : (
          <select
            {...proprietesCommunes('unite')}
            className="cellule"
            value={poste.unite ?? ''}
            aria-label="Unité"
            onChange={(e) => onModifier(lotId, poste.id, 'unite', e.target.value || null)}
          >
            <option value="">—</option>
            {UNITES.map((unite) => (
              <option key={unite} value={unite}>
                {LIBELLES_UNITE[unite]}
              </option>
            ))}
          </select>
        )}
      </td>

      <td>
        {estSousLot ? (
          <span className="cellule-calculee" />
        ) : (
          <input
            {...proprietesCommunes('quantite')}
            className="cellule cellule-chiffre"
            inputMode="decimal"
            defaultValue={formaterQuantite(poste.quantite)}
            aria-label="Quantité"
            onBlur={(e) => onModifier(lotId, poste.id, 'quantite', normaliserQuantite(e.target.value))}
          />
        )}
      </td>

      <td>
        {estSousLot ? (
          <span className="cellule-calculee" />
        ) : (
          <input
            {...proprietesCommunes('prixUnitaireHtBase')}
            className="cellule cellule-chiffre"
            inputMode="decimal"
            defaultValue={formaterPrixUnitaire(poste.prixUnitaireHtBase, precision)}
            aria-label="Prix unitaire de base hors taxes"
            onBlur={(e) =>
              onModifier(lotId, poste.id, 'prixUnitaireHtBase', saisieVersPrixUnitaire(e.target.value, precision))
            }
          />
        )}
      </td>

      <td>
        {estSousLot ? (
          <span className="cellule-calculee" />
        ) : (
          <input
            {...proprietesCommunes('coefficientApplique')}
            className={`cellule cellule-chiffre ${poste.coefficientApplique ? '' : 'cellule-heritee'}`}
            inputMode="decimal"
            defaultValue={poste.coefficientApplique?.replace('.', ',') ?? ''}
            placeholder={calcul?.coefficientEffectif.replace('.', ',') ?? ''}
            aria-label="Coefficient appliqué"
            title={
              poste.coefficientApplique
                ? 'Coefficient propre à cette ligne'
                : `Hérité du niveau ${calcul?.origineCoefficient ?? 'mission'}`
            }
            onBlur={(e) =>
              onModifier(lotId, poste.id, 'coefficientApplique', normaliserCoefficient(e.target.value))
            }
          />
        )}
      </td>

      <td>
        <span className="cellule-calculee">
          {estSousLot ? '' : formaterPrixUnitaire(calcul?.prixUnitaireHtFinal ?? null, precision)}
        </span>
      </td>

      <td>
        <span className="cellule-calculee" style={{ fontWeight: estSousLot ? 600 : 400 }}>
          {calcul?.erreur ? (
            <span style={{ color: 'var(--color-danger)' }} title={calcul.erreur}>
              erreur
            </span>
          ) : (
            formaterMontant(calcul?.montantHt ?? poste.montantHt, false)
          )}
        </span>
      </td>

      <td>
        <div style={{ display: 'flex', gap: 2, padding: '0 4px' }}>
          <button
            type="button"
            className="bouton bouton-discret"
            title="Monter"
            onClick={() => onDeplacer(poste.id, 'haut')}
          >
            ↑
          </button>
          <button
            type="button"
            className="bouton bouton-discret"
            title="Descendre"
            onClick={() => onDeplacer(poste.id, 'bas')}
          >
            ↓
          </button>
          <button
            type="button"
            className="bouton bouton-discret"
            title="Rattacher au poste précédent"
            onClick={() => onDeplacer(poste.id, 'indenter')}
          >
            →
          </button>
          <button
            type="button"
            className="bouton bouton-discret"
            title="Remonter d’un niveau"
            onClick={() => onDeplacer(poste.id, 'desindenter')}
          >
            ←
          </button>
          <button
            type="button"
            className="bouton bouton-discret"
            title="Insérer une ligne en dessous"
            onClick={() => onAjouter('OUVRAGE', poste.id)}
          >
            +
          </button>
          <button
            type="button"
            className="bouton bouton-discret bouton-danger"
            title="Supprimer la ligne"
            onClick={() => onSupprimer(poste.id)}
          >
            ×
          </button>
        </div>
      </td>
    </tr>
  )
}
