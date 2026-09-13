# Application de gestion de missions d'économiste de la construction

Outil de suivi d'une mission d'économiste phase par phase, avec un fil de données
continu du chiffrage jusqu'à la base de prix personnelle.

- `SPEC_APP_ECONOMISTE.md` — la spécification métier, source de vérité.
- `ARCHITECTURE.md` — l'architecture, la stack et les décisions validées.

## État d'avancement

| Lot | Contenu | État |
|---|---|---|
| 0 | Socle, schéma de données, migrations, jeu initial, intégration continue | Livré |
| 1 | Noyau financier et ses tests | Livré |
| 2 | Missions : création, duplication, tableau de bord | Livré |
| 3 | Chiffrage : arborescence et grille éditable | Livré |
| 4 | Base de prix personnelle et assistance au prix | Livré |
| 5 | Import DPGF Excel | Livré |
| 6 | Export DPGF Excel | Livré |
| 7 | DCE : CCTP, CCAP, CCTG, contrôle de cohérence | Livré |
| 8 | Honoraires, export complet, journal d'audit | Livré |
| 9 | Référentiel des normes et DTU, contrôle des citations | Livré |

La phase 1 de la spécification est couverte : cadrage de mission, chiffrage
détaillé et rédaction du DCE. On crée ou duplique une mission, on saisit son
chiffrage au clavier ou par import Excel, on s'appuie sur sa base de prix, on
rédige les textes de CCTP, et on sort le bordereau et les pièces écrites en
Excel, Word et PDF. Restent les phases 2 et 3 : consultation des entreprises,
puis suivi financier de chantier.

## Pour s'en servir

**[LANCER-SUR-MON-PC.md](LANCER-SUR-MON-PC.md)** — installation sur un poste
Windows, sans rien connaître au développement. Docker Desktop, puis un fichier à
double-cliquer. La marche à suivre couvre aussi les sauvegardes et ce qu'un
premier test réel doit chercher à vérifier.

```bash
docker compose up -d --build
```

Un seul prérequis : Docker. Les migrations s'appliquent et la nomenclature se
pose au démarrage, sans jamais écraser de donnée existante — on peut redémarrer
autant qu'on veut. Vos données vivent dans le volume `pgdata`, qui survit à
l'arrêt et à la mise à jour.

