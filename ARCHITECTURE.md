# Proposition d'architecture et de stack

> Réponse au §9 de `SPEC_APP_ECONOMISTE.md` : proposition **avant écriture de code applicatif**.
> Aucun code applicatif n'a été écrit à ce stade. Ce document attend ta validation.
> Version 1 — 12 septembre 2026.

---

## 1. Synthèse — la stack proposée

| Couche | Choix | Pourquoi ce choix pour *cette* application |
|---|---|---|
| Langage | **TypeScript** partout (strict) | Un seul langage front + back pour un mainteneur solo. Le typage sert de garde-fou sur les montants (types brandés). |
| Framework | **Next.js 15, App Router** | Une seule application, un seul déploiement. Server Actions pour les mutations, rendu serveur pour les écrans lourds (récap de lots, tableaux de bord). |
| UI | **React 19 + Tailwind CSS + shadcn/ui (Radix)** | Composants accessibles, non propriétaires, copiés dans le repo donc modifiables. Densité d'information élevée, adaptée aux tableaux métier. |
| Grille DPGF | **TanStack Table v8** + virtualisation + éditeurs de cellules maison | Le poste de travail principal. Navigation clavier type tableur et **collage multi-cellules depuis Excel** (voir §6.1). |
| Base de données | **PostgreSQL 16** | Type `numeric` exact, contraintes fortes, `CHECK`, RLS disponible plus tard pour le multi-utilisateurs. |
| Accès données | **Prisma 6** + extension client de cloisonnement par `owner_id` | Migrations versionnées, typage généré. Le cloisonnement est appliqué au niveau du client, pas à chaque requête. |
| Calcul monétaire | **Entiers (centimes, `BIGINT`)** pour les montants, **`decimal.js`** pour quantités et coefficients | Zéro flottant sur le chemin de l'argent. Voir §4, c'est le point le plus important du document. |
| Export Excel | **ExcelJS** | Mise en forme, largeurs de colonnes, formules, verrouillage de cellules pour la version « entreprise à remplir ». |
| Import Excel | **SheetJS (xlsx)** en lecture | Tolérant aux fichiers mal formés, ce qui est la norme sur les DPGF reçus. |
| Export Word | **`docx` (dolanmiu)** | Génération programmatique, sommaire (champ TOC), en-têtes/pieds de page, pagination. |
| Export PDF | **LibreOffice headless**, conversion du `.docx` produit | Une seule mise en page pour Word et PDF. Impossible qu'ils divergent. LibreOffice met à jour le sommaire à la conversion. |
| Éditeur de textes CCTP | **TipTap (ProseMirror)**, stockage JSON | Le même contenu structuré alimente l'aperçu HTML et le rendu `.docx`. Pas de HTML sale en base. |
| Authentification | **Auth.js v5**, mot de passe **argon2id**, sessions en base, TOTP optionnel | Données clients et montants. Sessions révocables côté serveur. |
| Tests | **Vitest** (unitaire + intégration sur Postgres réel), **Playwright** (bout en bout) | Le domaine financier est testé sans base ni réseau, donc vite et souvent. |
| Déploiement | **Docker Compose** (app + Postgres + Caddy) sur un VPS **en France** | ~10 à 20 €/mois, sauvegardes maîtrisées, hébergement UE pour des clients publics français. |

**Latence depuis la Martinique** vers un hébergeur parisien : environ 110 à 130 ms aller-retour. C'est sans effet sur une application de saisie, à condition que la grille DPGF travaille en état local et enregistre par lots (c'est le cas proposé, §6.1). Un hébergement nord-américain gagnerait ~60 ms mais poserait une question de résidence des données pour des marchés publics. Je recommande la France.

### Ce que j'écarte et pourquoi

