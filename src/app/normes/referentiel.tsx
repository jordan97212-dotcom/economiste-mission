'use client'

import { useActionState } from 'react'
import {
  actionAjouterNorme,
  actionAmorcer,
  actionConfirmerEnVigueur,
  actionModifierStatut,
  actionSupprimerNorme,
  type EtatNorme,
} from './actions'

export interface NormeAffichee {
  readonly id: string
  readonly reference: string
  readonly titre: string | null
  readonly statut: 'EN_VIGUEUR' | 'ANNULEE' | 'REMPLACEE' | 'PROJET'
  readonly remplaceePar: string | null
  readonly source: string | null
  readonly commentaire: string | null
  readonly dateEdition: string | null
  readonly dateVerification: string | null
  readonly aRevoir: boolean
}

const LIBELLES_STATUT: Record<NormeAffichee['statut'], string> = {
  EN_VIGUEUR: 'en vigueur',
  ANNULEE: 'annulée',
  REMPLACEE: 'remplacée',
  PROJET: 'projet',
}

function enFrancais(iso: string | null): string {
  if (!iso) return '—'
  const [annee, mois, jour] = iso.split('-')
  return `${jour}/${mois}/${annee}`
}

/**
 * Le référentiel des normes — SPEC_APP_ECONOMISTE.md §5.4.
 *
 * L'écran ne promet jamais une mise à jour qu'il ne peut pas tenir : il dit
 * d'où vient chaque statut et depuis quand il n'a pas été revu.
 */
