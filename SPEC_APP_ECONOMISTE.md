# Spécification — Application de gestion de missions d'économiste de la construction

> À déposer à la racine du projet. Peut servir de `CLAUDE.md` ou de document de référence
> auquel renvoyer Claude Code (`Lis SPEC_APP_ECONOMISTE.md avant de commencer`).

---

## 1. Contexte et objectif

### Utilisateur cible
Économiste de la construction indépendant, basé en Martinique (972), 7 ans d'expérience
en bureau d'études. Interventions en marchés publics et privés sur logement collectif
et individuel, scolaire, tertiaire, santé et réhabilitation.

Compétences métier couvertes : chiffrage tous corps d'état (TCE), métrés, rédaction des
pièces écrites du DCE (CCTP, CCAP, CCTG, DPGF), études de faisabilité financière,
consultation et analyse des offres, suivi financier de chantier jusqu'au décompte final.

### Problème à résoudre
Aujourd'hui tout le travail se fait dans des classeurs Excel isolés et des documents Word
sans lien entre eux. Conséquences : ressaisies multiples, incohérences entre le DPGF et le
CCTP, perte des prix réellement pratiqués d'une mission à l'autre, et aucun historique
exploitable pour estimer plus vite la mission suivante.

### Objectif
Une application web qui suit le déroulé réel d'une mission d'économiste, phase par phase,
avec **un fil de données continu** : ce qui est chiffré alimente le DCE, les offres reçues se
comparent automatiquement à l'estimatif initial, et chaque mission clôturée enrichit une
base de prix personnelle réutilisable.

### Contrainte métier structurante — l'ajustement DOM
Les bases de prix du marché (Batiprix, Artiprix) sont construites sur des coûts métropole.
En Martinique, le fret, les délais d'approvisionnement et le coût de la main-d'œuvre locale
créent des écarts significatifs. L'application doit donc permettre, **à tous les niveaux de
chiffrage**, d'appliquer et de tracer un coefficient d'ajustement local. Ce n'est pas une
option cosmétique : c'est le cœur de la valeur de l'outil pour cet utilisateur.

---

## 2. Principes de conception à respecter

1. **Rien ne se saisit deux fois.** Une donnée entrée en phase amont doit se propager
   automatiquement en aval. Si une quantité change dans le DPGF, elle change partout.
2. **L'utilisateur garde la main.** Toute suggestion automatique (prix, texte de CCTP,
   ratio d'estimation) est un brouillon modifiable, jamais une valeur imposée. L'économiste
   engage sa responsabilité professionnelle sur ses chiffrages.
3. **Traçabilité des prix.** Pour chaque prix unitaire, on doit pouvoir répondre à :
   d'où vient-il (base tierce, base personnelle, saisie manuelle, devis fournisseur),
   de quand date-t-il, quel coefficient lui a été appliqué.
4. **Export systématique.** L'utilisateur doit pouvoir sortir du logiciel à tout moment :
   DPGF en Excel, pièces écrites en Word/PDF. Pas d'enfermement dans un format propriétaire.
5. **Pas de dépendance à une base de prix tierce dans le MVP.** Voir §6.

---

## 3. Modèle de données

Les entités ci-dessous sont le socle. Les noms sont indicatifs mais la structure des
relations doit être respectée.

### `Mission`
- `id`, `reference` (code interne, ex. `2026-014`)
- `nom_operation`, `maitre_ouvrage`, `maitre_oeuvre`
- `type_ouvrage` : enum — logement collectif, logement individuel, scolaire, tertiaire,
  santé, réhabilitation, autre
- `nature` : enum — construction neuve, réhabilitation, extension
- `type_marche` : enum — public, privé
- `surface_shon` / `surface_utile` (m²) — sert au calcul des ratios €/m²
- `budget_previsionnel_ht`
- `phases_contractuelles` : multi-select — ESQ, APS, APD, PRO, DCE, ACT, DET, AOR
- `date_debut`, `date_fin_prevue`, `statut` (prospect, en cours, terminée, abandonnée)
- `honoraires_mission_ht`, `mode_facturation` (forfait, TJM, % travaux)
- `coefficient_local_defaut` (décimal, ex. 1.25) — hérité par tous les chiffrages de la mission