- **Un back-end séparé (FastAPI, NestJS) + un front séparé.** Deux déploiements, deux jeux de types, deux CI, pour un seul développeur. Le gain d'isolation ne paie pas ici. La séparation utile est faite à l'intérieur du code (§2), pas au niveau du réseau.
- **Une base documentaire (MongoDB, Firestore).** Les agrégats de ce métier sont relationnels et les totaux doivent être exacts. Postgres `numeric` et les contraintes valent mieux que la souplesse de schéma.
- **Un outil no-code / low-code.** Le §2.1 « rien ne se saisit deux fois » et le §4 (arrondis) demandent une logique de calcul propriétaire et testée. C'est exactement ce que ces outils rendent difficile.
- **Un stockage local navigateur (IndexedDB seul).** Le §7 exige une persistance réelle sur plusieurs semaines.

---

## 2. Architecture applicative

Découpage en quatre couches, dans un seul dépôt. La règle est simple : les dépendances vont toujours vers l'intérieur.

```
src/
  domain/          <- TypeScript pur. Aucune I/O, aucun import de Prisma ni de React.
    money/           Money, Quantite, Coefficient, regles d'arrondi
    chiffrage/       calcul PU final, montant ligne, totaux lot, total TCE, ratio €/m²
    estimation/      ratios €/m² a partir de l'historique, dispersion, seuil de fiabilite
    coherence/       controles DPGF <-> CCTP, retourne une liste d'Anomalie
    offres/          ecarts vs estimatif, detection d'offre anormalement basse
    situations/      avancement, cumuls, reste a realiser, impact des avenants
  application/     <- cas d'usage. Orchestration : charge, appelle le domaine, persiste.
    ports/           interfaces : SourcePrix, ExportDPGF, ExportPiecesEcrites, Stockage
  infrastructure/  <- adaptateurs. Prisma, ExcelJS, docx, LibreOffice, systeme de fichiers
    sources-prix/    BasePersonnelleSourcePrix (MVP) ; l'emplacement d'un futur connecteur tiers
  app/             <- Next.js : routes, server actions, composants React
```

Trois conséquences concrètes :

1. **`src/domain` est testable en millisecondes.** Tous les calculs financiers du §9 y vivent. Aucun test de calcul n'a besoin d'une base de données.
2. **Le port `SourcePrix` du §6 est une interface de la couche `application`**, avec une seule implémentation dans le MVP : la base personnelle. Brancher une base tierce plus tard, c'est ajouter un fichier dans `infrastructure/sources-prix/` et l'enregistrer. Aucune refonte.
3. **Les exports sont aussi des ports.** Le jour où le PDF doit changer de moteur, la couche métier ne bouge pas.

### Ports définis dès le départ

```ts
interface SourcePrix {
  readonly id: string            // "base-personnelle", plus tard "batiprix"
  readonly libelle: string
  rechercher(critere: CritereRecherchePrix): Promise<PropositionPrix[]>
}

interface PropositionPrix {
  code: string; designation: string; unite: Unite
  prixUnitaireHT: Money
  dateReleve: Date
  contexte: ContextePrix | null   // type d'ouvrage + nature de l'operation d'origine
  zone: Zone
  nbReferences: number            // combien d'entrees historiques derriere ce prix
  dispersion: Dispersion | null   // min / median / max des entrees connues
}
```

`nbReferences` et `dispersion` sont dans le contrat dès maintenant : le §5.2 exige de dire explicitement quand l'historique est trop mince, et le §5.3 exige d'afficher la dispersion. Une source tierce qui ne sait pas les fournir renverra `null`, et l'interface l'affichera comme telle.

---

## 3. Modèle de données

Traduction fidèle du §3, avec quatre ajouts que je soumets à validation (marqués **[AJOUT]**) et qui sont détaillés au §9.

### Racines et cloisonnement

Toutes les racines d'agrégat portent `owner_id` : `Mission`, `PrixReference`, `Entreprise`, `TrameCCTP`, `CorpsEtat`, `ModeleHonoraires`. Les entités filles (`Lot`, `Ouvrage`, `Offre`…) héritent du cloisonnement par leur parent. Une extension du client Prisma injecte automatiquement le filtre `owner_id` sur chaque lecture et le renseigne sur chaque écriture, pour qu'aucune requête ne puisse l'oublier. Au passage en multi-utilisateurs (cabinet), on ajoute la Row Level Security Postgres par-dessus, sans migration de données.

### Tables principales

