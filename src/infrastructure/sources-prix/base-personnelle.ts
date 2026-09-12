import { Prisma, type PrismaClient } from '@prisma/client'
import * as PU from '../../domain/money/prix-unitaire'
import { dec, arrondiCommercial } from '../../domain/money/decimal'
import type {
  CritereRecherchePrix,
  Dispersion,
  PropositionPrix,
  SourcePrix,
} from '../../application/ports/source-prix'

/**
 * La seule source de prix du MVP : la base personnelle de l'économiste.
 *
 * La spécification §6 exclut toute base tierce pour l'instant. Ce fichier est
 * l'unique implémentation du port `SourcePrix` ; en brancher une autre plus tard
 * consiste à ajouter un voisin dans ce dossier, sans toucher au métier.
 *
 * La recherche s'appuie sur la colonne `recherche` maintenue par PostgreSQL :
 * dictionnaire français, donc les pluriels et les conjugaisons se rejoignent,
 * et suppression des accents, donc « beton arme » retrouve « Béton armé ».
 */
export const IDENTIFIANT_SOURCE = 'base-personnelle'

const LIMITE_PAR_DEFAUT = 8

interface LigneRecherche {
  id: string
  code: string | null
  designation: string
  unite: string
  prix_unitaire_ht: bigint
  date_releve: Date
  zone: string
  contexte_type_ouvrage: string | null
  contexte_nature: string | null
  famille: string
}

interface LigneDispersion {
  famille: string
  nombre: bigint
  mini: bigint
  maxi: bigint
  mediane: bigint
}

export function creerSourcePrixPersonnelle(client: PrismaClient, ownerId: string): SourcePrix {
  return {
    id: IDENTIFIANT_SOURCE,
    libelle: 'Ma base de prix',

    async rechercher(critere: CritereRecherchePrix): Promise<PropositionPrix[]> {
      const texte = critere.texte.trim()
      if (texte.length < 2) return []

      const limite = Math.min(Math.max(critere.limite ?? LIMITE_PAR_DEFAUT, 1), 50)
      // On ratisse plus large que le nombre de propositions voulu : plusieurs
      // relevés d'un même ouvrage seront ensuite fondus en une seule ligne.
      const limiteBrute = Math.min(limite * 6, 300)
      const filtreCorps = critere.corpsEtatId
        ? Prisma.sql`AND p.corps_etat_id = ${critere.corpsEtatId}`
        : Prisma.empty
      const filtreUnite = critere.unite ? Prisma.sql`AND p.unite = ${critere.unite}::"Unite"` : Prisma.empty

      const lignes = await client.$queryRaw<LigneRecherche[]>`
        SELECT p.id,
               p.code,
               p.designation,
               p.unite::text AS unite,
               p.prix_unitaire_ht,
               p.date_releve,
               p.zone::text AS zone,
               p.contexte_type_ouvrage::text AS contexte_type_ouvrage,
               p.contexte_nature::text AS contexte_nature,
               coalesce(p.code, p.designation) AS famille
        FROM prix_reference p,
             plainto_tsquery('french', public.sans_accent(${texte})) AS requete
        WHERE p.owner_id = ${ownerId}
          AND p.recherche @@ requete
          ${filtreCorps}
          ${filtreUnite}
        ORDER BY ts_rank(p.recherche, requete) DESC, p.date_releve DESC
        LIMIT ${limiteBrute}
      `

      if (lignes.length === 0) return []

      /*
       * Une proposition par ouvrage, pas une par relevé — §5.2 et §5.3 : on
       * montre le prix le plus récent et le mieux classé, et la dispersion des
       * autres relevés dit à elle seule qu'il y en a d'autres. Trois lignes
       * identiques dans la liste n'apprendraient rien.
       */
      const retenues: LigneRecherche[] = []
      const famillesVues = new Set<string>()
      for (const ligne of lignes) {
        if (famillesVues.has(ligne.famille)) continue
        famillesVues.add(ligne.famille)
        retenues.push(ligne)
        if (retenues.length >= limite) break
      }

      // Une seule requête pour la dispersion de toutes les familles trouvées,
      // plutôt qu'une par proposition.
      const familles = [...famillesVues]
      const dispersions = await client.$queryRaw<LigneDispersion[]>`
        SELECT coalesce(code, designation) AS famille,
               count(*) AS nombre,
               min(prix_unitaire_ht) AS mini,
               max(prix_unitaire_ht) AS maxi,
               -- percentile_disc renvoie une valeur réellement observée, donc un
               -- entier exact. percentile_cont passerait par un flottant.
               percentile_disc(0.5) WITHIN GROUP (ORDER BY prix_unitaire_ht) AS mediane
        FROM prix_reference
        WHERE owner_id = ${ownerId}
          AND coalesce(code, designation) IN (${Prisma.join(familles)})
        GROUP BY 1
      `

      const parFamille = new Map(dispersions.map((d) => [d.famille, d]))

      return retenues.map((ligne): PropositionPrix => {
        const stats = parFamille.get(ligne.famille)
        const nbReferences = stats ? Number(stats.nombre) : 1

        let dispersion: Dispersion | null = null
        if (stats && nbReferences > 1) {
          const mediane = dec(stats.mediane.toString())
          dispersion = {
            minimum: PU.depuisStockage(stats.mini),
            mediane: PU.depuisStockage(stats.mediane),
            maximum: PU.depuisStockage(stats.maxi),
            ecartRelatif: mediane.isZero()
              ? null
              : arrondiCommercial(
                  dec((stats.maxi - stats.mini).toString()).div(mediane).mul(100),
                  1,
                ),
          }
        }

        return {
          sourceId: IDENTIFIANT_SOURCE,
          code: ligne.code,
          designation: ligne.designation,
          unite: ligne.unite,
          prixUnitaireHt: PU.depuisStockage(ligne.prix_unitaire_ht),
          dateReleve: ligne.date_releve,
          contexte: {
            typeOuvrage: ligne.contexte_type_ouvrage,
            nature: ligne.contexte_nature,
            zone: ligne.zone,
          },
          nbReferences,
          dispersion,
        }
      })
    },
  }
}
