'use client'

import { useActionState, useEffect, useState } from 'react'
import { actionAnalyser, actionImporter, type EtatAnalyse, type EtatImport } from './actions'

/**
 * Import d'un CCTP Word dans la bibliothèque — §5.4.
 *
 * Deux temps volontairement séparés. On lit le fichier et on montre ce qu'on a
 * compris ; puis on n'écrit que ce qui a été coché. Un import de trente articles
 * qu'on n'a pas relus ne vaut rien.
 */

interface CorpsEtat {
  readonly id: string
  readonly code: string
  readonly libelle: string
}

interface Article {
  readonly index: number
  readonly intitule: string
  readonly contenu: string
  readonly niveau: number
  readonly nbLignes: number
}

const APERCU_CARACTERES = 220

export function ImportWord({ corpsEtats }: { corpsEtats: readonly CorpsEtat[] }) {
  const [etatAnalyse, analyser, analyseEnCours] = useActionState<EtatAnalyse, FormData>(
    actionAnalyser,
    {},
  )
  const [etatImport, importer, importEnCours] = useActionState<EtatImport, FormData>(
    actionImporter,
    {},
  )

  const analyse = etatAnalyse.analyse
  const [coches, setCoches] = useState<Set<number>>(() => new Set())
  const [intitules, setIntitules] = useState<Record<number, string>>({})
  const [corpsEtatId, setCorpsEtatId] = useState('')
  const [deplie, setDeplie] = useState<number | null>(null)
  const [nomChoisi, setNomChoisi] = useState<string | null>(null)

  // Une nouvelle analyse remet la sélection à plat : tout est coché d'entrée,
  // puisque l'économiste a choisi d'importer ce document.
  useEffect(() => {
    if (!analyse) return
    setCoches(new Set(analyse.articles.map((a) => a.index)))
    setIntitules({})
    setDeplie(null)
  }, [analyse])

  const basculer = (index: number): void => {
    setCoches((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(index)) suivant.delete(index)
      else suivant.add(index)
      return suivant
    })
  }

  const intituleDe = (article: Article): string => intitules[article.index] ?? article.intitule

  const retenus: readonly Article[] = analyse
    ? analyse.articles.filter((a) => coches.has(a.index))
    : []

  const charge = JSON.stringify(
    retenus.map((a) => ({ intitule: intituleDe(a), contenu: a.contenu })),
  )

  return (
    <>
      <section className="carte" style={{ marginBottom: 22 }}>
        <div className="carte-entete">
          <h2>Choisir un document</h2>
          {analyse ? (
            <span className="attenue" style={{ fontSize: 13 }}>
              {analyse.nomFichier} · {analyse.nbParagraphes} paragraphe(s)
            </span>
          ) : null}
        </div>
        <div className="carte-corps">
          <form action={analyser} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Le sélecteur natif écrit « Choose File » dans la langue du
                navigateur, pas celle de la page. On le cache et on rend nous-mêmes
                le libellé et le nom du fichier choisi. */}
            <label className="bouton" style={{ cursor: 'pointer', margin: 0 }}>
              Choisir un fichier…
              <input
                type="file"
                name="fichier"
                accept=".docx"
                required
                onChange={(e) => setNomChoisi(e.target.files?.[0]?.name ?? null)}
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  opacity: 0,
                  overflow: 'hidden',
                }}
              />
            </label>
            <span className="attenue" style={{ fontSize: 13.5 }}>
              {nomChoisi ?? 'Aucun fichier choisi'}
            </span>
            <button type="submit" className="bouton bouton-primaire" disabled={analyseEnCours}>
              {analyseEnCours ? 'Lecture…' : 'Lire le document'}
            </button>
          </form>
          {etatAnalyse.erreur ? (
            <p className="message-erreur" role="alert" style={{ marginTop: 12 }}>
              {etatAnalyse.erreur}
            </p>
          ) : null}
          <p className="attenue" style={{ fontSize: 13, marginTop: 12, marginBottom: 0, maxWidth: '76ch' }}>
            Format <code>.docx</code> uniquement. Un <code>.doc</code> d’avant 2007 se réenregistre
            depuis Word. Le PDF n’est pas accepté : sa structure est perdue, et un import approximatif
            de vos prescriptions ne rendrait pas service.
          </p>
        </div>
      </section>

      {analyse?.motifNonDecoupe === 'document_vide' ? (
        <p className="vide">Ce document ne contient aucun texte.</p>
      ) : null}

      {analyse?.motifNonDecoupe === 'aucun_titre' ? (
        <section className="carte" style={{ marginBottom: 22 }}>
          <div className="carte-entete">
            <h2>Aucun titre reconnu</h2>
          </div>
          <div className="carte-corps">
            <p style={{ marginTop: 0, fontSize: 14, maxWidth: '76ch' }}>
              Ce document n’utilise ni styles de titre Word, ni numérotation du type « 2.1.3 ». Il
              n’y a donc pas de découpage possible en articles. Le contenu n’est pas perdu pour
              autant : il peut être versé en une seule trame, que vous découperez ensuite à la main.
            </p>
            <form action={importer}>
              <input type="hidden" name="type" value="CCTP" />
              <input type="hidden" name="corpsEtatId" value={corpsEtatId} />
              <input
                type="hidden"
                name="articles"
                value={JSON.stringify([
                  { intitule: analyse.nomFichier.replace(/\.docx$/i, ''), contenu: analyse.texteComplet },
                ])}
              />
              <button type="submit" className="bouton" disabled={importEnCours}>
                Importer le document en une seule trame
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {analyse && analyse.articles.length > 0 ? (
        <section className="carte">
          <div className="carte-entete">
            <h2>{analyse.articles.length} article(s) trouvé(s)</h2>
            <span className="attenue" style={{ fontSize: 13 }}>{coches.size} coché(s)</span>
          </div>

          <div className="carte-corps">
            <p style={{ marginTop: 0, fontSize: 14, maxWidth: '78ch' }}>
              Un article est un titre qui porte des prescriptions. Les titres de chapitre, qui ne
              contiennent que d’autres titres, ne sont pas proposés — ils n’auraient aucun contenu.
              Relisez les intitulés avant d’importer : ils deviendront vos points d’entrée.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'block' }}>
                Corps d’état
                <select value={corpsEtatId} onChange={(e) => setCorpsEtatId(e.target.value)}>
                  <option value="">— généralités, sans corps d’état —</option>
                  {corpsEtats.map((corps) => (
                    <option key={corps.id} value={corps.id}>
                      {corps.code} · {corps.libelle}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="bouton bouton-discret"
                onClick={() => setCoches(new Set(analyse.articles.map((a) => a.index)))}
              >
                Tout cocher
              </button>
              <button
                type="button"
                className="bouton bouton-discret"
                onClick={() => setCoches(new Set())}
              >
                Tout décocher
              </button>
            </div>
          </div>

          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Intitulé de la trame</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Lignes</th>
                  <th>Début du texte</th>
                </tr>
              </thead>
              <tbody>
                {analyse.articles.map((article) => (
                  <tr key={article.index}>
                    <td>
                      <input
                        type="checkbox"
                        checked={coches.has(article.index)}
                        onChange={() => basculer(article.index)}
                        aria-label={`Importer ${article.intitule}`}
                        style={{ width: 'auto' }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={intituleDe(article)}
                        onChange={(e) =>
                          setIntitules((p) => ({ ...p, [article.index]: e.target.value }))
                        }
                        aria-label={`Intitulé de l’article ${article.index + 1}`}
                      />
                    </td>
                    <td className="chiffre attenue">{article.nbLignes}</td>
                    <td style={{ fontSize: 13, maxWidth: 460 }}>
                      <span className="attenue" style={{ whiteSpace: 'pre-wrap' }}>
                        {deplie === article.index
                          ? article.contenu
                          : article.contenu.slice(0, APERCU_CARACTERES)}
                        {article.contenu.length > APERCU_CARACTERES && deplie !== article.index
                          ? '…'
                          : ''}
                      </span>
                      {article.contenu.length > APERCU_CARACTERES ? (
                        <button
                          type="button"
                          className="bouton bouton-discret"
                          style={{ marginLeft: 8 }}
                          onClick={() => setDeplie(deplie === article.index ? null : article.index)}
                        >
                          {deplie === article.index ? 'Replier' : 'Tout voir'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            action={importer}
            className="carte-corps"
            style={{
              borderTop: '1px solid var(--color-filet)',
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <input type="hidden" name="type" value="CCTP" />
            <input type="hidden" name="corpsEtatId" value={corpsEtatId} />
            <input type="hidden" name="articles" value={charge} />
            <button
              type="submit"
              className="bouton bouton-primaire"
              disabled={coches.size === 0 || importEnCours}
            >
              {importEnCours
                ? 'Import en cours…'
                : coches.size === 0
                  ? 'Importer les articles cochés'
                  : `Importer ${coches.size} article(s)`}
            </button>
            {etatImport.erreur ? (
              <p className="message-erreur" role="alert" style={{ margin: 0 }}>
                {etatImport.erreur}
              </p>
            ) : null}
            {etatImport.succes ? (
              <p style={{ margin: 0, fontSize: 13.5 }}>
                {etatImport.succes}{' '}
                <a href="/trames">Voir la bibliothèque</a>
              </p>
            ) : null}
          </form>
        </section>
      ) : null}
    </>
  )
}