### `Lot`
- `id`, `mission_id`, `numero` (ex. `02`), `intitule` (ex. `Gros œuvre — Maçonnerie`)
- `corps_etat` : référence à une nomenclature TCE (voir §4, prévoir les 23 corps d'état usuels)
- `montant_estime_ht` (calculé depuis les ouvrages)
- `montant_retenu_ht` (après analyse des offres)

### `Ouvrage` (ligne de DPGF)
- `id`, `lot_id`, `code` (ex. `02.03.01`), `designation`, `unite` (m², m³, ml, U, ens., forfait)
- `quantite`
- `prix_unitaire_ht_base` — le prix avant coefficient
- `coefficient_applique` — surchargeable ligne par ligne (hérite du coefficient mission)
- `prix_unitaire_ht_final` — calculé : `prix_unitaire_ht_base × coefficient_applique`
- `montant_ht` — calculé : `quantite × prix_unitaire_ht_final`
- `source_prix` : enum — base_personnelle, base_tierce, devis_fournisseur, saisie_manuelle
- `date_source_prix`
- `texte_cctp` — le descriptif technique associé (lien DPGF ↔ CCTP, voir §5.4)

### `PrixReference` (base de prix personnelle)
- `id`, `code`, `designation`, `unite`, `corps_etat`
- `prix_unitaire_ht`, `date_releve`, `origine_mission_id`
- `contexte` : type d'ouvrage et nature de l'opération d'où vient le prix
- `zone` : métropole / Martinique / autre
- Un même code peut avoir plusieurs entrées historiques → l'application propose la plus
  récente et la plus proche en contexte, en affichant la dispersion des prix connus.

### `Entreprise`
- `id`, `raison_sociale`, `siret`, `contact_nom`, `email`, `telephone`
- `corps_etat_qualifies` (multi)
- `zone_intervention`
- `historique_notes` — appréciation libre de l'utilisateur sur les collaborations passées

### `Consultation`
- `id`, `mission_id`, `lot_id`, `entreprise_id`
- `date_envoi_dce`, `date_limite_remise`, `date_relance`, `date_reception_offre`
- `statut` : enum — envoyée, relancée, offre reçue, sans réponse, désistement

### `Offre`
- `id`, `consultation_id`, `montant_ht`, `date_reception`
- `conforme` (booléen), `observations_techniques`
- `lignes_offre[]` — décomposition par ouvrage quand l'entreprise fournit un DPGF rempli
- `ecart_estimatif` — calculé : écart en € et en % vs `montant_estime_ht` du lot

### `SituationTravaux`
- `id`, `mission_id`, `lot_id`, `numero_situation`, `periode`
- `avancement_pourcent`, `montant_cumule_ht`, `montant_periode_ht`
- `date_validation`

### `Avenant`
- `id`, `mission_id`, `lot_id`, `numero`, `objet`, `montant_ht` (peut être négatif)
- `date`, `motif`, `statut` (proposé, accepté, refusé)
- Impact recalculé automatiquement sur le budget global de la mission.

---

## 4. Nomenclature TCE

Prévoir une table de référence des corps d'état, éditable par l'utilisateur, couvrant
au minimum : VRD / terrassement, gros œuvre — maçonnerie, charpente, couverture,
étanchéité, menuiseries extérieures, menuiseries intérieures, métallerie / serrurerie,
cloisons — doublages, plâtrerie, faux-plafonds, revêtements de sols durs, revêtements
de sols souples, peinture, plomberie sanitaire, chauffage — ventilation — climatisation,
électricité courants forts, courants faibles, ascenseurs, équipements de cuisine,
aménagements extérieurs, espaces verts, nettoyage de livraison.

**Note climat tropical** : en Martinique le lot climatisation est quasi systématique et le
lot chauffage quasi absent. La nomenclature doit être réordonnable et masquable par
l'utilisateur selon le contexte du projet.

---

## 5. Fonctionnalités par phase

### 5.1 Cadrage de mission
- Création d'une mission avec les champs du modèle `Mission`
- Duplication d'une mission existante comme point de départ (gain de temps énorme
  sur des opérations similaires)