- **`mission`** — champs du §3, plus `precision_pu` **[AJOUT, voir §9.1]** et `reference` générée par année (`2026-014`) avec unicité par propriétaire.
- **`lot`** — champs du §3, plus `coefficient_local` nullable **[AJOUT, voir §9.3]**, plus `ordre` pour le classement manuel.
- **`poste`** — remplace `Ouvrage` et absorbe la notion de sous-lot **[AJOUT, voir §9.2]** : arbre auto-référent (`parent_id` nullable) avec `type` ∈ {`sous_lot`, `ouvrage`}. Un `sous_lot` porte un intitulé et un sous-total calculé ; un `ouvrage` porte quantité, prix, unité, `texte_cctp`. Profondeur libre, ce qui couvre les DPGF à trois ou quatre niveaux qu'on rencontre sur les gros lots techniques.
- **`prix_reference`** — champs du §3. Index sur (`owner_id`, `corps_etat`, `code`) et recherche plein texte française sur `designation` (`tsvector`, dictionnaire `french`) pour l'assistance au prix à la frappe.
- **`entreprise`**, **`consultation`**, **`offre`**, **`ligne_offre`** — champs du §3 (phase 2).
- **`situation_travaux`**, **`avenant`** — champs du §3 (phase 3), avec les champs de décompte listés au §9.6.
- **`corps_etat`** — nomenclature TCE du §4, pré-remplie par un *seed*, éditable, avec `ordre` et `masque` pour la note climat tropical.
- **`chiffrage_version`** **[AJOUT, voir §9.4]** — instantané figé du chiffrage d'une mission à une phase donnée (APS, APD, PRO, DCE). Sans lui, « écart vs estimatif initial » du §5.6 n'a pas de référent stable.
- **`document_genere`** — trace des exports produits (type, phase, date, empreinte), pour retrouver quel DPGF a réellement été envoyé.
- **`piece_jointe`** — les pièces déposées : plans, rapports, diagnostics. La ligne porte les métadonnées (nature, libellé, indice, lot concerné, inclusion au DCE, empreinte SHA-256), le disque porte les octets. Un plan d'exécution pèse couramment cinquante mégaoctets : les mettre en base rendrait toute sauvegarde SQL inexploitable. Le chemin est dérivé des identifiants engendrés par l'application, jamais du nom fourni — c'est ce qui ferme la porte aux remontées de dossier, et la résolution sous la racine le revérifie.
- **`ligne_metre`**, **`repere_metre`** **[AJOUT]** — le métré d'un ouvrage. Une `ligne_metre` appartient soit à un `poste`, soit à un `repere_metre` (sous-total nommé, portée mission) ; elle porte `nombre`, `longueur`, `largeur`, `hauteur` en `NUMERIC(14,3)`, un indicateur `deduction`, et pour une ligne de rappel un `rappel_repere_id` en `ON DELETE RESTRICT` — un repère encore rappelé ne se supprime pas. La quantité du `poste` devient alors une valeur dérivée, écrite par l'application et refusée à la saisie directe : c'est le même principe que `montant_ht`, appliqué un cran plus haut.

### Types SQL retenus

| Donnée | Type | Remarque |
|---|---|---|
| Montants | `BIGINT` (centimes) | Jamais de `float`. Voir §4. |
| Quantités | `NUMERIC(14,3)` | Le millième couvre les m³ et les tonnes. |
| Coefficients | `NUMERIC(6,4)` | `1.2500`. Borné par `CHECK (coefficient > 0 AND coefficient <= 10)`. |
| Pourcentages d'avancement | `NUMERIC(5,2)` | 0 à 100. |
| Surfaces | `NUMERIC(12,2)` | m². |

Les colonnes calculées du §3 (`prix_unitaire_ht_final`, `montant_ht`, `montant_estime_ht`) ne sont **pas** stockées comme champs libres : elles sont soit des colonnes générées Postgres, soit recalculées par le domaine et écrites dans une colonne en lecture seule côté application. Objectif : il ne doit jamais exister en base un total qui contredit ses lignes.

---

## 4. Précision financière — le point critique

Le §7 demande « arrondis maîtrisés, pas d'erreur de flottant » et le §9 demande des tests là-dessus. Voici la règle que je propose, à valider explicitement car elle change les totaux imprimés.

