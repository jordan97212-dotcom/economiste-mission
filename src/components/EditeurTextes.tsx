'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyserTexte } from '../domain/texte/structure'
import { actionEnregistrerTexte, actionAppliquerTrame } from '../app/missions/actions-dce'

const DELAI_ENREGISTREMENT = 1500

export interface OuvrageARediger {
  readonly id: string
  readonly lotId: string
  readonly type: 'SOUS_LOT' | 'OUVRAGE'
  readonly profondeur: number
  readonly code: string | null
  readonly designation: string
  readonly unite: string | null
  readonly contenu: string
  readonly designationSource: string | null
}

export interface LotARediger {
  readonly id: string
  readonly numero: string
  readonly intitule: string
  readonly corpsEtatId: string | null
  readonly ouvrages: readonly OuvrageARediger[]
}

export interface TrameDisponible {
  readonly id: string
  readonly intitule: string
  readonly corpsEtatId: string | null
}

type Etat = 'enregistre' | 'modifie' | 'enregistrement' | 'erreur'

/**
 * Rédaction des textes de CCTP — SPEC_APP_ECONOMISTE.md §5.4.
 *
 * Chaque ouvrage porte son texte. La liste de gauche montre d'un coup d'œil ce
 * qui reste à écrire ; l'aperçu de droite montre exactement la structure qui
 * partira dans le document Word, puisque c'est le même analyseur.
 */
