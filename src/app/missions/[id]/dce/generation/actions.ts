'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../../../../session'
import { appliquerGeneration } from '../../../../../application/dce/generation'

export interface EtatGeneration {
  readonly erreur?: string
  readonly succes?: string
}

export async function actionAppliquer(
  _precedent: EtatGeneration,
  donnees: FormData,
): Promise<EtatGeneration> {
  const { db } = await contexte()

  const missionId = String(donnees.get('missionId') ?? '')
  if (!missionId) return { erreur: 'Opération introuvable.' }

  // Chaque case cochée porte « posteId:trameId » : la paire voyage ensemble,
  // pour qu'on ne puisse pas appliquer une trame au mauvais ouvrage.
  const choix = donnees
    .getAll('choix')
    .map((valeur) => String(valeur))
    .map((paire) => {
      const separateur = paire.indexOf(':')
      return {
        posteId: paire.slice(0, separateur),
        trameId: paire.slice(separateur + 1),
      }
    })
    .filter((c) => c.posteId !== '' && c.trameId !== '')

  if (choix.length === 0) return { erreur: 'Cochez au moins un ouvrage.' }

  const resultat = await appliquerGeneration(db, missionId, choix)

  revalidatePath(`/missions/${missionId}/dce`)
  revalidatePath(`/missions/${missionId}/dce/generation`)

  if (resultat.echecs.length > 0) {
    return {
      erreur: `${resultat.nbAppliquees} texte(s) écrit(s), mais ${resultat.echecs.length} en échec : ${resultat.echecs[0]}`,
    }
  }

  return { succes: `${resultat.nbAppliquees} texte(s) de CCTP écrit(s) depuis vos trames.` }
}