### Représentation

- Un montant est un entier de centimes, encapsulé dans un type `Money` (type brandé TypeScript). Aucune opération arithmétique JavaScript n'est possible dessus directement : on passe par `Money.ajouter`, `Money.multiplierParQuantite`, etc.
- Une quantité et un coefficient sont des `Decimal` (`decimal.js`), jamais des `number`.
- La conversion `number → Money` n'existe qu'aux frontières : parsing d'une saisie utilisateur et parsing d'un fichier Excel importé.

### Chaîne de calcul proposée

```
pu_final    = arrondi( pu_base × coefficient, precision_pu )     // precision_pu = 2 par defaut
montant     = arrondi( quantite × pu_final,   2 )                // toujours au centime
total_lot   = Σ montant des lignes du lot                        // somme exacte, sans re-arrondi
total_tce   = Σ total_lot                                        // somme exacte
```

Arrondi **commercial, demi-supérieur en valeur absolue** (`0,005 → 0,01` ; `-0,005 → -0,01`), pas l'arrondi bancaire.

### Pourquoi arrondir le prix unitaire avant de multiplier

Parce que le DPGF est un document contractuel. L'entreprise reçoit un tableau où le prix unitaire est imprimé avec `precision_pu` décimales, et elle recalcule `quantité × prix unitaire affiché`. Si l'application conservait la pleine précision en interne, notre total ne tomberait pas sur le sien, et l'écart serait à expliquer en réunion. Le document imprimé fait foi : le calcul doit donc suivre l'affichage, pas l'inverse.

La contrepartie est une perte de précision sur les postes à prix unitaire faible et quantité forte. D'où le champ `precision_pu` sur la mission **[AJOUT]** : 2 décimales par défaut, réglable jusqu'à 4, ce qui couvre la visserie, la petite quincaillerie ou les prix au kilo. Le choix est fait une fois par mission et s'applique à l'affichage comme au calcul, donc la cohérence avec le document reste garantie.

### Tests prévus (§9 de la spec)

Table de cas explicites, écrits avant l'implémentation :

- application d'un coefficient à un prix, dans les deux sens d'arrondi, avec cas pivot à `x,xx5` ;
- coefficient hérité mission → lot → ligne, avec surcharge à chacun des trois niveaux ;
- coefficient neutre `1.0000` : le prix ne doit pas bouger d'un centime ;
- totaux d'un lot de 500 lignes, comparés à une somme de référence calculée en entiers ;
- montants négatifs (avenant en moins-value, §3) ;
- quantité nulle, prix nul, coefficient absent ;
- aller-retour export Excel → réimport : les totaux doivent être identiques au centime près ;
- écart estimatif / offre en euros et en pourcentage, y compris estimatif à zéro (division par zéro) ;
- situation de travaux : avancement en pourcentage puis conversion en montant, cumuls successifs, et vérification que la somme des situations de période égale le cumul final.

---

## 5. Imports, exports et génération documentaire

### Export DPGF Excel (§5.3)

Deux variantes issues du même générateur :

- **Version économiste** : toutes les colonnes, prix unitaires et montants, totaux par lot et récapitulatif TCE, formules Excel vivantes pour que le destinataire puisse vérifier.
- **Version entreprise à remplir** : colonnes prix vides, quantités et désignations verrouillées, feuille protégée, cellules de saisie déverrouillées et colorées. Les formules de montant et de total sont présentes, donc l'entreprise voit son total se calculer en saisissant.

La version entreprise embarque un onglet technique masqué avec l'identifiant de chaque ligne, ce qui rend le réimport des offres ligne à ligne (§5.5) fiable sans appariement approximatif sur la désignation.

### Import DPGF Excel (§5.3)

Assistant en trois écrans : choix de la feuille et de la ligne d'en-tête, mapping des colonnes (proposé automatiquement par correspondance de libellés, corrigeable), aperçu des 20 premières lignes avec les anomalies détectées avant validation. Import transactionnel : tout passe ou rien ne passe.

### CCTP, CCAP, CCTG (§5.4)

