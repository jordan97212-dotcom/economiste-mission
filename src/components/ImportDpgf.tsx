'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  analyserDpgf,
  devinerMappageDpgf,
  COLONNES_DPGF,
  type ColonneDpgf,
  type MappageDpgf,
} from '../application/import/analyse-dpgf'
import {
  actionLireClasseur,
  actionImporterDpgf,
  type FeuilleLue,
} from '../app/missions/actions-import'
import { formaterPrixUnitaire, LIBELLES_UNITE } from '../lib/format'

const LIBELLES_COLONNE: Record<ColonneDpgf, string> = {
  code: 'Code',
  designation: 'Désignation',
  unite: 'Unité',
  quantite: 'Quantité',
  prixUnitaireHt: 'Prix unitaire HT',
}

const OBLIGATOIRES: ColonneDpgf[] = ['designation']

interface Lot {
  readonly id: string
  readonly numero: string
  readonly intitule: string
  readonly nbPostes: number
}

export function ImportDpgf({
  missionId,
  precisionPu,
  lots,
}: {
  missionId: string
  precisionPu: number
  lots: readonly Lot[]
}) {
  const routeur = useRouter()
  const [enCours, demarrer] = useTransition()

  const [feuilles, setFeuilles] = useState<readonly FeuilleLue[]>([])
  const [nomFeuille, setNomFeuille] = useState('')
  const [ligneEntete, setLigneEntete] = useState(1)
  const [mappage, setMappage] = useState<MappageDpgf>({})
  const [lotId, setLotId] = useState(lots[0]?.id ?? '')
  const [remplacer, setRemplacer] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [tronque, setTronque] = useState(false)

  const feuille = feuilles.find((f) => f.nom === nomFeuille)
  const grille = feuille?.grille ?? []

  const entete = grille[ligneEntete - 1] ?? []
  const corps = useMemo(() => grille.slice(ligneEntete), [grille, ligneEntete])

  const apercu = useMemo(() => {
    if (mappage.designation === undefined || corps.length === 0) return null
    try {
      return analyserDpgf(corps, mappage, { premiereLigne: ligneEntete + 1, precisionPu })
    } catch {
      return null
    }
  }, [corps, mappage, ligneEntete, precisionPu])

  const bloquantes = apercu?.anomalies.filter((a) => a.severite === 'bloquante') ?? []
  const avertissements = apercu?.anomalies.filter((a) => a.severite === 'avertissement') ?? []

  const choisirFichier = (donnees: FormData): void => {
    setErreur(null)
    setMessage(null)
    demarrer(async () => {
      const lecture = await actionLireClasseur(donnees)
      if (lecture.erreur) {
        setErreur(lecture.erreur)
        return
      }
      setFeuilles(lecture.feuilles)
      setTronque(lecture.tronque)
      const premiere = lecture.feuilles[0]
      if (premiere) {
        setNomFeuille(premiere.nom)
        const ligne = devinerLigneEntete(premiere.grille)
        setLigneEntete(ligne)
        setMappage(devinerMappageDpgf(premiere.grille[ligne - 1] ?? []))
      }
    })
  }

  const changerFeuille = (nom: string): void => {
    setNomFeuille(nom)
    const cible = feuilles.find((f) => f.nom === nom)
    if (!cible) return
    const ligne = devinerLigneEntete(cible.grille)
    setLigneEntete(ligne)
    setMappage(devinerMappageDpgf(cible.grille[ligne - 1] ?? []))
  }

  const changerLigneEntete = (numero: number): void => {
    setLigneEntete(numero)
    setMappage(devinerMappageDpgf(grille[numero - 1] ?? []))
  }

  const importer = (): void => {
    setErreur(null)
    demarrer(async () => {
      const resultat = await actionImporterDpgf(missionId, lotId, corps as string[][], mappage, {
        premiereLigne: ligneEntete + 1,
        remplacer,
      })
      if (resultat.erreur) {
        setErreur(resultat.erreur)
        return
      }
      setMessage(
        `${resultat.nbOuvrages} ouvrage(s) et ${resultat.nbSousLots} sous-lot(s) importés.`,
      )
      routeur.push(`/missions/${missionId}/chiffrage`)
      routeur.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {erreur ? (
        <p className="message-erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      {message ? (
        <p className="carte carte-corps" style={{ color: 'var(--color-accent-encre)' }} role="status">
          {message}
        </p>
      ) : null}

      <section className="carte">
        <div className="carte-entete">
          <h2>1 · Le fichier</h2>
          {feuilles.length > 0 ? <span className="etiquette etiquette-accent">chargé</span> : null}
        </div>
        <div className="carte-corps">
          <form action={choisirFichier} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="champ" style={{ flex: 1, minWidth: 260 }}>
              <label htmlFor="fichier">Classeur Excel du DPGF</label>
              <input id="fichier" name="fichier" type="file" accept=".xlsx,.xlsm" required />
            </div>
            <button type="submit" className="bouton bouton-primaire" disabled={enCours}>
              {enCours ? 'Lecture…' : 'Lire le fichier'}
            </button>
          </form>
          {tronque ? (
            <p className="attenue" style={{ fontSize: 13, marginTop: 10, marginBottom: 0 }}>
              Le fichier dépasse la limite de lecture : seules les premières lignes ont été chargées.
            </p>
          ) : null}
        </div>
      </section>

      {feuilles.length > 0 ? (
        <section className="carte">
          <div className="carte-entete">
            <h2>2 · La feuille et la ligne d’en-tête</h2>
          </div>
          <div className="carte-corps">
            <div className="grille-champs" style={{ marginBottom: 16 }}>
              <div className="champ">
                <label htmlFor="feuille">Feuille</label>
                <select id="feuille" value={nomFeuille} onChange={(e) => changerFeuille(e.target.value)}>
                  {feuilles.map((f) => (
                    <option key={f.nom} value={f.nom}>
                      {f.nom} ({f.grille.length} lignes)
                    </option>
                  ))}
                </select>
              </div>
              <div className="champ">
                <label htmlFor="ligneEntete">Ligne d’en-tête</label>
                <input
                  id="ligneEntete"
                  type="number"
                  min={1}
                  max={Math.max(grille.length, 1)}
                  value={ligneEntete}
                  className="mono"
                  onChange={(e) => changerLigneEntete(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>

            <p className="surtitre" style={{ marginBottom: 6 }}>
              Aperçu des premières lignes du fichier
            </p>
            <div className="defilement">
              <table className="tableau" style={{ fontSize: 12.5 }}>
                <tbody>
                  {grille.slice(0, Math.max(ligneEntete + 3, 6)).map((ligne, index) => (
                    <tr
                      key={index}
                      style={
                        index === ligneEntete - 1
                          ? { background: 'var(--color-accent-clair)', fontWeight: 600 }
                          : undefined
                      }
                    >
                      <td className="mono attenue" style={{ width: 40 }}>
                        {index + 1}
                      </td>
                      {ligne.slice(0, 8).map((cellule, colonne) => (
                        <td key={colonne} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cellule}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {feuilles.length > 0 ? (
        <section className="carte">
          <div className="carte-entete">
            <h2>3 · Le rôle de chaque colonne</h2>
            <span className="attenue" style={{ fontSize: 13 }}>
              Proposé automatiquement, à vous de corriger.
            </span>
          </div>
          <div className="carte-corps">
            <div className="grille-champs">
              {COLONNES_DPGF.map((colonne) => (
                <div className="champ" key={colonne}>
                  <label htmlFor={`col-${colonne}`}>
                    {LIBELLES_COLONNE[colonne]}
                    {OBLIGATOIRES.includes(colonne) ? ' *' : ''}
                  </label>
                  <select
                    id={`col-${colonne}`}
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
                        {colonneExcel(index)} · {titre || '(vide)'}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {apercu ? (
        <section className="carte">
          <div className="carte-entete">
            <h2>4 · Ce qui sera importé</h2>
            <span className="etiquette">
              {apercu.nbOuvrages} ouvrages · {apercu.nbSousLots} sous-lots
            </span>
          </div>

          {bloquantes.length > 0 ? (
            <div className="carte-corps" style={{ borderBottom: '1px solid var(--color-filet)' }}>
              <p className="message-erreur" style={{ marginTop: 0 }}>
                {bloquantes.length} ligne(s) empêchent l’import. Corrigez le fichier ou le mappage.
              </p>
              <ul style={{ fontSize: 13.5, margin: 0, paddingLeft: 18 }}>
                {bloquantes.slice(0, 10).map((anomalie, index) => (
                  <li key={index}>
                    Ligne {anomalie.ligne} : {anomalie.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {avertissements.length > 0 ? (
            <div className="carte-corps" style={{ borderBottom: '1px solid var(--color-filet)' }}>
              <p className="surtitre" style={{ marginBottom: 6 }}>
                {avertissements.length} point(s) à vérifier, sans blocage
              </p>
              <ul className="attenue" style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
                {avertissements.slice(0, 8).map((anomalie, index) => (
                  <li key={index}>
                    Ligne {anomalie.ligne} : {anomalie.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="defilement">
            <table className="tableau" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Code</th>
                  <th>Désignation</th>
                  <th>Unité</th>
                  <th style={{ textAlign: 'right' }}>Quantité</th>
                  <th style={{ textAlign: 'right' }}>PU base HT</th>
                </tr>
              </thead>
              <tbody>
                {apercu.lignes.slice(0, 25).map((ligne) => (
                  <tr key={ligne.ligne} className={ligne.type === 'SOUS_LOT' ? 'ligne-sous-lot' : undefined}>
                    <td className="mono attenue">{ligne.ligne}</td>
                    <td className="mono">{ligne.code ?? ''}</td>
                    <td style={{ fontWeight: ligne.type === 'SOUS_LOT' ? 600 : 400 }}>
                      {ligne.designation}
                    </td>
                    <td>{ligne.unite ? LIBELLES_UNITE[ligne.unite] : ''}</td>
                    <td className="chiffre">{ligne.quantite?.replace('.', ',') ?? ''}</td>
                    <td className="chiffre">
                      {ligne.prixUnitaireHt ? formaterPrixUnitaire(ligne.prixUnitaireHt, precisionPu) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {apercu.lignes.length > 25 ? (
            <p className="attenue" style={{ fontSize: 13, padding: '10px 18px', margin: 0 }}>
              {apercu.lignes.length - 25} ligne(s) supplémentaires non affichées.
            </p>
          ) : null}
        </section>
      ) : null}

      {feuilles.length > 0 ? (
        <section className="carte">
          <div className="carte-entete">
            <h2>5 · Le lot de destination</h2>
          </div>
          <div className="carte-corps" style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="champ" style={{ minWidth: 280 }}>
              <label htmlFor="lot">Lot</label>
              <select id="lot" value={lotId} onChange={(e) => setLotId(e.target.value)}>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.numero} · {lot.intitule} ({lot.nbPostes} postes)
                  </option>
                ))}
              </select>
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={remplacer}
                onChange={(e) => setRemplacer(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Remplacer le contenu actuel du lot
            </label>

            <button
              type="button"
              className="bouton bouton-primaire"
              onClick={importer}
              disabled={enCours || !lotId || !apercu || bloquantes.length > 0}
              style={{ marginLeft: 'auto' }}
            >
              {enCours ? 'Import en cours…' : 'Importer dans le lot'}
            </button>
          </div>
          {lots.length === 0 ? (
            <p className="vide">Créez d’abord un lot sur la fiche de mission.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

/** Repère la ligne qui ressemble le plus à un en-tête de DPGF. */
function devinerLigneEntete(grille: readonly (readonly string[])[]): number {
  let meilleure = 1
  let meilleurScore = -1

  for (let index = 0; index < Math.min(grille.length, 20); index += 1) {
    const ligne = grille[index] ?? []
    const mappage = devinerMappageDpgf(ligne)
    const score = Object.keys(mappage).length
    if (score > meilleurScore) {
      meilleurScore = score
      meilleure = index + 1
    }
  }

  return meilleure
}

/** Nom de colonne façon tableur : 0 donne A, 26 donne AA. */
function colonneExcel(index: number): string {
  let reste = index
  let nom = ''
  do {
    nom = String.fromCharCode(65 + (reste % 26)) + nom
    reste = Math.floor(reste / 26) - 1
  } while (reste >= 0)
  return nom
}
