-- Brouillon de rapport d'analyse des offres, sur chaque lot.
--
-- Écrite à la main : Prisma voulait aussi supprimer l'index plein texte de
-- prix_reference et retoucher sa colonne générée, qu'il ne sait pas décrire.
-- Ces lignes n'ont rien à voir avec ce changement et détruiraient la recherche
-- de la base de prix ; elles ont été retirées.

-- AlterTable
ALTER TABLE "lot" ADD COLUMN     "rapport_offres_brouillon" JSONB;