export function Referentiel({
  normes,
  nbARevoir,
  nbMissions,
  delaiMois,
}: {
  normes: readonly NormeAffichee[]
  nbARevoir: number
  nbMissions: number
  delaiMois: number
}) {
  const [etatAjout, ajouter] = useActionState<EtatNorme, FormData>(actionAjouterNorme, {})
  const [etatAmorcage, amorcer] = useActionState<EtatNorme, FormData>(
    async (precedent) => actionAmorcer(precedent),
    {},
  )

  const annulees = normes.filter((n) => n.statut === 'ANNULEE' || n.statut === 'REMPLACEE').length

  return (
    <>
      <section className="carte" style={{ marginBottom: 22 }}>
        <div className="carte-entete">
          <h2>Tenir le référentiel à jour</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {annulees > 0 ? (
              <span className="etiquette etiquette-alerte">
                {annulees} à ne plus citer telle quelle
              </span>
            ) : null}
            {nbARevoir > 0 ? (
              <span className="etiquette etiquette-alerte">{nbARevoir} à revérifier</span>
            ) : null}
            {annulees === 0 && nbARevoir === 0 && normes.length > 0 ? (
              <span className="etiquette etiquette-accent">référentiel à jour</span>
            ) : null}
          </div>
        </div>

        <div className="carte-corps">
          <p style={{ marginTop: 0, fontSize: 14, maxWidth: '74ch' }}>
            L’application ne télécharge aucune norme, et c’est délibéré : le contenu des DTU est
            vendu par l’AFNOR et le CSTB, et leur catalogue est protégé par le droit des bases de
            données. Aspirer leur site vous exposerait, vous. Ce que l’application fait à votre
            place, c’est le travail pénible : <strong>repérer les normes que vos textes citent</strong>,
            se souvenir de ce que vous avez constaté et quand, et vous arrêter avant qu’un DTU
            annulé parte dans un CCTP signé.
          </p>

          <p className="attenue" style={{ fontSize: 13.5, maxWidth: '74ch' }}>
            Un statut confirmé il y a plus de {delaiMois} mois est signalé à revérifier : une norme
            peut avoir été annulée entre-temps sans que personne ne vous prévienne.
          </p>

          <form action={amorcer} style={{ marginTop: 14 }}>
            <button type="submit" className="bouton">
              Relever les normes citées dans mes {nbMissions} opération(s)
            </button>
            {etatAmorcage.succes ? (
              <p className="attenue" style={{ fontSize: 13.5, marginTop: 8 }}>
                {etatAmorcage.succes}
              </p>
            ) : null}
            {etatAmorcage.erreur ? (
              <p className="message-erreur" style={{ marginTop: 8 }} role="alert">
                {etatAmorcage.erreur}
              </p>
            ) : null}
          </form>
          <p className="attenue" style={{ fontSize: 13, marginTop: 6, maxWidth: '74ch' }}>
            Les références relevées arrivent <em>sans statut vérifié</em> : elles resteront
            signalées tant que vous ne les aurez pas confirmées une par une. L’application ne
            présume jamais qu’une norme est en vigueur.
          </p>
        </div>
      </section>

      <section className="carte" style={{ marginBottom: 22 }}>
        <div className="carte-entete">
          <h2>Ajouter une référence</h2>
        </div>
        <form action={ajouter} className="carte-corps">
          <div className="grille-champs">
            <div className="champ">
              <label htmlFor="reference">Référence</label>
              <input id="reference" name="reference" required placeholder="NF DTU 20.1" className="mono" />
            </div>
            <div className="champ">
              <label htmlFor="titre">Titre</label>
              <input id="titre" name="titre" placeholder="Ouvrages en maçonnerie de petits éléments" />
            </div>
            <div className="champ">
              <label htmlFor="statut">Statut constaté</label>
              <select id="statut" name="statut" defaultValue="EN_VIGUEUR">
                <option value="EN_VIGUEUR">En vigueur</option>
                <option value="ANNULEE">Annulée</option>
                <option value="REMPLACEE">Remplacée</option>
                <option value="PROJET">Projet</option>
              </select>
            </div>
            <div className="champ">
              <label htmlFor="remplaceePar">Remplacée par</label>
              <input id="remplaceePar" name="remplaceePar" placeholder="NF DTU 20.1 P1-1" className="mono" />
            </div>
            <div className="champ">
              <label htmlFor="dateEdition">Édition</label>
              <input id="dateEdition" name="dateEdition" type="date" />
            </div>
            <div className="champ">
              <label htmlFor="source">Où l’avez-vous constaté ?</label>
              <input id="source" name="source" placeholder="Catalogue AFNOR consulté le…" />
            </div>
          </div>
          <div className="champ" style={{ marginTop: 12 }}>
            <label htmlFor="commentaire">Note</label>
            <input id="commentaire" name="commentaire" placeholder="Pourquoi vous la citez, ce que vous avez vérifié" />
          </div>

          {etatAjout.erreur ? (
            <p className="message-erreur" style={{ marginTop: 12 }} role="alert">
              {etatAjout.erreur}
            </p>
          ) : null}

          <div style={{ marginTop: 14 }}>
            <button type="submit" className="bouton bouton-primaire">
              Ajouter au référentiel
            </button>
          </div>
        </form>
      </section>

      <section className="carte">
        <div className="carte-entete">
          <h2>Référentiel</h2>
          <span className="attenue" style={{ fontSize: 13 }}>
            {normes.length} référence(s)
          </span>
        </div>

        {normes.length === 0 ? (
          <p className="vide">
            Rien pour l’instant. Le relevé ci-dessus part de vos propres textes : c’est le plus
            court chemin pour constituer ce référentiel.
          </p>
        ) : (
          <div className="defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Titre</th>
                  <th>Statut</th>
                  <th>Vérifié le</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {normes.map((norme) => (
                  <LigneNorme key={norme.id} norme={norme} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="carte-corps" style={{ borderTop: '1px solid var(--color-filet)' }}>
          <p className="attenue" style={{ fontSize: 13, margin: 0, maxWidth: '76ch' }}>
            L’application ne réécrit jamais un texte de CCTP à votre place. Remplacer une référence
            change ce que le marché prescrit : c’est une décision technique, elle vous appartient.
          </p>
        </div>
      </section>
    </>
  )
}

function LigneNorme({ norme }: { norme: NormeAffichee }) {
  const [etat, modifier] = useActionState<EtatNorme, FormData>(actionModifierStatut, {})
  const [, confirmer] = useActionState<EtatNorme, FormData>(actionConfirmerEnVigueur, {})
  const [, supprimer] = useActionState<EtatNorme, FormData>(actionSupprimerNorme, {})

  const alerte = norme.statut === 'ANNULEE' || norme.statut === 'REMPLACEE'

  return (
    <tr>
      <td className="mono" style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
        {norme.reference}
        {norme.remplaceePar ? (
          <div className="attenue" style={{ fontSize: 12, fontWeight: 400 }}>
            → {norme.remplaceePar}
          </div>
        ) : null}
      </td>
      <td style={{ fontSize: 13.5 }}>
        {norme.titre ?? <span className="attenue">—</span>}
        {norme.commentaire ? (
          <div className="attenue" style={{ fontSize: 12 }}>{norme.commentaire}</div>
        ) : null}
      </td>
      <td>
        <form action={modifier} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="hidden" name="id" value={norme.id} />
          <input type="hidden" name="remplaceePar" value={norme.remplaceePar ?? ''} />
          <select
            name="statut"
            defaultValue={norme.statut}
            aria-label={`Statut de ${norme.reference}`}
            style={{ width: 'auto', minWidth: 132 }}
          >
            <option value="EN_VIGUEUR">En vigueur</option>
            <option value="ANNULEE">Annulée</option>
            <option value="REMPLACEE">Remplacée</option>
            <option value="PROJET">Projet</option>
          </select>
          <button type="submit" className="bouton bouton-discret">
            Noter
          </button>
        </form>
        {alerte ? (
          <span className="etiquette etiquette-alerte" style={{ marginTop: 6 }}>
            {LIBELLES_STATUT[norme.statut]}
          </span>
        ) : null}
        {etat.erreur ? (
          <p className="message-erreur" style={{ marginTop: 6 }} role="alert">
            {etat.erreur}
          </p>
        ) : null}
      </td>
      <td className="mono attenue" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
        {enFrancais(norme.dateVerification)}
        {norme.aRevoir ? (
          <div>
            <span className="etiquette etiquette-alerte" style={{ marginTop: 4 }}>
              à revérifier
            </span>
          </div>
        ) : null}
      </td>
      <td className="attenue" style={{ fontSize: 12.5 }}>
        {norme.source ?? '—'}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {norme.aRevoir ? (
          <form action={confirmer} style={{ display: 'inline' }}>
            <input type="hidden" name="id" value={norme.id} />
            <button type="submit" className="bouton bouton-discret" title="Daté de ce jour">
              Toujours en vigueur
            </button>
          </form>
        ) : null}
        <form action={supprimer} style={{ display: 'inline' }}>
          <input type="hidden" name="id" value={norme.id} />
          <button type="submit" className="bouton bouton-danger">
            Retirer
          </button>
        </form>
      </td>
    </tr>
  )
}
