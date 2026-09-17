'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  COLONNES_ENTREPRISE,
  COLONNES_OBLIGATOIRES,
  LIBELLES_COLONNE,
  type ColonneEntreprise,
  type MappageEntreprise,
} from '../domain/entreprises/import'
import type { SurExistante } from '../application/entreprises/import'
import {
  actionAnalyser,
  actionImporter,
  actionLireCsv,
  type Apercu,
  type LectureFichier,
} from '../app/entreprises/actions-import'

/**
 * Import d'un répertoire d'entreprises depuis un CSV.
 *
 * Trois temps, toujours les mêmes : on lit, on montre ce qu'on a compris, on
 * n'écrit qu'après accord. Le mappage proposé est corrigeable colonne par
 * colonne — une reconnaissance automatique se trompe, et se tromper en silence
 * remplirait le répertoire de courriels dans la case téléphone.
 */

export function ImportEntreprises() {
  const routeur = useRouter()
  const [enCours, demarrer] = useTransition()
  const champFichier = useRef<HTMLInputElement>(null)

  const [lecture, setLecture] = useState<LectureFichier | null>(null)
  const [ligneEntete, setLigneEntete] = useState(1)
  const [mappage, setMappage] = useState<MappageEntreprise>({})
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [surExistante, setSurExistante] = useState<SurExistante>('ignorer')
  const [erreur, setErreur] = useState<string | null>(null)
  const [resume, setResume] = useState<string[] | null>(null)

  const grille = lecture?.grille ?? []
  const entete = grille[ligneEntete - 1] ?? []
  const manquantes = COLONNES_OBLIGATOIRES.filter((colonne) => mappage[colonne] === undefined)

  const aRetenir = useMemo(
    () => (apercu?.entreprises ?? []).filter((e) => !e.doublonDansLeFichier),
    [apercu],
  )

  const lire = (donnees: FormData): void => {
    setErreur(null)
    setResume(null)
    setApercu(null)
    demarrer(async () => {
      const resultat = await actionLireCsv(donnees)
      if (resultat.erreur) {
        setErreur(resultat.erreur)
        setLecture(null)
        return
      }
      setLecture(resultat)
      setLigneEntete(1)
      setMappage(resultat.mappagePropose)
    })
  }

  const analyser = (): void => {
    if (lecture === null) return
    setErreur(null)
    demarrer(async () => {
      try {
        setApercu(
          await actionAnalyser(
            grille.map((ligne) => [...ligne]),
            mappage,
            ligneEntete,
          ),
        )
      } catch (probleme) {
        setErreur(probleme instanceof Error ? probleme.message : 'Analyse impossible.')
      }
    })
  }

  const importer = (): void => {
    if (apercu === null) return
    setErreur(null)
    demarrer(async () => {
      try {
        const resultat = await actionImporter(
          apercu.entreprises.map((e) => ({ ...e, corpsEtatQualifies: [...e.corpsEtatQualifies] })),
          surExistante,
        )
        const lignes = [
          `${resultat.creees} entreprise(s) créée(s).`,
          ...(resultat.completees > 0 ? [`${resultat.completees} complétée(s).`] : []),
          ...(resultat.ignorees.length > 0
            ? [`${resultat.ignorees.length} laissée(s) de côté :`]
            : []),
          ...resultat.ignorees
            .slice(0, 15)
            .map((i) => `    ligne ${i.ligne} · ${i.raisonSociale} — ${i.motif}`),
          ...(resultat.ignorees.length > 15 ? [`    … et ${resultat.ignorees.length - 15} autres.`] : []),
        ]
        setResume(lignes)
        setApercu(null)
        setLecture(null)
        if (champFichier.current) champFichier.current.value = ''
        routeur.refresh()
      } catch (probleme) {
        setErreur(probleme instanceof Error ? probleme.message : 'Import impossible.')
      }
    })
  }

  return (
    <>
      <div className="carte" style={{ marginBottom: 20 }}>
        <div className="carte-entete">
          <h2>1 · Choisir le fichier</h2>
        </div>
        <div style={{ padding: 16 }}>
          <form
            action={lire}
            style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
          >
            {/* Le champ natif affiche son libellé dans la langue du navigateur :
                on le cache derrière le nôtre. */}
            <input
              ref={champFichier}
              id="fichier-csv"
              type="file"
              name="fichier"
              accept=".csv,text/csv,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => {
                const formulaire = e.target.form
                if (formulaire && e.target.files?.length) formulaire.requestSubmit()
              }}
            />
            <button
              type="button"
              className="bouton bouton-primaire"
              onClick={() => champFichier.current?.click()}
              disabled={enCours}
            >
              Choisir un fichier CSV
            </button>
            <span className="attenue" style={{ fontSize: 13 }}>
              Export d’un tableur, d’une messagerie ou d’un logiciel de gestion.
            </span>
          </form>

          {lecture ? (
            <p className="attenue" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
              {grille.length} ligne(s) lue(s) · séparateur : {lecture.separateur} · encodage :{' '}
              {lecture.encodage}
            </p>
          ) : null}

          {lecture?.colonnesIrregulieres ? (
            <p className="message-avertissement" style={{ marginTop: 10 }}>
              Les lignes n’ont pas toutes le même nombre de colonnes. C’est souvent un
              point-virgule oublié dans un nom d’entreprise. Vérifiez l’aperçu avant d’importer.
            </p>
          ) : null}
        </div>
      </div>

      {erreur ? (
        <p className="message-erreur" role="alert" style={{ marginBottom: 12 }}>
          {erreur}
        </p>
      ) : null}

      {resume ? (
        <div className="carte" style={{ marginBottom: 20 }}>
          <div className="carte-entete">
            <h2>Import terminé</h2>
          </div>
          <div style={{ padding: 16 }}>
            {resume.map((ligne) => (
              <p key={ligne} style={{ margin: '2px 0', whiteSpace: 'pre-wrap' }}>
                {ligne}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {lecture ? (
        <div className="carte" style={{ marginBottom: 20 }}>
          <div className="carte-entete">
            <h2>2 · Dire à quoi correspondent les colonnes</h2>
          </div>
          <div style={{ padding: 16 }}>
            <div className="champ" style={{ width: 220, marginBottom: 16 }}>
              <label htmlFor="ligne-entete">Ligne des intitulés</label>
              <input
                id="ligne-entete"
                type="number"
                min={1}
                max={Math.max(1, grille.length)}
                value={ligneEntete}
                onChange={(e) => {
                  const valeur = Math.max(1, Number(e.target.value) || 1)
                  setLigneEntete(valeur)
                  setMappage({})
                  setApercu(null)
                }}
              />
            </div>

            <div className="defilement">
              <table className="tableau">
                <thead>
                  <tr>
                    <th style={{ width: 200 }}>Champ du répertoire</th>
                    <th>Colonne du fichier</th>
                    <th>Exemple lu</th>
                  </tr>
                </thead>
                <tbody>
                  {COLONNES_ENTREPRISE.map((colonne) => {
                    const index = mappage[colonne]
                    const exemple =
                      index === undefined ? '' : (grille[ligneEntete]?.[index] ?? '')
                    const obligatoire = COLONNES_OBLIGATOIRES.includes(colonne)
                    return (
                      <tr key={colonne}>
                        <td>
                          {LIBELLES_COLONNE[colonne]}
                          {obligatoire ? (
                            <span className="etiquette" style={{ marginLeft: 8 }}>
                              obligatoire
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <select
                            className="cellule"
                            aria-label={`Colonne pour ${LIBELLES_COLONNE[colonne]}`}
                            value={index ?? ''}
                            onChange={(e) => {
                              const valeur = e.target.value
                              setApercu(null)
                              setMappage((precedent) => {
                                const suivant = { ...precedent }
                                if (valeur === '') delete suivant[colonne]
                                else suivant[colonne] = Number(valeur)
                                return suivant
                              })
                            }}
                          >
                            <option value="">— aucune —</option>
                            {entete.map((intitule, i) => (
                              <option key={`${i}-${intitule}`} value={i}>
                                {intitule.trim() === ''
                                  ? `Colonne ${i + 1}`
                                  : `${i + 1} · ${intitule}`}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="attenue" style={{ fontSize: 13 }}>
                          {exemple}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                type="button"
                className="bouton bouton-primaire"
                onClick={analyser}
                disabled={enCours || manquantes.length > 0}
                title={
                  manquantes.length > 0
                    ? 'La raison sociale est nécessaire : sans elle, une ligne ne désigne personne.'
                    : undefined
                }
              >
                Vérifier avant d’importer
              </button>
              {manquantes.length > 0 ? (
                <span className="attenue" style={{ fontSize: 13 }}>
                  Indiquez la colonne de la raison sociale.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {apercu ? (
        <div className="carte" style={{ marginBottom: 20 }}>
          <div className="carte-entete">
            <h2>3 · Vérifier, puis importer</h2>
            <span className="attenue" style={{ fontSize: 13 }}>
              {aRetenir.length} entreprise(s) à reprendre
              {apercu.lignesRejetees > 0 ? ` · ${apercu.lignesRejetees} ligne(s) sans nom` : ''}
            </span>
          </div>

          <div style={{ padding: 16 }}>
            {apercu.anomalies.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontWeight: 600, marginBottom: 6 }}>
                  {apercu.anomalies.length} point(s) à regarder :
                </p>
                <ul className="liste-anomalies">
                  {apercu.anomalies.slice(0, 30).map((anomalie) => (
                    <li key={`${anomalie.ligne}-${anomalie.code}`}>
                      <span className="mono">ligne {anomalie.ligne}</span> — {anomalie.message}
                    </li>
                  ))}
                  {apercu.anomalies.length > 30 ? (
                    <li className="attenue">… et {apercu.anomalies.length - 30} autres.</li>
                  ) : null}
                </ul>
                <p className="attenue" style={{ fontSize: 13, marginTop: 6 }}>
                  Aucune de ces valeurs n’a été corrigée : elles sont reprises telles que votre
                  fichier les porte.
                </p>
              </div>
            ) : (
              <p className="attenue" style={{ marginTop: 0 }}>
                Rien à signaler dans ce fichier.
              </p>
            )}

            <div className="defilement" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="tableau">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Ligne</th>
                    <th style={{ minWidth: 200 }}>Raison sociale</th>
                    <th style={{ width: 150 }}>SIRET</th>
                    <th>Contact</th>
                    <th>Courriel</th>
                    <th>Corps d’état</th>
                  </tr>
                </thead>
                <tbody>
                  {apercu.entreprises.slice(0, 200).map((entreprise) => (
                    <tr
                      key={entreprise.ligne}
                      style={entreprise.doublonDansLeFichier ? { opacity: 0.45 } : undefined}
                    >
                      <td className="mono">{entreprise.ligne}</td>
                      <td>{entreprise.raisonSociale}</td>
                      <td className="mono" style={{ fontSize: 12.5 }}>
                        {entreprise.siret ?? ''}
                      </td>
                      <td>{entreprise.contactNom ?? ''}</td>
                      <td>{entreprise.email ?? ''}</td>
                      <td>{entreprise.corpsEtatQualifies.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {apercu.entreprises.length > 200 ? (
              <p className="attenue" style={{ fontSize: 13 }}>
                Aperçu des 200 premières ; l’import les reprendra toutes.
              </p>
            ) : null}

            <fieldset style={{ border: 'none', padding: 0, margin: '18px 0 0' }}>
              <legend style={{ fontWeight: 600, marginBottom: 6 }}>
                Une entreprise déjà au répertoire
              </legend>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <input
                  type="radio"
                  name="existante"
                  checked={surExistante === 'ignorer'}
                  onChange={() => setSurExistante('ignorer')}
                />
                <span>Ne pas y toucher</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  name="existante"
                  checked={surExistante === 'completer'}
                  onChange={() => setSurExistante('completer')}
                />
                <span>
                  Compléter ses champs vides — ce que vous avez saisi n’est jamais écrasé
                </span>
              </label>
            </fieldset>

            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                className="bouton bouton-primaire"
                onClick={importer}
                disabled={enCours || aRetenir.length === 0}
              >
                {enCours ? 'Import en cours…' : `Importer ${aRetenir.length} entreprise(s)`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
