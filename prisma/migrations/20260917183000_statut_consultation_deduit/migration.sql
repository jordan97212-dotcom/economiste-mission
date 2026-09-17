-- Le statut d'une consultation se déduit désormais des faits déjà enregistrés :
-- date d'envoi du DCE, date limite de remise, relance, offres reçues. Rangé en
-- base à côté de ces dates, il finissait par les contredire — supprimer une
-- offre reposait « envoyée » sur une consultation dont la remise était close.
--
-- La colonne disparaît donc. Rien n'est perdu : tout se recalcule, sauf le
-- désistement, que seul l'économiste peut connaître et qui reçoit sa colonne.

ALTER TABLE "consultation" ADD COLUMN "desiste_le" TIMESTAMP(3);

-- On retient les désistements déjà déclarés avant de retirer la colonne. Faute
-- de date de déclaration, l'envoi du DCE en tient lieu : c'est forcément après.
UPDATE "consultation"
SET "desiste_le" = COALESCE("date_envoi_dce", CURRENT_TIMESTAMP)
WHERE "statut" = 'DESISTEMENT';

DROP INDEX "consultation_mission_id_statut_idx";

ALTER TABLE "consultation" DROP COLUMN "statut";

DROP TYPE "StatutConsultation";

-- Le suivi se trie maintenant par échéance : « qui doit remettre bientôt » a
-- remplacé « qui est dans tel état ».
CREATE INDEX "consultation_mission_id_date_limite_remise_idx"
ON "consultation"("mission_id", "date_limite_remise");
