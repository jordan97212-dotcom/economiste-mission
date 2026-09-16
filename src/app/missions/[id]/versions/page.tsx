import Link from 'next/link'
import { notFound } from 'next/navigation'
import { contexte } from '../../../session'
import { chargerChiffrage, MissionIntrouvable } from '../../../../application/chiffrage/service'
import { COURANT, comparer, listerVersions } from '../../../../application/chiffrage/versions'
import { formaterDate } from '../../../../lib/format'
import { Comparatif, type ComparaisonAffichee } from './comparatif'

export default async function PageVersions({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ avant?: string; apres?: string }>
}) {
  const { id } = await params
  const { avant, apres } = await searchParams
  const { db } = await contexte()

  let chiffrage
  try {
    chiffrage = await chargerChiffrage(db, id)
  } catch (erreur) {
    if (erreur instanceof MissionIntrouvable) notFound()
    throw erreur
  }

  const versions = await listerVersions(db, id)

  // Par défaut, la question la plus fréquente : où en est-on depuis le dernier
  // figeage ? Donc la dernière version figée, comparée au chiffrage actuel.
  const avantId = avant ?? versions[versions.length - 1]?.id ?? null
  const apresId = apres ?? COURANT

  let comparaison: ComparaisonAffichee | null = null
  let erreurComparaison: string | null = null
  if (avantId) {
    try {
      comparaison = await comparer(db, id, avantId, apresId)
    } catch (erreur) {
      erreurComparaison = erreur instanceof Error ? erreur.message : String(erreur)
    }
  }

  return (
    <main className="contenu">
      <div style={{ marginBottom: 22 }}>
        <p className="surtitre mono">
          {chiffrage.mission.reference} · <Link href={`/missions/${id}`}>Fiche de l’opération</Link>
        </p>
        <h1>Versions du chiffrage</h1>
        <p className="attenue" style={{ fontSize: 14, marginTop: 4, maxWidth: '78ch' }}>
          Figer le chiffrage à chaque phase contractuelle donne un référent stable. La comparaison
          ne dit pas seulement de combien le total a bougé — une soustraction y suffirait — mais
          d’où vient l’écart : des lignes apparues, ou des lignes qui ont changé.
        </p>
      </div>

      {erreurComparaison ? (
        <p className="message-erreur" role="alert" style={{ marginBottom: 18 }}>
          {erreurComparaison}
        </p>
      ) : null}

      <Comparatif
        missionId={id}
        versions={versions.map((version) => ({
          id: version.id,
          phase: version.phase,
          libelle: version.libelle,
          figeLe: formaterDate(version.figeLe.toISOString()),
          montantTceHt: version.montantTceHt,
          nbLots: version.nbLots,
          nbLignes: version.nbLignes,
        }))}
        comparaison={comparaison}
        avantId={avantId ?? ''}
        apresId={apresId}
      />
    </main>
  )
}