- Génération d'une proposition d'honoraires à partir d'un modèle personnalisable
  (variables : nom opération, phases retenues, montant, délais)
- Tableau de bord listant les missions par statut, avec montants et échéances

### 5.2 Estimation de faisabilité (ESQ / APS)
- Estimation rapide au ratio €/m² : l'utilisateur saisit surface + type d'ouvrage +
  nature, l'application propose une fourchette calculée **à partir de l'historique réel
  des missions closes de l'utilisateur** (pas de valeurs codées en dur)
- Affichage du nombre de références utilisées et de leur dispersion — si l'historique
  est trop mince (< 3 références comparables), le dire explicitement plutôt que de
  produire un chiffre faussement précis
- Création et comparaison de scénarios/variantes sur une même mission
- Conversion d'un scénario retenu en base de chiffrage détaillé

### 5.3 Chiffrage détaillé (APD / PRO)
- Saisie des ouvrages par lot, en arborescence lot → sous-lot → ouvrage
- Import d'un DPGF existant depuis Excel (mapping de colonnes guidé)
- **Assistance au prix** : à la saisie d'une désignation, proposer les entrées
  correspondantes de la base de prix personnelle, avec date, contexte d'origine et prix
- Application du coefficient local : par défaut celui de la mission, surchargeable
  au niveau du lot et de la ligne
- Récapitulatif automatique : montant par lot, montant TCE, ratio €/m² calculé
- Export Excel du DPGF, avec et sans prix (version entreprise à remplir)

### 5.4 Rédaction du DCE
- Bibliothèque de trames de CCTP par corps d'état, créées et enrichies par l'utilisateur
- **Lien DPGF ↔ CCTP** : chaque ouvrage du DPGF porte son texte descriptif. La génération
  du CCTP assemble ces textes dans l'ordre des lots. Modifier une désignation d'ouvrage
  signale l'écart dans le CCTP correspondant.
- **Contrôle de cohérence automatique** avant export, signalant :
  - ouvrage présent au DPGF sans texte CCTP correspondant
  - article CCTP sans ligne de DPGF associée
  - incohérence d'unité entre les deux documents
  - quantité nulle ou prix unitaire à zéro
  - lot déclaré dans la mission mais vide
- Génération des CCAP et CCTG à partir de trames avec variables de mission
- Export Word et PDF, avec sommaire et pagination

### 5.5 Consultation des entreprises
- Sélection des entreprises à consulter par lot, depuis le répertoire
- Suivi du statut de chaque consultation, avec relances et dates limites
- Saisie des offres reçues, soit en montant global par lot, soit ligne à ligne si
  l'entreprise a rempli le DPGF
- **Tableau comparatif automatique** par lot : entreprises en colonnes, ouvrages en lignes,
  avec ligne de total, écart vs estimatif en € et en %, et repérage visuel du mieux-disant
- Détection des écarts anormaux (prix unitaire très éloigné de l'estimatif ou des autres
  offres) à signaler pour vérification manuelle — une offre anormalement basse est un
  risque de dérive en chantier
- Brouillon de rapport d'analyse des offres, à compléter et valider par l'utilisateur

### 5.6 Suivi financier de chantier
- Saisie des situations de travaux mensuelles par lot, en % d'avancement ou en montant
- Suivi des avenants, avec recalcul immédiat du budget de l'opération
- Tableau de bord financier : marché initial, avenants cumulés, marché actuel,
  travaux réalisés cumulés, reste à réaliser, écart vs estimatif initial
