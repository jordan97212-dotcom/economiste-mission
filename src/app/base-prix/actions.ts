'use server'

import { revalidatePath } from 'next/cache'
import { contexte } from '../session'
import { creerPrix, modifierPrix, supprimerPrix } from '../../application/prix/service'

export interface EtatPrix {
  readonly erreur?: string
  readonly succes?: string
}

function lire(donnees: FormData, cle: string): string {
  return String(donnees.get(cle) ?? '').trim()
}

export async function actionCreerPrix(
  _precedent: EtatPrix,
  donnees: FormData,
): Promise<EtatPrix> {
  const { db } = await contexte()
  try {
    await creerPrix(db, {
      code: lire(donnees, 'code'),
      designation: lire(donnees, 'designation'),
      unite: lire(donnees, 'unite'),
      corpsEtatId: lire(donnees, 'corpsEtatId') || null,
      prixUnitaireHt: lire(donnees, 'prixUnitaireHt'),
      dateReleve: lire(donnees, 'dateReleve') || null,
      contexteTypeOuvrage: lire(donnees, 'contexteTypeOuvrage') || null,
      contexteNature: lire(donnees, 'contexteNature') || null,
      zone: lire(donnees, 'zone') || null,
    })
  } catch (erreur) {
    return { erreur: erreur instanceof Error ? erreur.message : 'Enregistrement impossible.' }
  }
  revalidatePath('/base-prix')
  return { succes: 'Prix ajouté à votre base.' }
}

export async function actionModifierPrix(donnees: FormData): Promise<void> {
  const { db } = await contexte()
  await modifierPrix(db, lire(donnees, 'id'), {
    code: lire(donnees, 'code'),
    designation: lire(donnees, 'designation'),
    unite: lire(donnees, 'unite'),
    corpsEtatId: lire(donnees, 'corpsEtatId') || null,
    prixUnitaireHt: lire(donnees, 'prixUnitaireHt'),
    dateReleve: lire(donnees, 'dateReleve') || null,
    zone: lire(donnees, 'zone') || null,
  })
  revalidatePath('/base-prix')
}

export async function actionSupprimerPrix(donnees: FormData): Promise<void> {
  const { db } = await contexte()
  await supprimerPrix(db, lire(donnees, 'id'))
  revalidatePath('/base-prix')
}
