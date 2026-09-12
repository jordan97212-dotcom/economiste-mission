-- Les trames couvrent désormais toutes les pièces écrites du DCE, pas seulement
-- le CCTP : le CCAP et le CCTG sont propres à l'opération et non au lot.
CREATE TYPE "TypeTrame" AS ENUM ('CCTP', 'CCAP', 'CCTG', 'HONORAIRES');

ALTER TABLE "trame_cctp"
  ADD COLUMN "type" "TypeTrame" NOT NULL DEFAULT 'CCTP',
  ADD COLUMN "modifie_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "trame_cctp_owner_id_corps_etat_id_idx";
CREATE INDEX "trame_cctp_owner_id_type_corps_etat_id_idx"
  ON "trame_cctp"("owner_id", "type", "corps_etat_id");

-- Ne pas toucher à prix_reference.recherche : c'est une colonne générée par
-- PostgreSQL, que Prisma ne sait pas décrire et qu'il propose donc de défaire à
-- chaque migration. Son index plein texte doit rester en place.
