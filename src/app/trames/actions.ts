'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../session'
import {
  creerTrame,
  modifierTrame,
  supprimerTrame,
  type TypeTrame,
} from '../../application/trames/service'

export interface EtatTrame {
  readonly erreur?: string
  readonly succes?: string
}

function lire(donnees: FormData, cle: string): string {
  return String(donnees.get(cle) ?? '').trim()
}

export async function actionCreerTrame(
  _precedent: EtatTrame,
  donnees: FormData,
): Promise<EtatTrame> {
  const { db } = await contexte()
  try {
    await creerTrame(db, {
      type: (lire(donnees, 'type') || 'CCTP') as TypeTrame,
      intitule: lire(donnees, 'intitule'),
      corpsEtatId: lire(donnees, 'corpsEtatId') || null,
      contenu: String(donnees.get('contenu') ?? ''),
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Enregistrement impossible.' }
  }
  revalidatePath('/trames')
  return { succes: 'Trame enregistrée.' }
}

export async function actionModifierTrame(
  _precedent: EtatTrame,
  donnees: FormData,
): Promise<EtatTrame> {
  const { db } = await contexte()
  try {
    await modifierTrame(db, lire(donnees, 'id'), {
      intitule: lire(donnees, 'intitule'),
      corpsEtatId: lire(donnees, 'corpsEtatId') || null,
      contenu: String(donnees.get('contenu') ?? ''),
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Enregistrement impossible.' }
  }
  revalidatePath('/trames')
  return { succes: 'Trame mise à jour.' }
}

export async function actionSupprimerTrame(donnees: FormData): Promise<void> {
  const { db } = await contexte()
  await supprimerTrame(db, lire(donnees, 'id'))
  revalidatePath('/trames')
}
