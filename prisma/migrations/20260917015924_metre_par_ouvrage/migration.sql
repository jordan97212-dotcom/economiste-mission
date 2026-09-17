-- Métré par ouvrage — SPEC_APP_ECONOMISTE.md §5.2.
--
-- La quantité d'un ouvrage peut désormais être calculée à partir de ses
-- mesures, et non plus seulement tapée. Les repères sont les sous-totaux
-- nommés, réutilisables d'un ouvrage à l'autre.
--
-- Écrite à la main, comme les précédentes : Prisma voulait de nouveau
-- supprimer l'index plein texte de prix_reference et retoucher sa colonne
-- générée, qu'il ne sait pas décrire. Ces lignes n'ont rien à voir avec ce
-- changement et détruiraient la recherche de la base de prix.

-- CreateEnum
CREATE TYPE "TypeLigneMetre" AS ENUM ('MESURE', 'RAPPEL');

-- CreateTable
CREATE TABLE "repere_metre" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "unite" "Unite",
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "valeur" DECIMAL(16,3),
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repere_metre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_metre" (
    "id" TEXT NOT NULL,
    "type" "TypeLigneMetre" NOT NULL DEFAULT 'MESURE',
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "poste_id" TEXT,
    "repere_id" TEXT,
    "rappel_repere_id" TEXT,
    "libelle" TEXT NOT NULL DEFAULT '',
    "deduction" BOOLEAN NOT NULL DEFAULT false,
    "nombre" DECIMAL(14,3),
    "longueur" DECIMAL(14,3),
    "largeur" DECIMAL(14,3),
    "hauteur" DECIMAL(14,3),

    CONSTRAINT "ligne_metre_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repere_metre_mission_id_ordre_idx" ON "repere_metre"("mission_id", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "repere_metre_mission_id_nom_key" ON "repere_metre"("mission_id", "nom");

-- CreateIndex
CREATE INDEX "ligne_metre_poste_id_ordre_idx" ON "ligne_metre"("poste_id", "ordre");

-- CreateIndex
CREATE INDEX "ligne_metre_repere_id_ordre_idx" ON "ligne_metre"("repere_id", "ordre");

-- CreateIndex
CREATE INDEX "ligne_metre_rappel_repere_id_idx" ON "ligne_metre"("rappel_repere_id");

-- AddForeignKey
ALTER TABLE "repere_metre" ADD CONSTRAINT "repere_metre_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_metre" ADD CONSTRAINT "ligne_metre_poste_id_fkey" FOREIGN KEY ("poste_id") REFERENCES "poste"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_metre" ADD CONSTRAINT "ligne_metre_repere_id_fkey" FOREIGN KEY ("repere_id") REFERENCES "repere_metre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_metre" ADD CONSTRAINT "ligne_metre_rappel_repere_id_fkey" FOREIGN KEY ("rappel_repere_id") REFERENCES "repere_metre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