## Démarrer pour développer

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run db:seed
npm test
npm run dev
```

Ouvrir http://localhost:3000. Au premier lancement, l'application propose de créer
le compte : aucun mot de passe n'est pré-rempli, et douze caractères sont exigés.

Sans Docker, une instance PostgreSQL 16 locale sur le port 5433 fait l'affaire.
Il suffit que `DATABASE_URL` pointe dessus.

## Commandes

| Commande | Effet |
|---|---|
| `npm test` | Lance la batterie de tests |
| `npm run test:watch` | Relance les tests à chaque modification |
| `npm run typecheck` | Vérifie le typage sans produire de fichiers |
| `npm run db:migrate` | Crée et applique une migration de développement |
| `npm run db:deploy` | Applique les migrations existantes en production |
| `npm run db:seed` | Charge la nomenclature TCE |
| `npm run db:studio` | Ouvre l'explorateur de base Prisma |
| `npm run dev` | Lance l'application en développement |
| `npm run build` | Construit la version de production |
| `docker compose up -d --build` | Lance l'application complète, base comprise |

Les tests d'intégration ont besoin de la base : démarrez-la avant `npm test`.

## Règles de calcul

Trois règles gouvernent tout le code financier. Les enfreindre casse des tests.

**Aucun flottant sur le chemin de l'argent.** Un montant est un entier de centimes
dans le type `Money`. Un prix unitaire est un entier de dix-millièmes d'euro dans le
type `PrixUnitaire`. Les deux types sont brandés et distincts, donc on ne peut pas
confondre les échelles par accident. Quantités et coefficients sont des décimaux
exacts, jamais des nombres JavaScript.

**Le prix unitaire est arrondi avant la multiplication.**

```
pu_final = arrondi( pu_base × coefficient, precision_pu )   // 2 décimales par défaut
montant  = arrondi( quantite × pu_final,   2 )              // toujours au centime
total    = Σ montant                                        // somme exacte, sans ré-arrondi
```

Le DPGF imprimé est le document contractuel. L'entreprise recalcule quantité fois
prix affiché : le total de l'application doit tomber sur le sien. La précision du
prix unitaire est réglable par mission, de 2 à 4 décimales, pour les postes à prix
faible et quantité forte.

**L'arrondi est commercial, pas bancaire.** Au plus proche, et à l'équidistance on
s'éloigne de zéro. `0,005` donne `0,01`, `-0,005` donne `-0,01`.

## La grille de chiffrage

C'est l'écran où passe l'essentiel du temps de travail.

- Flèches haut et bas, ou Entrée, pour circuler d'une ligne à l'autre sans souris.
- Collage d'un bloc de cellules depuis un tableur, directement dans la grille. Les
  lignes manquantes sont créées, les nombres au format français sont reconnus,
  espaces de milliers et virgule décimale compris.
- Enregistrement automatique par lots, avec un témoin d'état explicite.
- Totaux recalculés à la frappe, avec les mêmes fonctions de domaine que le
  serveur : l'affichage ne peut pas diverger de ce qui sera persisté.
- Coefficient hérité affiché en gris clair, coefficient propre à la ligne en noir.

## Base de prix personnelle

La recherche s'appuie sur une colonne `tsvector` maintenue par PostgreSQL, avec le
dictionnaire français et suppression des accents. Taper « beton arme » retrouve
donc « Béton armé pour voiles », et « cloisons » retrouve « Cloison de
distribution ». La colonne étant générée par la base, elle ne peut pas se
désynchroniser de la désignation.

Chaque proposition arrive avec sa date, son contexte d'origine, le nombre de
relevés qui la soutiennent et la dispersion des prix connus. En dessous de trois
relevés, l'historique est signalé comme mince plutôt que présenté comme fiable.
Un même ouvrage ne donne qu'une proposition, pas une par relevé.

## Import et export du DPGF

À l'import, le rôle de chaque colonne est proposé puis corrigé par l'utilisateur,
et la ligne d'en-tête est devinée. Une ligne qui porte un intitulé mais ni
quantité ni prix devient un sous-lot, et les lignes suivantes lui sont rattachées :
c'est la forme habituelle d'un DPGF. L'aperçu affiche exactement ce qui sera créé,
et une ligne illisible bloque l'import au lieu d'être devinée.

À l'export, deux variantes du même générateur.

| Variante | Contenu |
|---|---|
| DPGF chiffré | prix unitaires finaux et montants, formules Excel vivantes |
| DPGF à remplir | quantités conservées, colonnes de prix vides et déverrouillées, feuille protégée |

Le prix exporté est le prix unitaire **final**, coefficient déjà appliqué. Le prix
de base et le coefficient ne sortent jamais dans un document destiné à un tiers.
Un onglet technique masqué porte la correspondance entre chaque ligne et son
poste, ce qui rendra fiable la reprise des offres en phase 2.

## Pièces écrites du DCE

Le texte descriptif est porté par l'ouvrage lui-même, pas par un document à part.
Le lien entre le DPGF et le CCTP n'est donc pas une jointure à maintenir : la
génération parcourt les lots dans l'ordre et assemble ce que chaque ouvrage
porte. Un ouvrage laissé sans texte ressort avec une mention visible en rouge,
jamais par un blanc.

Le contrôle de cohérence tourne avant toute génération de CCTP et refuse la
sortie tant qu'il reste une anomalie bloquante. Un lien permet de passer outre en
connaissance de cause.

| Contrôle | Sévérité |
|---|---|
| Ouvrage du DPGF sans texte de CCTP | bloquante |
| Lot déclaré mais vide, ou sans aucun ouvrage chiffrable | bloquante |
| Article décrit au CCTP mais ni quantité ni prix | à vérifier |
| Désignation modifiée depuis l'écriture du texte | à vérifier |
| Unité citée dans le texte qui contredit celle du DPGF | à vérifier |
| Quantité nulle, prix à zéro, unité absente | à vérifier |

Le §5.4 demande aussi de signaler « un article CCTP sans ligne de DPGF ». Dans ce
modèle un tel orphelin ne peut pas exister, puisque le texte disparaît avec sa
ligne. Le contrôle équivalent, et celui qui a du sens ici, est l'article décrit
mais non chiffré.

### Format des textes

Un texte brut à conventions simples : deux dièses pour un sous-titre, un tiret
pour une puce, une ligne vide entre deux paragraphes. Le même analyseur sert à
l'aperçu écran et au rendu Word, donc les deux ne peuvent pas diverger, et le
contenu reste lisible sans l'application. L'architecture prévoyait un éditeur
riche ; il pourra venir plus tard en produisant le même format.

### Variables de mission

Les trames de CCAP et de CCTG acceptent des variables entre doubles accolades,
résolues à la génération : `{{nom_operation}}`, `{{maitre_ouvrage}}`,
`{{montant_travaux_ht}}` et quelques autres. Une variable non renseignée reste
visible dans le document et se retrouve dans la liste des manquantes, plutôt que
de laisser un trou silencieux.

### Word et PDF

Le document Word est la source, le PDF sa conversion par LibreOffice. La mise en
page, le sommaire et la pagination sont donc calculés une seule fois, par le même
moteur. Le serveur doit disposer du module Writer :

```bash
apt-get install -y libreoffice-writer
```

Sans lui, l'application reste utilisable : elle détecte l'absence en tentant une
vraie conversion, masque les boutons PDF et continue de produire le Word.

## Honoraires, journal et sortie des données

### Proposition d'honoraires

La proposition se génère comme les autres pièces écrites, depuis une trame de
type `HONORAIRES`, avec ses propres variables : `{{honoraires_ht}}`,
`{{taux_honoraires}}`, `{{mode_facturation}}`, `{{date_debut}}`,
`{{date_fin_prevue}}`, `{{duree_mois}}`. Le taux n'est pas saisi : il se déduit
des honoraires et de l'estimatif du moment, et suit donc le chiffrage.

### Journal des modifications

Le journal répond à une question et une seule : qui a modifié quoi, et quand.
Il enregistre l'intention, jamais le recalcul. Les prix unitaires finaux, les
montants de ligne et les totaux de lot sont recomputés à chaque écriture ; les
inscrire reviendrait à noyer la décision sous ses conséquences.

Ce qui laisse une trace :

| Évènement | Trace |
| --- | --- |
| Mission créée, modifiée, dupliquée, supprimée | une entrée |
| Lot créé, modifié, supprimé | une entrée, avec le montant perdu à la suppression |
| Valeur d'une ligne de DPGF modifiée | une entrée par ligne touchée |
| Ligne de DPGF supprimée | une entrée |
| Texte de CCTP enregistré | une entrée |
| Import d'un DPGF | une seule entrée de synthèse, pas une par ligne |

L'ajout d'une ligne vide ne laisse rien : elle ne porte aucune valeur. Ce qu'on
y écrit ensuite apparaît au journal comme une valeur venue de « — », donc rien
ne se perd. La suppression, elle, est toujours tracée : elle peut détruire un
montant.

### Export complet

Une archive zip, sans format propriétaire, téléchargeable depuis « Mes données » :

```
missions/<référence-opération>/
  dpgf.xlsx          le bordereau chiffré
  mission.json       toutes les données de l'opération
  cctp/<lot>/*.txt   un fichier texte par ouvrage décrit
base-prix/           la base personnelle, en Excel et en JSON
trames/              les trames en texte brut, plus leur JSON
referentiels/        corps d'état et entreprises
journal-audit.json   l'historique des modifications
LISEZ-MOI.txt        ce que contient l'archive et comment lire les montants
```

Les montants des fichiers JSON restent en entiers — centimes pour les montants,
dix-millièmes d'euro pour les prix unitaires — afin qu'aucun arrondi ne se perde
à la relecture.

### Rien ne part vers un tiers

Les polices sont téléchargées à la construction et servies par l'application
elle-même. Aucune page n'appelle un service extérieur à l'affichage : une
application qui porte des noms de clients et des montants n'a pas à signaler
chaque consultation au dehors, et elle reste lisible sur un serveur sans accès
sortant.

## Normes et DTU

### Ce que l'application ne fait pas, et pourquoi

Elle ne télécharge aucune norme. Ce n'est pas une limite technique :

- l'AFNOR n'expose aucune API publique de son catalogue ;
- les mentions légales de Norm'Info protègent la base par le droit d'auteur et
  par le droit *sui generis* des bases de données, et interdisent l'extraction
  répétée et systématique sans accord écrit ;
- le contenu des DTU est vendu par l'AFNOR et le CSTB, il n'est ni récupérable
  ni redistribuable.

Un aspirateur de normes exposerait l'économiste, pas l'application.

### Ce qu'elle fait à la place

Le risque réel n'est pas de manquer une norme parue, c'est d'en citer une qui
n'existe plus dans une pièce contractuelle signée. L'application traite
celui-là :

| Elle sait | Comment |
| --- | --- |
| Quelles normes vos textes citent | Détection dans le texte : `NF DTU 20.1`, `DTU 20-1`, `NF EN 206/CN`, `NF P 18-201`, `Eurocode 2`, écritures mélangées comprises |
| Lesquelles ne sont plus en vigueur | Confrontation au référentiel que vous tenez |
| Depuis quand vous ne l'avez pas vérifié | Chaque statut porte sa date ; au-delà de 18 mois il est signalé |
| Par quoi commencer | Le relevé part de vos propres CCTP : sept ans de textes contiennent déjà la liste qui compte |

Un DTU **annulé** cité dans un texte est une anomalie **bloquante** : le CCTP ne
se génère pas, comme pour un ouvrage sans texte. Une norme **remplacée**, **à
l'état de projet**, **non référencée** ou **au statut trop ancien** avertit sans
bloquer. Le forçage reste possible : c'est la décision de l'économiste.

Les références relevées automatiquement arrivent **sans statut vérifié** et
ressortent au contrôle tant qu'elles ne sont pas confirmées. L'application ne
présume jamais qu'une norme est en vigueur.

### Ce qu'elle ne fera jamais

Réécrire un texte de CCTP. Remplacer `NF DTU 20.1` par une autre référence
change ce que le marché prescrit : c'est une décision technique, et
l'économiste engage sa responsabilité professionnelle.

### Si une source officielle s'ouvre un jour

Le port `SourceNormes` existe déjà, sur le même patron que `SourcePrix`. Un
abonnement AFNOR avec licence de réutilisation, ou un jeu de données publiques,
se branche dans `src/infrastructure/sources-normes/` sans toucher au métier.
L'implémentation actuelle, `ReleveManuel`, rend ce qu'on lui donne et annonce
`automatique: false` — pour que l'interface ne promette pas ce qu'elle ne peut
pas tenir.

## Organisation du code

```
src/
  domain/          TypeScript pur, aucune I/O, testable en millisecondes
    money/           Money, PrixUnitaire, arrondis
    chiffrage/       cascade des coefficients, calcul de ligne, totaux, ratios
    situations/      avancement, cumuls, tableau financier, alerte de dérive
    offres/          écarts vis-à-vis de l'estimatif, offres à vérifier
    texte/           format des pièces écrites, variables de mission
    coherence/       contrôle DPGF vers CCTP avant export
    normes/          détection des normes citées, contrôle de leur statut
  application/     cas d'usage et ports
    ports/           SourcePrix, en attendant une éventuelle base tierce
    missions/        création, modification, duplication
    chiffrage/       recalcul persisté, arborescence, collage
    prix/            base de prix personnelle, import de classeur
    import/          analyse d'un DPGF, sans entrée-sortie
    dce/             textes, cohérence, assemblage des pièces
    trames/          bibliothèque de textes réutilisables
    audit/           journal des modifications et sa mise en forme
    normes/          référentiel des normes et DTU
    export/          archive complète des données du compte
    saisie.ts        lecture des nombres et unités d'un tableur français
  infrastructure/  Prisma cloisonné par propriétaire, authentification argon2id
    sources-prix/    implémentation du port SourcePrix
    sources-normes/  implémentation du port SourceNormes
    excel/           lecture de classeurs, génération du DPGF
    docx/            pièces écrites et conversion PDF
  app/             Next.js : pages, actions serveur
  components/      grille de chiffrage, formulaire de mission
prisma/
  schema.prisma    le modèle de données du §3 de la spécification
  seed.ts          la nomenclature TCE du §4
```

La règle de dépendance est simple : le domaine n'importe jamais Prisma, React, ni
le système de fichiers.

## Cloisonnement des données

Toutes les racines portent `owner_id`. Le filtre n'est pas écrit dans chaque
requête : une extension du client Prisma l'injecte à chaque lecture et le
renseigne à chaque écriture, donc aucune requête ne peut l'oublier. Un test
d'intégration tente délibérément de lire et de modifier les données d'un autre
propriétaire, et doit échouer.

## Cascade du coefficient d'ajustement local

Mission, puis lot, puis ligne. Le niveau le plus fin l'emporte, et l'origine de la
valeur appliquée est toujours remontée pour que l'interface puisse l'afficher.

```ts
resoudreCoefficient({ mission: '1.2500', lot: '1.3000', ligne: null })
// -> { valeur: 1.3, origine: 'lot' }
```
