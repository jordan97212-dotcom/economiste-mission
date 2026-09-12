'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  devinerMappagePrix,
  COLONNES_BASE_PRIX,
  type ColonneBasePrix,
  type MappagePrix,
} from '../application/prix/analyse-import'
import {
  actionLireClasseur,
  actionImporterBasePrix,
  type FeuilleLue,
} from '../app/missions/actions-import'

const LIBELLES: Record<ColonneBasePrix, string> = {
  code: 'Code',
  designation: 'Désignation',
  unite: 'Unité',
  prixUnitaireHt: 'Prix unitaire HT',
  dateReleve: 'Date du relevé',
  corpsEtat: 'Corps d’état',
  zone: 'Zone',
}

const OBLIGATOIRES: ColonneBasePrix[] = ['designation', 'prixUnitaireHt']

export function ImportBasePrix() {
  const routeur = useRouter()
  const [enCours, demarrer] = useTransition()

  const [feuilles, setFeuilles] = useState<readonly FeuilleLue[]>([])
  const [nomFeuille, setNomFeuille] = useState('')
  const [ligneEntete, setLigneEntete] = useState(1)
  const [mappage, setMappage] = useState<MappagePrix>({})
  const [erreur, setErreur] = useState<string | null>(null)
  const [resume, setResume] = useState<string | null>(null)
  const [anomalies, setAnomalies] = useState<readonly { ligne: number; message: string }[]>([])

  const feuille = feuilles.find((f) => f.nom === nomFeuille)
  const grille = feuille?.grille ?? []
  const entete = grille[ligneEntete - 1] ?? []
  const corps = useMemo(() => grille.slice(ligneEntete), [grille, ligneEntete])

  const manquantes = OBLIGATOIRES.filter((colonne) => mappage[colonne] === undefined)

  const lire = (donnees: FormData): void => {
    setErreur(null)
    setResume(null)
    setAnomalies([])
    demarrer(async () => {
      const lecture = await actionLireClasseur(donnees)
      if (lecture.erreur) {
        setErreur(lecture.erreur)
        return
      }
      setFeuilles(lecture.feuilles)
      const premiere = lecture.feuilles[0]
      if (premiere) {
        setNomFeuille(premiere.nom)
        setLigneEntete(1)
        setMappage(devinerMappagePrix(premiere.grille[0] ?? []))
      }
    })
  }

  const importer = (): void => {
    setErreur(null)
    demarrer(async () => {
      const resultat = await actionImporterBasePrix(corps as string[][], mappage, {
        premiereLigne: ligneEntete + 1,
      })
      if (resultat.erreur) {
        setErreur(resultat.erreur)
        return
      }
      setResume(
        `${resultat.crees ?? 0} prix ajoutés, ${resultat.ignores ?? 0} ligne(s) vide(s) ignorée(s).`,
      )
      setAnomalies(resultat.anomalies ?? [])
      setFeuilles([])
      routeur.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {erreur ? (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      {resume ? (
        <p style={{ color: 'var(--color-accent-encre)', fontWeight: 500, margin: 0 }} role="status">
          {resume}
        </p>
      ) : null}
      {anomalies.length > 0 ? (
        <ul className="attenue" style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
          {anomalies.slice(0, 10).map((anomalie, index) => (
            <li key={index}>
              Ligne {anomalie.ligne} : {anomalie.message}
            </li>
          ))}
        </ul>
      ) : null}

      <form action={lire} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="champ" style={{ flex: 1, minWidth: 240 }}>
          <label htmlFor="fichier-prix">Classeur Excel</label>
          <input id="fichier-prix" name="fichier" type="file" accept=".xlsx,.xlsm" required />
        </div>
        <button type="submit" className="bouton" disabled={enCours}>
          {enCours ? 'Lecture…' : 'Lire le fichier'}
        </button>
      </form>

      {feuilles.length > 0 ? (
        <>
          <div className="grille-champs">
            <div className="champ">
              <label htmlFor="feuille-prix">Feuille</label>
              <select
                id="feuille-prix"
                value={nomFeuille}
                onChange={(e) => {
                  setNomFeuille(e.target.value)
                  const cible = feuilles.find((f) => f.nom === e.target.value)
                  if (cible) setMappage(devinerMappagePrix(cible.grille[ligneEntete - 1] ?? []))
                }}
              >
                {feuilles.map((f) => (
                  <option key={f.nom} value={f.nom}>
                    {f.nom} ({f.grille.length} lignes)
                  </option>
                ))}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="entete-prix">Ligne d’en-tête</label>
              <input
                id="entete-prix"
                type="number"
                min={1}
                className="mono"
                value={ligneEntete}
                onChange={(e) => {
                  const numero = Math.max(1, Number(e.target.value) || 1)
                  setLigneEntete(numero)
                  setMappage(devinerMappagePrix(grille[numero - 1] ?? []))
                }}
              />
            </div>
          </div>

          <div className="grille-champs">
            {COLONNES_BASE_PRIX.map((colonne) => (
              <div className="champ" key={colonne}>
                <label htmlFor={`prix-col-${colonne}`}>
                  {LIBELLES[colonne]}
                  {OBLIGATOIRES.includes(colonne) ? ' *' : ''}
                </label>
                <select
                  id={`prix-col-${colonne}`}
                  value={mappage[colonne] ?? ''}
                  onChange={(e) =>
                    setMappage((precedent) => {
                      const copie = { ...precedent }
                      if (e.target.value === '') delete copie[colonne]
                      else copie[colonne] = Number(e.target.value)
                      return copie
                    })
                  }
                >
                  <option value="">— non importée —</option>
                  {entete.map((titre, index) => (
                    <option key={index} value={index}>
                      {titre || `Colonne ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="attenue" style={{ fontSize: 13 }}>
              {corps.length} ligne(s) seront examinées.
              {manquantes.length > 0
                ? ` Colonnes obligatoires non renseignées : ${manquantes.map((c) => LIBELLES[c]).join(', ')}.`
                : ''}
            </span>
            <button
              type="button"
              className="bouton bouton-primaire"
              onClick={importer}
              disabled={enCours || manquantes.length > 0 || corps.length === 0}
              style={{ marginLeft: 'auto' }}
            >
              {enCours ? 'Import…' : 'Importer dans ma base'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
