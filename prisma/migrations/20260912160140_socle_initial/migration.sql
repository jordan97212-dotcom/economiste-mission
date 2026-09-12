-- CreateEnum
CREATE TYPE "TypeOuvrage" AS ENUM ('LOGEMENT_COLLECTIF', 'LOGEMENT_INDIVIDUEL', 'SCOLAIRE', 'TERTIAIRE', 'SANTE', 'REHABILITATION', 'AUTRE');

-- CreateEnum
CREATE TYPE "NatureOperation" AS ENUM ('CONSTRUCTION_NEUVE', 'REHABILITATION', 'EXTENSION');

-- CreateEnum
CREATE TYPE "TypeMarche" AS ENUM ('PUBLIC', 'PRIVE');

-- CreateEnum
CREATE TYPE "StatutMission" AS ENUM ('PROSPECT', 'EN_COURS', 'TERMINEE', 'ABANDONNEE');

-- CreateEnum
CREATE TYPE "ModeFacturation" AS ENUM ('FORFAIT', 'TJM', 'POURCENTAGE_TRAVAUX');

-- CreateEnum
CREATE TYPE "PhaseContractuelle" AS ENUM ('ESQ', 'APS', 'APD', 'PRO', 'DCE', 'ACT', 'DET', 'AOR');

-- CreateEnum
CREATE TYPE "Unite" AS ENUM ('M2', 'M3', 'ML', 'U', 'ENS', 'FORFAIT', 'KG', 'T', 'H', 'J');

-- CreateEnum
CREATE TYPE "SourcePrix" AS ENUM ('BASE_PERSONNELLE', 'BASE_TIERCE', 'DEVIS_FOURNISSEUR', 'SAISIE_MANUELLE');