- Alerte de dérive quand l'écart dépasse un seuil paramétrable par l'utilisateur
- Export du tableau de suivi en Excel

### 5.7 Clôture
- Établissement du décompte général définitif par lot et pour l'opération
- **Réinjection dans la base de prix personnelle** : au moment de la clôture, proposer
  à l'utilisateur de verser les prix réellement pratiqués (issus des offres retenues, pas
  de l'estimatif) dans sa `PrixReference`, avec le contexte de la mission. L'utilisateur
  valide ligne par ligne ou en masse — jamais d'ajout automatique silencieux.
- Archivage de la mission avec accès en lecture à tous ses documents

---

## 6. Base de prix — stratégie explicite

**Ne pas intégrer de base de prix tierce (Batiprix, Artiprix ou autre) dans le MVP.**
Ces bases sont sous licence commerciale et n'offrent pas d'API publique ; toute
intégration suppose un accord préalable avec l'éditeur.

La stratégie retenue est donc :
1. L'utilisateur alimente manuellement une base de prix restreinte sur ses corps d'état
   les plus fréquents, via un import Excel ou une saisie directe
2. Chaque mission close enrichit automatiquement cette base avec les prix réels
3. L'architecture prévoit un connecteur de base externe comme **interface abstraite**
   (`SourcePrix`), de sorte qu'une base tierce puisse être branchée plus tard sans
   refonte — mais aucune implémentation tierce dans le MVP

Cet effet cumulatif est l'actif principal de l'application : au bout de quelques dizaines
de missions, la base personnelle en zone Martinique vaut plus qu'une base métropole
générique.

---

## 7. Contraintes techniques

- **Application web**, responsive, utilisable sur ordinateur et tablette (consultation
  possible en réunion de chantier)
- **Persistance réelle** des données — l'application doit survivre à la fermeture du
  navigateur et permettre de reprendre une mission des semaines plus tard
- **Exports** : Excel (`.xlsx`) pour DPGF et tableaux de suivi, Word (`.docx`) et PDF
  pour les pièces écrites
- **Import** : Excel pour DPGF et base de prix
- **Calculs financiers** : arrondis maîtrisés, pas d'erreur de flottant sur les montants.
  Stocker les montants en centimes entiers ou utiliser un type décimal exact.
- **Données sensibles** : l'application contient des informations clients et des montants
  financiers. Prévoir authentification et protection des accès dès le départ.
- **Mono-utilisateur au départ**, mais modéliser les données avec un `owner_id` pour
  permettre un passage multi-utilisateurs (cabinet) sans migration lourde.

---

## 8. Ordre de développement

### Phase 1 — MVP
Cadrage de mission → Chiffrage détaillé → Rédaction du DCE.
C'est le cœur de l'activité quotidienne et ce qui doit être utilisable en conditions
réelles le plus vite possible. Livrer cette phase complète et testée avant de passer
à la suite.

### Phase 2
Consultation des entreprises et analyse comparative des offres.

### Phase 3
Suivi financier de chantier, clôture et réinjection dans la base de prix personnelle.

### Hors périmètre pour l'instant
- Connexion à une base de prix commerciale
- Métrés automatiques depuis AutoCAD ou Revit / IFC
- Extraction automatique d'ouvrages depuis un CCTP importé
- Application mobile native
- Facturation et comptabilité du freelance

---

## 9. Attentes de méthode pour Claude Code

- Commencer par proposer une architecture et un choix de stack **avant d'écrire du code**,
  et attendre validation
- Implémenter le modèle de données du §3 en premier, il conditionne tout le reste
- Écrire des tests sur les calculs financiers (application des coefficients, totaux par lot,
  écarts, situations de travaux) — c'est là que les erreurs coûtent cher
- Avancer par phases livrables et testables, pas en une seule passe
- Signaler tout point où la spécification est ambiguë ou incomplète plutôt que de
  choisir silencieusement
