-- Offre retenue par lot — SPEC_APP_ECONOMISTE.md §5.6.
--
-- C'est ce lien qui donne au lot son marché : sans attribution, une situation
-- de travaux n'aurait aucune base sur laquelle s'appuyer.
--
-- Écrite à la main : Prisma voulait aussi supprimer l'index plein texte de
-- prix_reference et retoucher sa colonne générée, qu'il ne sait pas décrire.
-- Ces lignes n'ont rien à voir avec ce changement et détruiraient la recherche
-- de la base de prix ; elles ont été retirées.

-- AlterTable
ALTER TABLE "lot" ADD COLUMN     "offre_retenue_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "lot_offre_retenue_id_key" ON "lot"("offre_retenue_id");

-- AddForeignKey
ALTER TABLE "lot" ADD CONSTRAINT "lot_offre_retenue_id_fkey" FOREIGN KEY ("offre_retenue_id") REFERENCES "offre"("id") ON DELETE SET NULL ON UPDATE CASCADE;
