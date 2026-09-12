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
| 2 | Missions : création, duplication, tableau de bord | À faire |
| 3 | Chiffrage : arborescence et grille éditable | À faire |
| 4 | Base de prix personnelle et assistance au prix | À faire |
| 5 | Import DPGF Excel | À faire |
| 6 | Export DPGF Excel | À faire |
| 7 | DCE : CCTP, CCAP, CCTG, contrôle de cohérence | À faire |
| 8 | Honoraires, export complet, journal d'audit | À faire |

L'interface web n'existe pas encore. Ce dépôt contient le modèle de données et
les calculs, c'est-à-dire ce dont tout le reste dépend.

## Démarrer

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run db:seed
npm test
```

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

## Organisation du code

```
src/
  domain/          TypeScript pur, aucune I/O, testable en millisecondes
    money/           Money, PrixUnitaire, arrondis
    chiffrage/       cascade des coefficients, calcul de ligne, totaux, ratios
    situations/      avancement, cumuls, tableau financier, alerte de dérive
    offres/          écarts vis-à-vis de l'estimatif, offres à vérifier
prisma/
  schema.prisma    le modèle de données du §3 de la spécification
  seed.ts          la nomenclature TCE du §4
```

La règle de dépendance est simple : le domaine n'importe jamais Prisma, React, ni
le système de fichiers. Les couches `application` et `infrastructure` arriveront
avec le lot 2.

## Cascade du coefficient d'ajustement local

Mission, puis lot, puis ligne. Le niveau le plus fin l'emporte, et l'origine de la
valeur appliquée est toujours remontée pour que l'interface puisse l'afficher.

```ts
resoudreCoefficient({ mission: '1.2500', lot: '1.3000', ligne: null })
// -> { valeur: 1.3, origine: 'lot' }
```
