-- Mise sur l'étagère d'une mission.
--
-- Le statut dit où en est l'affaire ; l'archivage dit seulement qu'on ne veut
-- plus la voir sur le tableau de bord. Confondre les deux obligerait à déclarer
-- une mission abandonnée pour désencombrer l'écran, et le suivi mentirait.

ALTER TABLE "mission" ADD COLUMN "archivee_le" TIMESTAMP(3);

CREATE INDEX "mission_owner_id_archivee_le_idx" ON "mission"("owner_id", "archivee_le");
