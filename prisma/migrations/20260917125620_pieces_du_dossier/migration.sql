-- Pièces du dossier de consultation — SPEC_APP_ECONOMISTE.md §5.5, point 10.9.
--
-- La table piece_jointe existait sans jamais servir. Elle porte désormais ce
-- qu'il faut pour constituer un dossier de consultation : la catégorie de la
-- pièce, son libellé, son indice de révision, le lot qu'elle concerne, et si
-- elle part ou non aux entreprises.
--
-- Écrite à la main, comme les précédentes : Prisma voulait de nouveau
-- supprimer l'index plein texte de prix_reference et retoucher sa colonne
-- générée, qu'il ne sait pas décrire.

-- CreateEnum
CREATE TYPE "CategoriePiece" AS ENUM ('PLAN', 'RAPPORT_ETUDE', 'DIAGNOSTIC', 'PIECE_ADMINISTRATIVE', 'PHOTO', 'AUTRE');

-- AlterTable
ALTER TABLE "piece_jointe" ADD COLUMN     "categorie" "CategoriePiece" NOT NULL DEFAULT 'AUTRE',
ADD COLUMN     "inclure_au_dce" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "indice" TEXT,
ADD COLUMN     "libelle" TEXT,
ADD COLUMN     "lot_id" TEXT;

-- CreateIndex
CREATE INDEX "piece_jointe_mission_id_categorie_idx" ON "piece_jointe"("mission_id", "categorie");

-- CreateIndex
CREATE INDEX "piece_jointe_lot_id_idx" ON "piece_jointe"("lot_id");

-- AddForeignKey
ALTER TABLE "piece_jointe" ADD CONSTRAINT "piece_jointe_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
