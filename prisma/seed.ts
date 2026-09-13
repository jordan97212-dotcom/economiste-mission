/**
 * Jeu initial — nomenclature TCE de SPEC_APP_ECONOMISTE.md §4.
 *
 * Les 23 corps d'état de la spécification, dans l'ordre où elle les donne.
 * La table est éditable, réordonnable et masquable : la note climat tropical
 * du §4 se règle depuis l'application, pas ici. En Martinique le lot 16 est
 * utilisé pour la climatisation seule, et rien n'oblige à garder ce libellé.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export const NOMENCLATURE_TCE: readonly { code: string; libelle: string }[] = [
  { code: '01', libelle: 'VRD / Terrassement' },
  { code: '02', libelle: 'Gros œuvre — Maçonnerie' },
  { code: '03', libelle: 'Charpente' },
  { code: '04', libelle: 'Couverture' },
  { code: '05', libelle: 'Étanchéité' },
  { code: '06', libelle: 'Menuiseries extérieures' },
  { code: '07', libelle: 'Menuiseries intérieures' },
  { code: '08', libelle: 'Métallerie / Serrurerie' },
  { code: '09', libelle: 'Cloisons — Doublages' },
  { code: '10', libelle: 'Plâtrerie' },
  { code: '11', libelle: 'Faux-plafonds' },
  { code: '12', libelle: 'Revêtements de sols durs' },
  { code: '13', libelle: 'Revêtements de sols souples' },
  { code: '14', libelle: 'Peinture' },
  { code: '15', libelle: 'Plomberie sanitaire' },
  { code: '16', libelle: 'Chauffage — Ventilation — Climatisation' },
  { code: '17', libelle: 'Électricité courants forts' },
  { code: '18', libelle: 'Courants faibles' },
  { code: '19', libelle: 'Ascenseurs' },
  { code: '20', libelle: 'Équipements de cuisine' },
  { code: '21', libelle: 'Aménagements extérieurs' },
  { code: '22', libelle: 'Espaces verts' },
  { code: '23', libelle: 'Nettoyage de livraison' },
]

async function main(): Promise<void> {
  const email = process.env.SEED_EMAIL ?? 'economiste@local'

  const utilisateur = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, nom: 'Économiste' },
  })

  // La nomenclature est un point de départ, pas une vérité à réimposer. Le §4
  // la veut éditable, réordonnable et masquable : une fois qu'elle existe, elle
  // appartient à l'économiste. Relancer le jeu initial ne doit donc jamais
  // réécrire un libellé renommé ni un ordre remanié.
  const dejaEnPlace = await prisma.corpsEtat.count({ where: { ownerId: utilisateur.id } })
  if (dejaEnPlace > 0) {
    console.log(
      `Nomenclature déjà en place (${dejaEnPlace} corps d'état pour ${email}) : rien n'est touché.`,
    )
    return
  }

  await prisma.corpsEtat.createMany({
    data: NOMENCLATURE_TCE.map((corps, index) => ({
      ownerId: utilisateur.id,
      code: corps.code,
      libelle: corps.libelle,
      ordre: index,
    })),
  })

  console.log(`Nomenclature TCE en place : ${NOMENCLATURE_TCE.length} corps d'état pour ${email}.`)
}

main()
  .catch((erreur: unknown) => {
    console.error(erreur)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