export function EditeurTextes({
  missionId,
  lots,
  trames,
}: {
  missionId: string
  lots: readonly LotARediger[]
  trames: readonly TrameDisponible[]
}) {
  const tousLesOuvrages = useMemo(
    () => lots.flatMap((lot) => lot.ouvrages.map((ouvrage) => ({ lot, ouvrage }))),
    [lots],
  )

  const premier = tousLesOuvrages.find(({ ouvrage }) => ouvrage.type === 'OUVRAGE')
  const [selection, setSelection] = useState<string | null>(premier?.ouvrage.id ?? null)
  const [contenus, setContenus] = useState<Record<string, string>>(() =>
    Object.fromEntries(tousLesOuvrages.map(({ ouvrage }) => [ouvrage.id, ouvrage.contenu])),
  )
  const [etat, setEtat] = useState<Etat>('enregistre')
  const [erreur, setErreur] = useState<string | null>(null)

  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enAttente = useRef<{ posteId: string; contenu: string } | null>(null)

  const courant = tousLesOuvrages.find(({ ouvrage }) => ouvrage.id === selection)

  const envoyer = useCallback(async (): Promise<void> => {
    const attente = enAttente.current
    if (!attente) return
    enAttente.current = null
    setEtat('enregistrement')
    const resultat = await actionEnregistrerTexte(missionId, attente.posteId, attente.contenu)
    if (resultat.erreur) {
      setEtat('erreur')
      setErreur(resultat.erreur)
      return
    }
    setErreur(null)
    setEtat(enAttente.current ? 'modifie' : 'enregistre')
  }, [missionId])

  const saisir = useCallback(
    (posteId: string, contenu: string): void => {
      setContenus((precedent) => ({ ...precedent, [posteId]: contenu }))
      enAttente.current = { posteId, contenu }
      setEtat('modifie')
      if (minuteur.current) clearTimeout(minuteur.current)
      minuteur.current = setTimeout(() => void envoyer(), DELAI_ENREGISTREMENT)
    },
    [envoyer],
  )

  const changerSelection = useCallback(
    (posteId: string): void => {
      if (minuteur.current) clearTimeout(minuteur.current)
      void envoyer()
      setSelection(posteId)
    },
    [envoyer],
  )

  const appliquer = useCallback(
    (trameId: string): void => {
      if (!courant) return
      const posteId = courant.ouvrage.id
      if (minuteur.current) clearTimeout(minuteur.current)
      setEtat('enregistrement')
      void actionAppliquerTrame(missionId, posteId, trameId).then((resultat) => {
        if (resultat.erreur) {
          setEtat('erreur')
          setErreur(resultat.erreur)
          return
        }
        setContenus((precedent) => ({ ...precedent, [posteId]: resultat.contenu ?? '' }))
        setEtat('enregistre')
        setErreur(null)
      })
    },
    [courant, missionId],
  )


  /**
   * Les modifications partent après un court délai. Quitter la page juste après
   * une frappe les perdrait en silence : on prévient, et on tente un dernier
   * envoi au passage en arrière-plan.
   */
  useEffect(() => {
    const avertir = (evenement: BeforeUnloadEvent): void => {
      if (enAttente.current !== null) {
        evenement.preventDefault()
        evenement.returnValue = ''
      }
    }
    const surMasquage = (): void => {
      if (document.visibilityState === 'hidden') {
        if (minuteur.current) clearTimeout(minuteur.current)
        void envoyer()
      }
    }
    window.addEventListener('beforeunload', avertir)
    document.addEventListener('visibilitychange', surMasquage)
    return () => {
      window.removeEventListener('beforeunload', avertir)
      document.removeEventListener('visibilitychange', surMasquage)
    }
  }, [envoyer])

  const contenuCourant = selection ? (contenus[selection] ?? '') : ''
  const blocs = useMemo(() => analyserTexte(contenuCourant), [contenuCourant])

  const tramesUtiles = courant
    ? trames.filter(
        (trame) => trame.corpsEtatId === null || trame.corpsEtatId === courant.lot.corpsEtatId,
      )
    : []

  const restants = tousLesOuvrages.filter(
    ({ ouvrage }) => ouvrage.type === 'OUVRAGE' && (contenus[ouvrage.id] ?? '').trim() === '',
  ).length

  return (
    <div className="redaction">
      <aside className="redaction-liste">
        <div className="redaction-entete">
          <span className="surtitre">Ouvrages</span>
          <span className={restants === 0 ? 'etiquette etiquette-accent' : 'etiquette etiquette-alerte'}>
            {restants === 0 ? 'tout est rédigé' : `${restants} à écrire`}
          </span>
        </div>

        {lots.map((lot) => (
          <div key={lot.id}>
            <p className="redaction-lot">
              <span className="mono">{lot.numero}</span> {lot.intitule}
            </p>
            {lot.ouvrages.map((ouvrage) => {
              const vide = (contenus[ouvrage.id] ?? '').trim() === ''
              const estSousLot = ouvrage.type === 'SOUS_LOT'
              return (
                <button
                  key={ouvrage.id}
                  type="button"
                  className={`redaction-item${selection === ouvrage.id ? ' actif' : ''}${estSousLot ? ' chapitre' : ''}`}
                  style={{ paddingLeft: 12 + ouvrage.profondeur * 14 }}
                  onClick={() => changerSelection(ouvrage.id)}
                >
                  <span className="redaction-titre">
                    {ouvrage.code ? <span className="mono">{ouvrage.code} </span> : null}
                    {ouvrage.designation || '(sans désignation)'}
                  </span>
                  {!estSousLot && vide ? <span className="pastille" title="Sans texte" /> : null}
                </button>
              )
            })}
          </div>
        ))}
      </aside>

      <section className="redaction-editeur">
        {courant ? (
          <>
            <div className="carte-entete">
              <div>
                <p className="surtitre mono">
                  Lot {courant.lot.numero} · {courant.ouvrage.code ?? 'sans code'}
                </p>
                <h2>{courant.ouvrage.designation || '(sans désignation)'}</h2>
                {courant.ouvrage.designationSource &&
                courant.ouvrage.designationSource !== courant.ouvrage.designation ? (
                  <p className="etiquette etiquette-alerte" style={{ marginTop: 6 }}>
                    Texte écrit pour « {courant.ouvrage.designationSource} »
                  </p>
                ) : null}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="etat-enregistrement" data-etat={etat} role="status" aria-live="polite">
                  {etat === 'enregistre' && 'Enregistré'}
                  {etat === 'modifie' && 'Modifications non enregistrées…'}
                  {etat === 'enregistrement' && 'Enregistrement…'}
                  {etat === 'erreur' && 'Échec de l’enregistrement'}
                </span>
                {tramesUtiles.length > 0 ? (
                  <select
                    aria-label="Appliquer une trame"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) appliquer(e.target.value)
                    }}
                    style={{ width: 'auto', minWidth: 200 }}
                  >
                    <option value="">Appliquer une trame…</option>
                    {tramesUtiles.map((trame) => (
                      <option key={trame.id} value={trame.id}>
                        {trame.intitule}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>

            {erreur ? (
              <p className="message-erreur" style={{ margin: 18 }} role="alert">
                {erreur}
              </p>
            ) : null}

            <div className="redaction-colonnes">
              <div>
                <label htmlFor="texte" className="surtitre" style={{ display: 'block', marginBottom: 6 }}>
                  Texte descriptif
                </label>
                <textarea
                  id="texte"
                  value={contenuCourant}
                  onChange={(e) => saisir(courant.ouvrage.id, e.target.value)}
                  rows={22}
                  spellCheck
                  placeholder={
                    'Décrivez la prestation.\n\n## Un sous-titre\nUn paragraphe.\n- un point de détail'
                  }
                  style={{ fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }}
                />
                <p className="attenue" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Deux dièses pour un sous-titre, un tiret pour une puce, une ligne vide entre deux
                  paragraphes. Rien d’autre à retenir.
                </p>
              </div>

              <div>
                <p className="surtitre" style={{ marginBottom: 6 }}>
                  Aperçu tel qu’il partira dans le Word
                </p>
                <div className="apercu">
                  {blocs.length === 0 ? (
                    <p className="attenue" style={{ fontStyle: 'italic' }}>
                      Rien pour l’instant. Cet ouvrage sortira du CCTP avec une mention visible.
                    </p>
                  ) : (
                    blocs.map((bloc, index) => {
                      if (bloc.type === 'titre') return <h4 key={index}>{bloc.texte}</h4>
                      if (bloc.type === 'puce')
                        return (
                          <p key={index} className="apercu-puce">
                            {bloc.texte}
                          </p>
                        )
                      return <p key={index}>{bloc.texte}</p>
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="vide">Cette mission ne contient aucun ouvrage à décrire.</p>
        )}
      </section>
    </div>
  )
}