-- CreateEnum
CREATE TYPE "Zone" AS ENUM ('METROPOLE', 'MARTINIQUE', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypePoste" AS ENUM ('SOUS_LOT', 'OUVRAGE');

-- CreateEnum
CREATE TYPE "StatutConsultation" AS ENUM ('ENVOYEE', 'RELANCEE', 'OFFRE_RECUE', 'SANS_REPONSE', 'DESISTEMENT');

-- CreateEnum
CREATE TYPE "TypeOffre" AS ENUM ('BASE', 'VARIANTE', 'OPTION');

-- CreateEnum
CREATE TYPE "StatutAvenant" AS ENUM ('PROPOSE', 'ACCEPTE', 'REFUSE');

-- CreateEnum
CREATE TYPE "ActionAudit" AS ENUM ('CREATION', 'MODIFICATION', 'SUPPRESSION');

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT,
    "mot_de_passe" TEXT,
    "totp_secret" TEXT,
    "email_verifie" TIMESTAMP(3),
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "jeton" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expire_le" TIMESTAMP(3) NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corps_etat" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "masque" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "corps_etat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "nom_operation" TEXT NOT NULL,
    "maitre_ouvrage" TEXT,
    "maitre_oeuvre" TEXT,
    "type_ouvrage" "TypeOuvrage" NOT NULL,
    "nature" "NatureOperation" NOT NULL,
    "type_marche" "TypeMarche" NOT NULL,
    "surface_shon" DECIMAL(12,2),
    "surface_utile" DECIMAL(12,2),
    "budget_previsionnel_ht" BIGINT,
    "phases_contractuelles" "PhaseContractuelle"[],
    "date_debut" TIMESTAMP(3),
    "date_fin_prevue" TIMESTAMP(3),
    "statut" "StatutMission" NOT NULL DEFAULT 'PROSPECT',
    "honoraires_mission_ht" BIGINT,
    "mode_facturation" "ModeFacturation",
    "coefficient_local_defaut" DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
    "precision_pu" INTEGER NOT NULL DEFAULT 2,
    "taux_tva" DECIMAL(5,2) NOT NULL DEFAULT 8.50,
    "seuil_derive_pourcent" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,
    "archivee_le" TIMESTAMP(3),

    CONSTRAINT "mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "corps_etat_id" TEXT,
    "coefficient_local" DECIMAL(6,4),
    "montant_estime_ht" BIGINT NOT NULL DEFAULT 0,
    "montant_retenu_ht" BIGINT,

    CONSTRAINT "lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poste" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "type" "TypePoste" NOT NULL DEFAULT 'OUVRAGE',
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "designation" TEXT NOT NULL,
    "unite" "Unite",
    "quantite" DECIMAL(14,3),
    "prix_unitaire_ht_base" BIGINT,
    "coefficient_applique" DECIMAL(6,4),
    "prix_unitaire_ht_final" BIGINT,
    "montant_ht" BIGINT NOT NULL DEFAULT 0,
    "source_prix" "SourcePrix" NOT NULL DEFAULT 'SAISIE_MANUELLE',
    "date_source_prix" TIMESTAMP(3),
    "texte_cctp" JSONB,

    CONSTRAINT "poste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chiffrage_version" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "phase" "PhaseContractuelle" NOT NULL,
    "libelle" TEXT NOT NULL,
    "fige_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montant_tce_ht" BIGINT NOT NULL,
    "contenu" JSONB NOT NULL,

    CONSTRAINT "chiffrage_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prix_reference" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "code" TEXT,
    "designation" TEXT NOT NULL,
    "unite" "Unite" NOT NULL,
    "corps_etat_id" TEXT,
    "prix_unitaire_ht" BIGINT NOT NULL,
    "date_releve" TIMESTAMP(3) NOT NULL,
    "origine_mission_id" TEXT,
    "contexte_type_ouvrage" "TypeOuvrage",
    "contexte_nature" "NatureOperation",
    "zone" "Zone" NOT NULL DEFAULT 'MARTINIQUE',

    CONSTRAINT "prix_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entreprise" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "raison_sociale" TEXT NOT NULL,
    "siret" TEXT,
    "contact_nom" TEXT,
    "email" TEXT,
    "telephone" TEXT,
    "corps_etat_qualifies" TEXT[],
    "zone_intervention" TEXT,
    "historique_notes" TEXT,

    CONSTRAINT "entreprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "entreprise_id" TEXT NOT NULL,
    "date_envoi_dce" TIMESTAMP(3),
    "date_limite_remise" TIMESTAMP(3),
    "date_relance" TIMESTAMP(3),
    "date_reception_offre" TIMESTAMP(3),
    "statut" "StatutConsultation" NOT NULL DEFAULT 'ENVOYEE',

    CONSTRAINT "consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offre" (
    "id" TEXT NOT NULL,
    "consultation_id" TEXT NOT NULL,
    "type" "TypeOffre" NOT NULL DEFAULT 'BASE',
    "libelle" TEXT,
    "montant_ht" BIGINT NOT NULL,
    "remise_globale_ht" BIGINT NOT NULL DEFAULT 0,
    "date_reception" TIMESTAMP(3) NOT NULL,
    "conforme" BOOLEAN NOT NULL DEFAULT true,
    "observations_techniques" TEXT,

    CONSTRAINT "offre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_offre" (
    "id" TEXT NOT NULL,
    "offre_id" TEXT NOT NULL,
    "poste_id" TEXT NOT NULL,
    "prix_unitaire_ht" BIGINT NOT NULL,
    "montant_ht" BIGINT NOT NULL,

    CONSTRAINT "ligne_offre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "situation_travaux" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "numero_situation" INTEGER NOT NULL,
    "periode" TIMESTAMP(3) NOT NULL,
    "avancement_pourcent" DECIMAL(5,2) NOT NULL,
    "montant_cumule_ht" BIGINT NOT NULL,
    "montant_periode_ht" BIGINT NOT NULL,
    "retenue_garantie_ht" BIGINT NOT NULL DEFAULT 0,
    "avance_remboursee" BIGINT NOT NULL DEFAULT 0,
    "compte_prorata_ht" BIGINT NOT NULL DEFAULT 0,
    "date_validation" TIMESTAMP(3),

    CONSTRAINT "situation_travaux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avenant" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "lot_id" TEXT,
    "numero" INTEGER NOT NULL,
    "objet" TEXT NOT NULL,
    "montant_ht" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "motif" TEXT,
    "statut" "StatutAvenant" NOT NULL DEFAULT 'PROPOSE',

    CONSTRAINT "avenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trame_cctp" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "corps_etat_id" TEXT,
    "intitule" TEXT NOT NULL,
    "contenu" JSONB NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trame_cctp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modele_honoraires" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "contenu" JSONB NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modele_honoraires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "piece_jointe" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "nom_fichier" TEXT NOT NULL,
    "type_mime" TEXT NOT NULL,
    "taille_octets" INTEGER NOT NULL,
    "chemin_stockage" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "mission_id" TEXT,
    "poste_id" TEXT,
    "prix_reference_id" TEXT,
    "offre_id" TEXT,
    "depose_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "piece_jointe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_genere" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phase" "PhaseContractuelle",
    "nom_fichier" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "genere_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_genere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_audit" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entite_id" TEXT NOT NULL,
    "action" "ActionAudit" NOT NULL,
    "avant" JSONB,
    "apres" JSONB,
    "survenu_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_jeton_key" ON "session"("jeton");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "corps_etat_owner_id_ordre_idx" ON "corps_etat"("owner_id", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "corps_etat_owner_id_code_key" ON "corps_etat"("owner_id", "code");

-- CreateIndex
CREATE INDEX "mission_owner_id_statut_idx" ON "mission"("owner_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "mission_owner_id_reference_key" ON "mission"("owner_id", "reference");

-- CreateIndex
CREATE INDEX "lot_mission_id_ordre_idx" ON "lot"("mission_id", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "lot_mission_id_numero_key" ON "lot"("mission_id", "numero");

-- CreateIndex
CREATE INDEX "poste_lot_id_ordre_idx" ON "poste"("lot_id", "ordre");

-- CreateIndex
CREATE INDEX "poste_parent_id_idx" ON "poste"("parent_id");

-- CreateIndex
CREATE INDEX "chiffrage_version_mission_id_fige_le_idx" ON "chiffrage_version"("mission_id", "fige_le");

-- CreateIndex
CREATE INDEX "prix_reference_owner_id_corps_etat_id_idx" ON "prix_reference"("owner_id", "corps_etat_id");

-- CreateIndex
CREATE INDEX "prix_reference_owner_id_code_idx" ON "prix_reference"("owner_id", "code");

-- CreateIndex
CREATE INDEX "prix_reference_owner_id_date_releve_idx" ON "prix_reference"("owner_id", "date_releve");

-- CreateIndex
CREATE INDEX "entreprise_owner_id_raison_sociale_idx" ON "entreprise"("owner_id", "raison_sociale");

-- CreateIndex
CREATE INDEX "consultation_mission_id_statut_idx" ON "consultation"("mission_id", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_lot_id_entreprise_id_key" ON "consultation"("lot_id", "entreprise_id");

-- CreateIndex
CREATE INDEX "offre_consultation_id_idx" ON "offre"("consultation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ligne_offre_offre_id_poste_id_key" ON "ligne_offre"("offre_id", "poste_id");

-- CreateIndex
CREATE INDEX "situation_travaux_mission_id_periode_idx" ON "situation_travaux"("mission_id", "periode");

-- CreateIndex
CREATE UNIQUE INDEX "situation_travaux_lot_id_numero_situation_key" ON "situation_travaux"("lot_id", "numero_situation");

-- CreateIndex
CREATE INDEX "avenant_mission_id_statut_idx" ON "avenant"("mission_id", "statut");

-- CreateIndex
CREATE INDEX "trame_cctp_owner_id_corps_etat_id_idx" ON "trame_cctp"("owner_id", "corps_etat_id");

-- CreateIndex
CREATE INDEX "modele_honoraires_owner_id_idx" ON "modele_honoraires"("owner_id");

-- CreateIndex
CREATE INDEX "piece_jointe_owner_id_idx" ON "piece_jointe"("owner_id");

-- CreateIndex
CREATE INDEX "document_genere_mission_id_genere_le_idx" ON "document_genere"("mission_id", "genere_le");

-- CreateIndex
CREATE INDEX "journal_audit_owner_id_entite_entite_id_idx" ON "journal_audit"("owner_id", "entite", "entite_id");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corps_etat" ADD CONSTRAINT "corps_etat_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission" ADD CONSTRAINT "mission_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot" ADD CONSTRAINT "lot_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot" ADD CONSTRAINT "lot_corps_etat_id_fkey" FOREIGN KEY ("corps_etat_id") REFERENCES "corps_etat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poste" ADD CONSTRAINT "poste_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poste" ADD CONSTRAINT "poste_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "poste"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chiffrage_version" ADD CONSTRAINT "chiffrage_version_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prix_reference" ADD CONSTRAINT "prix_reference_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prix_reference" ADD CONSTRAINT "prix_reference_corps_etat_id_fkey" FOREIGN KEY ("corps_etat_id") REFERENCES "corps_etat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prix_reference" ADD CONSTRAINT "prix_reference_origine_mission_id_fkey" FOREIGN KEY ("origine_mission_id") REFERENCES "mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entreprise" ADD CONSTRAINT "entreprise_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offre" ADD CONSTRAINT "offre_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_offre" ADD CONSTRAINT "ligne_offre_offre_id_fkey" FOREIGN KEY ("offre_id") REFERENCES "offre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_offre" ADD CONSTRAINT "ligne_offre_poste_id_fkey" FOREIGN KEY ("poste_id") REFERENCES "poste"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "situation_travaux" ADD CONSTRAINT "situation_travaux_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "situation_travaux" ADD CONSTRAINT "situation_travaux_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avenant" ADD CONSTRAINT "avenant_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avenant" ADD CONSTRAINT "avenant_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trame_cctp" ADD CONSTRAINT "trame_cctp_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trame_cctp" ADD CONSTRAINT "trame_cctp_corps_etat_id_fkey" FOREIGN KEY ("corps_etat_id") REFERENCES "corps_etat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modele_honoraires" ADD CONSTRAINT "modele_honoraires_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_jointe" ADD CONSTRAINT "piece_jointe_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_jointe" ADD CONSTRAINT "piece_jointe_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_jointe" ADD CONSTRAINT "piece_jointe_poste_id_fkey" FOREIGN KEY ("poste_id") REFERENCES "poste"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_jointe" ADD CONSTRAINT "piece_jointe_prix_reference_id_fkey" FOREIGN KEY ("prix_reference_id") REFERENCES "prix_reference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_jointe" ADD CONSTRAINT "piece_jointe_offre_id_fkey" FOREIGN KEY ("offre_id") REFERENCES "offre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_genere" ADD CONSTRAINT "document_genere_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