Les trames et les textes d'ouvrage sont stockés en JSON structuré (TipTap). Un même arbre de contenu est rendu vers l'aperçu HTML et vers le `.docx`, par deux fonctions de rendu partageant la même définition de styles. Les variables de mission (`{{nom_operation}}`, `{{maitre_ouvrage}}`, `{{montant_travaux}}`…) sont résolues à la génération, avec signalement des variables non renseignées avant export.

Le PDF est produit par conversion LibreOffice du `.docx` généré. Le sommaire et la pagination sont donc calculés une seule fois, par le même moteur, pour les deux formats.

### Contrôle de cohérence (§5.4)

Fonction pure du domaine, `verifierCoherence(mission): Anomalie[]`, couvrant les cinq contrôles listés dans la spec plus la détection des écarts de désignation entre un ouvrage et son texte CCTP. Chaque anomalie porte une sévérité (bloquante / avertissement), un libellé et un lien direct vers la ligne concernée. Elle est exécutée à la demande et automatiquement avant tout export de DCE.

---

## 6. Ergonomie des deux écrans qui font l'application

### 6.1 La grille de chiffrage

C'est là que passera l'essentiel du temps de travail. Exigences que je propose de tenir dès la phase 1 :

- navigation clavier complète, sans souris : flèches, `Tab`, `Entrée`, `F2` pour éditer, `Échap` pour annuler ;
- **collage d'un bloc de cellules depuis Excel** directement dans la grille, avec aperçu avant application ;
- insertion, duplication, déplacement et indentation de lignes au clavier ;
- recalcul immédiat en local des totaux de lot et du total TCE, sans aller-retour serveur ;
- enregistrement automatique par lots, avec témoin d'état explicite (« modifications enregistrées à 14:32 ») ;
- assistance au prix déclenchée à la frappe dans la désignation, affichant prix, date, contexte d'origine, nombre de références et dispersion. La proposition ne s'applique jamais seule : il faut la choisir (§2.2 de la spec) ;
- virtualisation des lignes pour rester fluide au-delà de quelques milliers de postes.

### 6.2 Le tableau comparatif des offres (phase 2)

Entreprises en colonnes, postes en lignes, colonne estimatif figée à gauche, totaux et écarts en euros et en pourcentage, mieux-disant repéré visuellement, cellules aberrantes signalées. Impression et export Excel à l'identique de ce qui est affiché.

---

## 7. Sécurité, sauvegarde et réversibilité

- **Authentification** : mot de passe haché argon2id, limitation du nombre de tentatives, sessions en base avec révocation, cookies `httpOnly` / `Secure` / `SameSite=Lax`. Second facteur TOTP proposé en option.
- **Transport** : HTTPS obligatoire, certificats automatiques via Caddy, en-têtes de sécurité stricts.
- **Cloisonnement** : `owner_id` appliqué par l'extension Prisma, avec un test d'intégration dédié qui tente volontairement de lire les données d'un autre propriétaire et doit échouer.
- **Sauvegardes** : `pg_dump` chiffré quotidien vers un stockage objet distant, rétention 30 jours, plus une restauration de vérification mensuelle. Une sauvegarde jamais restaurée n'est pas une sauvegarde.
- **Réversibilité** (§2.4) : un bouton « exporter toutes mes données » produisant une archive contenant l'intégralité des missions en Excel et en JSON, plus les pièces écrites générées. À faire en phase 1, pas plus tard.
- **Journal d'audit** sur les entités financières : qui a modifié quoi et quand. Utile en cas de contestation sur un chiffrage.

---

## 8. Découpage de la phase 1 en incréments livrables

Chaque lot est livrable, testé et démontrable. Je ne passe au suivant qu'une fois le précédent vert.

