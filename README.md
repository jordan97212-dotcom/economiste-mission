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
| 8 | Honoraires, export complet, journal d'audit | À faire |

La phase 1 de la spécification est couverte : cadrage de mission, chiffrage
détaillé et rédaction du DCE. On crée ou duplique une mission, on saisit son
chiffrage au clavier ou par import Excel, on s'appuie sur sa base de prix, on
rédige les textes de CCTP, et on sort le bordereau et les pièces écrites en
Excel, Word et PDF. Restent les phases 2 et 3 : consultation des entreprises,
puis suivi financier de chantier.

## Démarrer

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
  application/     cas d'usage et ports
    ports/           SourcePrix, en attendant une éventuelle base tierce
    missions/        création, modification, duplication
    chiffrage/       recalcul persisté, arborescence, collage
    prix/            base de prix personnelle, import de classeur
    import/          analyse d'un DPGF, sans entrée-sortie
    dce/             textes, cohérence, assemblage des pièces
    trames/          bibliothèque de textes réutilisables
    saisie.ts        lecture des nombres et unités d'un tableur français
  infrastructure/  Prisma cloisonné par propriétaire, authentification argon2id
    sources-prix/    implémentation du port SourcePrix
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
