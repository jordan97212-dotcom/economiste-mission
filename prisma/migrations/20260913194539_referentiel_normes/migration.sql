-- Référentiel des normes et DTU citées par les pièces écrites.
--
-- Écrite à la main : Prisma voulait aussi supprimer l'index plein texte de
-- prix_reference et retoucher sa colonne générée, qu'il ne sait pas décrire.
-- Ces lignes n'ont rien à voir avec ce changement et détruiraient la recherche
-- de la base de prix ; elles ont été retirées.

-- CreateEnum
CREATE TYPE "StatutNorme" AS ENUM ('EN_VIGUEUR', 'ANNULEE', 'REMPLACEE', 'PROJET');

-- CreateTable
CREATE TABLE "reference_normative" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "titre" TEXT,
    "statut" "StatutNorme" NOT NULL DEFAULT 'EN_VIGUEUR',
    "date_edition" DATE,
    "date_verification" DATE,
    "source" TEXT,
    "remplacee_par" TEXT,
    "commentaire" TEXT,
    "corps_etat_id" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_normative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_normative_owner_id_statut_idx" ON "reference_normative"("owner_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "reference_normative_owner_id_reference_key" ON "reference_normative"("owner_id", "reference");

-- AddForeignKey
ALTER TABLE "reference_normative" ADD CONSTRAINT "reference_normative_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_normative" ADD CONSTRAINT "reference_normative_corps_etat_id_fkey" FOREIGN KEY ("corps_etat_id") REFERENCES "corps_etat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