| # | Lot | Contenu | Critère de fin |
|---|---|---|---|
| 0 | Socle | Dépôt, TypeScript strict, Docker Compose, CI, authentification, schéma Prisma complet du §3, migrations, seed de la nomenclature TCE | On se connecte, la base est créée, la CI est verte |
| 1 | Noyau financier | `Money`, `Quantite`, `Coefficient`, règles d'arrondi, calculs de chiffrage, batterie de tests du §4 | Tous les cas de test du §4 passent, couverture du domaine > 95 % |
| 2 | Missions | Création, édition, duplication, tableau de bord par statut, génération de la référence annuelle | On crée et on duplique une mission réelle |
| 3 | Chiffrage | Arbre lot / sous-lot / ouvrage, grille éditable complète (§6.1), coefficients en cascade, récapitulatif et ratio €/m² | Un DPGF réel est saisi de bout en bout et les totaux sont justes |
| 4 | Base de prix | Saisie, import Excel, recherche plein texte, assistance au prix dans la grille, affichage de la dispersion | L'assistance propose un prix pertinent sur une saisie réelle |
| 5 | Import DPGF | Assistant de mapping, aperçu, import transactionnel | Un DPGF Excel existant est importé sans ressaisie |
| 6 | Export DPGF | Excel version économiste et version entreprise verrouillée | Les deux fichiers s'ouvrent dans Excel et les formules sont justes |
| 7 | DCE | Trames CCTP, lien DPGF ↔ CCTP, contrôle de cohérence, génération CCTP / CCAP / CCTG, export Word et PDF | Un DCE complet est produit et relu sans retouche majeure |
| 8 | Divers phase 1 | Proposition d'honoraires, export complet des données, journal d'audit | La phase 1 est utilisable en conditions réelles |

Une mission réelle passée sert de jeu d'essai dès le lot 3 : c'est le seul moyen de savoir si l'outil tient face à un vrai DPGF plutôt qu'à des données inventées.

---

## 9. Points à trancher — ce que la spec ne dit pas

Le §9 de la spec demande de signaler plutôt que de choisir silencieusement. Voici les onze points. Pour chacun, j'indique la valeur par défaut que j'appliquerai si tu ne tranches pas, pour que l'absence de réponse ne bloque rien.

**9.1 — Règle d'arrondi du prix unitaire.** Le §3 définit `prix_unitaire_ht_final = prix_unitaire_ht_base × coefficient_applique` sans dire à quelle précision. C'est la décision la plus structurante du projet, elle change les totaux imprimés. *Par défaut* : arrondi du prix unitaire final à 2 décimales, puis montant = quantité × ce prix arrondi, avec un réglage `precision_pu` par mission jusqu'à 4 décimales. Justification au §4.

**9.2 — Le sous-lot n'existe pas dans le modèle.** Le §5.3 demande une arborescence « lot → sous-lot → ouvrage », mais le §3 ne définit que `Lot` et `Ouvrage`. *Par défaut* : table `poste` auto-référente à profondeur libre, ce qui couvre aussi les DPGF à quatre niveaux.

**9.3 — Le coefficient au niveau du lot n'existe pas dans le modèle.** Le §5.3 dit le coefficient « surchargeable au niveau du lot et de la ligne », mais l'entité `Lot` du §3 n'a pas de champ coefficient. *Par défaut* : `coefficient_local` nullable sur le lot, cascade mission → lot → ligne, chaque niveau affichant d'où vient la valeur effective.

**9.4 — Versions de chiffrage.** Un DPGF évolue entre APD, PRO et DCE. Le §5.6 demande l'« écart vs estimatif initial » : sans instantané figé, cet écart n'a pas de référent. *Par défaut* : table `chiffrage_version` avec figeage manuel à chaque phase contractuelle, et comparaison entre deux versions.

**9.5 — TVA.** Tous les montants de la spec sont HT, ce qui est cohérent pour du chiffrage. Mais la proposition d'honoraires (§5.1) et les situations de travaux (§5.6) sont des documents financiers où le TTC apparaît en pratique, avec les taux spécifiques DOM (8,5 % en Martinique). *Par défaut* : calcul interne strictement HT, avec un taux de TVA par mission utilisé uniquement à l'affichage et à l'impression des documents financiers.

**9.6 — Retenue de garantie, avance forfaitaire, compte prorata.** Le modèle `SituationTravaux` du §3 ne les prévoit pas. En marché public, un décompte sans retenue de garantie de 5 % ni avance de 5 % n'est pas exploitable. *Par défaut* : champs prévus dans le schéma dès maintenant, logique implémentée en phase 3.

**9.7 — Révision et actualisation des prix.** Aucune mention d'index BT ou de formule de révision, alors que les marchés publics de plus d'un an en comportent presque toujours. *Par défaut* : hors périmètre, mais je réserve les champs nécessaires pour ne pas migrer plus tard. À confirmer.

**9.8 — Variantes, options et remises globales dans les offres.** Le §5.5 modélise une offre comme un montant par lot ou un DPGF rempli. En pratique une entreprise remet une base, des variantes, des options chiffrées et parfois une remise sur l'ensemble de ses lots. *Par défaut* : phase 2, avec un type d'offre (base / variante / option) et une remise globale répartie au prorata pour la comparaison.

**9.9 — Pièces jointes.** `source_prix = devis_fournisseur` suppose de pouvoir retrouver le devis. Aucun stockage de fichiers n'est prévu dans la spec. *Par défaut* : stockage de fichiers attachés aux missions et aux prix dès la phase 1, sur le disque du serveur avec sauvegarde, abstrait derrière un port `Stockage` pour pouvoir basculer vers S3.

**9.10 — L'estimation au ratio démarre à vide.** Le §5.2 impose de calculer les ratios €/m² depuis l'historique réel des missions closes, sans valeurs codées en dur. Or au démarrage l'historique est vide, et la phase 3 est ce qui alimente cet historique. La fonctionnalité sera donc inutilisable pendant plusieurs mois. *Par défaut* : permettre la saisie manuelle de ratios de référence issus de tes opérations passées, clairement étiquetés comme saisis et non calculés, pour amorcer la base. À confirmer, car cela touche au principe du §5.2.

**9.11 — Travail hors connexion.** Le §7 évoque la consultation sur tablette en réunion de chantier, où la connectivité est souvent mauvaise. La spec ne demande pas le mode hors ligne. *Par défaut* : hors périmètre en phase 1, avec une mise en cache en lecture seule des écrans de consultation étudiée en phase 3. Je le signale car c'est le genre d'exigence qui coûte cher si elle arrive tard.

**Révision du lot 7 — l'éditeur riche.** La version 1 annonçait TipTap pour les
textes de CCTP. À l'implémentation, un format de texte brut à conventions simples
s'est révélé meilleur ici : le même analyseur sert à l'aperçu écran et au rendu
Word, donc les deux ne peuvent pas diverger sur une pièce contractuelle, et le
contenu reste lisible hors de l'application, ce que demande le §2.4. Le stockage
reste du JSON et la frontière reste l'analyseur : brancher un éditeur riche plus
tard ne touchera rien d'autre.

**Point mineur — correction apportée après vérification** : j'avais écrit en version 1 que la liste du §4 contenait 22 corps d'état et proposé d'en ajouter un. C'était une erreur de comptage de ma part : la liste en contient bien 23, conformément au §3. Le jeu initial reprend donc les 23 postes de la spécification, sans ajout ni retrait. La table restant éditable, « Désamiantage / démolition » reste facile à ajouter si les opérations de réhabilitation le demandent.

---

## 10. Ce que j'attends de toi pour démarrer

Trois réponses suffisent à débloquer les lots 0 à 3 :

1. **La stack du §1 est-elle validée ?** Un refus sur un élément précis (par exemple l'hébergement, ou Prisma) ne remet pas en cause le reste.
2. **La règle d'arrondi du §9.1 est-elle validée ?** C'est le seul point qu'il est réellement coûteux de changer après coup.
3. **Les ajouts au modèle de données 9.2, 9.3, 9.4 et 9.9 sont-ils acceptés ?** Ils touchent au schéma, donc autant les intégrer à la première migration.

Les points 9.5 à 9.8, 9.10 et 9.11 peuvent être tranchés plus tard sans coût, les valeurs par défaut indiquées s'appliquent d'ici là.

Dès validation, j'enchaîne sur le lot 0 puis le lot 1, en respectant le §9 de la spec : le modèle de données d'abord, les tests des calculs financiers ensuite, et rien d'autre tant que ces deux socles ne sont pas verts.
