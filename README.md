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
| 10 | Consultation des entreprises, analyse comparative des offres (phase 2) | Livré |
| 11 | Attribution, avenants, situations de travaux, suivi financier (phase 3) | Livré |
| 12 | Clôture : décompte général, réinjection des prix réels, archivage | Livré |
| 13 | Import de CCTP Word dans la bibliothèque de trames | Livré |
| 14 | Génération du CCTP depuis le DPGF, par appariement des trames | Livré |
| 15 | Versions de chiffrage figées et comparatif entre phases (point 10.4) | Livré |
| 16 | Type d’offre base/variante/option et export Excel du comparatif (point 10.8) | Livré |

Les trois phases de la spécification sont couvertes, du cadrage à la clôture.
On crée ou duplique une mission, on saisit son chiffrage au clavier ou par
import Excel, on s'appuie sur sa base de prix, on rédige les textes de CCTP et
on sort le bordereau et les pièces écrites en Excel, Word et PDF ; on consulte
les entreprises et on compare les offres ; on attribue, on suit les situations
et les avenants ; et à la fin, les prix réellement pratiqués viennent enrichir
la base pour l'opération suivante.

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
- **Le collage demande à quoi correspondent les colonnes** avant d'écrire quoi que
  ce soit. Voir plus bas : c'est un correctif, pas un confort.
- Enregistrement automatique par lots, avec un témoin d'état explicite.
- Totaux recalculés à la frappe, avec les mêmes fonctions de domaine que le
  serveur : l'affichage ne peut pas diverger de ce qui sera persisté.
- Coefficient hérité affiché en gris clair, coefficient propre à la ligne en noir.

### Ce que le collage demande avant d'écrire

Le collage remplissait les colonnes dans l'ordre fixe de la grille — code,
désignation, unité, quantité, prix, coefficient — à partir de celle où se
trouvait le curseur. Un tableur bâti autrement, le prix unitaire avant la
quantité par exemple, versait donc le prix dans la quantité et la quantité dans
le prix.

Le défaut n'était pas rattrapable en aval : les deux valeurs sont des nombres
parfaitement lisibles, donc la règle « une valeur illisible se signale » ne
s'appliquait pas. Rien ne se signalait, et le montant était faux.

Un collage ouvre désormais une fenêtre qui montre la correspondance proposée et
les premières lignes telles qu'elles seront collées. La proposition se lit
d'abord dans un en-tête quand il y en a un, sinon dans le contenu : une colonne
d'unités, une colonne de texte long, une colonne de codes se reconnaissent sans
ambiguïté. Départager deux colonnes de nombres, en revanche, n'est jamais tenu
pour acquis — ces colonnes-là sont marquées « à vérifier », parce que c'est
précisément là que se trompait l'ancien collage.

Une colonne peut être écartée, et la première ligne ignorée si c'est un en-tête.
Rien n'est écrit avant confirmation.

Un détail qui a son importance : `02.01` se lit aussi comme le nombre 2,01, et
tombait alors pile dans la plage d'un coefficient. En français la décimale
s'écrit avec une virgule, donc un séparateur point désigne un code — c'est la
règle appliquée, et elle a son test.

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

## Importer un CCTP existant

Des années de CCTP rédigés n'ont pas à être ressaisies. L'application lit un
document **Word**, le découpe en articles et vous laisse choisir lesquels
rejoignent la bibliothèque de trames.

### Word et pas PDF

La structure d'un document Word est explicite : un titre porte un style de
titre, une liste porte une numérotation. Un PDF ne rend qu'un texte à plat dont
il faudrait deviner la hiérarchie, avec un résultat allant de correct à
inexploitable selon le producteur du fichier. À contenu égal, l'import Word est
fidèle là où l'import PDF serait approximatif — et sur des prescriptions
techniques, l'approximation ne rend pas service.

Un `.doc` d'avant 2007 se réenregistre depuis Word. Le refus le dit, au lieu de
laisser l'économiste deviner.

### Ce qu'est un article

Un article est **le titre le moins profond qui porte directement du texte**. Ses
sous-titres éventuels sont repliés dedans en `## `, parce qu'un article de CCTP
a souvent des sous-points qui n'ont aucun sens séparés. Un titre de chapitre qui
ne contient que d'autres titres n'est pas proposé : il ne porterait aucune
prescription.

La hiérarchie se lit d'abord dans les styles Word, dans n'importe quelle langue
d'interface. À défaut, elle se lit dans une numérotation tapée à la main du type
« 2.1.3 Voile béton » — la refuser reviendrait à ne rien savoir importer de la
moitié des documents réels. La numérotation est retirée de l'intitulé : elle est
déjà dans la hiérarchie.

Le texte supprimé en révision reste dehors : on importe le document tel qu'il se
lit, pas son historique.

### Rien n'entre sans être coché

L'analyse et l'écriture sont deux gestes séparés. Lire un fichier ne touche pas
la base ; l'écran montre les articles trouvés, leur intitulé modifiable et le
début de leur texte ; seuls les articles cochés rejoignent la bibliothèque. Un
import de trente articles qu'on n'a pas relus ne vaut rien.

Quand aucun titre n'est reconnu, le document n'est pas perdu : il part en une
seule trame, à découper à la main, et l'écran explique pourquoi.

## Versions de chiffrage et comparatif

Un DPGF évolue entre l'avant-projet, le projet et le dossier de consultation.
Sans instantané, « l'écart vis-à-vis de l'estimatif initial » n'a pas de
référent — c'est la raison pour laquelle le suivi de chantier comparait
jusqu'ici au chiffrage courant, en le disant.

### Une version figée ne bouge plus

C'est ce qui lui donne sa valeur : elle sert de témoin, et un témoin qu'on
retouche ne témoigne de rien. Elle se supprime, mais ne se modifie pas — se
tromper de phase au figeage reste donc rattrapable.

L'instantané est **cohérent avec lui-même par construction** : le montant d'un
lot y est la somme des lignes qu'il porte, pas le total recopié depuis la base.
Les deux coïncident tant que le recalcul fait son travail, mais la comparaison
rapproche les totaux d'un instantané de ses propres lignes, et doit donc pouvoir
s'y fier.

### Ce que le comparatif répond vraiment

Pas « de combien le total a-t-il bougé », qu'une soustraction suffirait à dire,
mais **d'où vient l'écart**. Quarante mille euros entre l'APD et le PRO peuvent
venir d'une ligne dont la quantité a doublé ou de douze lignes apparues : ce
n'est pas le même sujet, et l'écran sépare les deux.

Chaque ligne est dite apparue, disparue, modifiée ou inchangée, et une ligne
modifiée nomme le champ qui a bougé — désignation, unité, quantité, prix
unitaire — avec l'ancienne et la nouvelle valeur.

L'appariement des lignes se fait par identifiant, qui survit aux modifications ;
à défaut par code d'ouvrage au sein du lot, puis par désignation. Une ligne
supprimée puis recréée reçoit un nouvel identifiant : sans ces replis, elle
compterait pour une disparition **et** une apparition, ce qui doublerait
faussement l'écart attribué aux mouvements de lignes. Un code présent en double
n'apparie rien : associer deux lignes au hasard inventerait une modification sur
la mauvaise.

### Le suivi de chantier s'y appuie enfin

L'écart de dérive se mesure désormais contre une version figée. Le **DCE** est
retenu en priorité : c'est le chiffrage sur lequel les entreprises ont remis
leurs offres, donc le seul auquel comparer le réalisé ait un sens contractuel. À
défaut, la dernière version figée. À défaut encore, le chiffrage courant — et
l'écran dit alors franchement qu'il n'a pas de référent stable, au lieu de
laisser croire le contraire.

## Générer le CCTP depuis le DPGF

Rédiger un CCTP revient, pour l'essentiel, à retrouver pour chaque ligne du
bordereau le texte qu'on a déjà écrit ailleurs. L'application fait ce
rapprochement lot par lot et propose d'appliquer les trames correspondantes.

### Comment le rapprochement se fait

Les trames retenues pour un lot sont celles de son corps d'état, plus les
généralités qui n'en portent aucun. Une trame de peinture n'est donc jamais
proposée dans un lot de gros œuvre.

La ressemblance se mesure sur les mots significatifs des deux désignations —
accents et pluriels neutralisés, mots trop fréquents écartés. Sans cela,
« fourniture et pose de carrelage » ressemblerait à « fourniture et pose de
faïence ». Les nombres comptent : « 20 » distingue un voile de 20 d'un voile de
16.

Une correspondance franche arrive **cochée** ; une correspondance approximative
est proposée avec son pourcentage et attend un regard. En deçà d'un tiers de
mots communs, rien n'est proposé : deux désignations de bâtiment partagent
toujours quelques mots, et une proposition au hasard ferait perdre plus de temps
qu'elle n'en gagne.

Un ouvrage qui porte déjà un texte est laissé tel quel. La génération complète
le CCTP, elle ne le réécrit pas.

### Ce qu'elle ne fait pas, et pourquoi

Un ouvrage dont aucune trame ne s'approche **ressort comme étant à rédiger**.
L'application n'écrit pas de prescription à sa place.

Ce n'est pas une limite technique. Un CCTP est une pièce contractuelle que
l'économiste signe : un texte inventé l'engagerait sur des tolérances, des
dosages ou des normes que personne n'a vérifiés, et une prescription fausse se
paie en travaux supplémentaires ou en litige. Le contrôle de cohérence signale
de toute façon ces ouvrages avant la génération du DCE, donc rien ne part
incomplet sans que ce soit dit.

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

## Consultation des entreprises et analyse des offres

Phase 2 de la spécification (§5.5). Depuis la fiche mission, chaque lot porte
un bouton « Consultation » vers son propre écran.

### Deux façons de saisir une offre

Un montant global par lot, ou une reprise ligne à ligne quand l'entreprise a
renvoyé le DPGF « à remplir ». La seconde s'appuie sur l'onglet technique
`_identifiants` que l'export pose déjà à côté des colonnes visibles : chaque
ligne retrouve son poste par un identifiant, jamais par un rapprochement sur
la désignation, qui peut avoir changé entre l'envoi et le retour du fichier.
Un poste que l'entreprise n'a pas chiffré, et un prix qu'on ne sait pas lire,
sont comptés et signalés séparément — jamais confondus avec un zéro.

### Tableau comparatif

Entreprises en colonnes, ouvrages en lignes, comme demandé. L'écart de chaque
offre vis-à-vis de l'estimatif s'affiche en euros et en pourcentage. La
mention « mieux-disant » ne se pose que parmi les offres marquées conformes :
la moins chère des offres écartées ne doit jamais gagner par ce seul fait.

Les écarts anormaux se signalent à deux niveaux, avec les mêmes seuils et la
même logique : le montant global de l'offre vis-à-vis de l'estimatif du lot et
de la médiane des offres reçues, et — pour les offres détaillées — chaque
ligne vis-à-vis de l'estimatif du poste. Une offre dont le total semble normal
peut cacher un prix anormalement bas sur un seul poste ; les deux niveaux de
contrôle se complètent.

### Brouillon de rapport d'analyse

Un premier jet chiffré part tout seul du tableau : offres reçues, écarts,
mieux-disant parmi les conformes. Il ne désigne jamais d'attributaire — ce
choix reste humain — et se termine toujours par une invite à le compléter. Le
texte se modifie comme celui d'un CCTP, avec le même enregistrement différé,
puis se télécharge en Word avec le tableau chiffré en regard.

### Base, variante, option — point 10.8

Une entreprise ne remet pas toujours une seule offre. Une **base** répond au
dossier tel qu'il est ; une **variante** propose une autre façon de faire le même
ouvrage ; une **option** est un complément chiffré à part, qui ne remplace rien.

La distinction n'est pas décorative. **Le classement ne retient que les offres de
base conformes.** Une variante moins chère ne devient donc jamais moins-disante :
elle ne répond pas au même dossier, et la désigner reviendrait à recommander
l'attribution d'un marché qui n'a pas été mis en concurrence. Les variantes et
les options figurent au tableau — elles comptent dans la décision — mais hors
classement, et l'écran le dit.

Deux conséquences sur les alertes. L'écart d'une **option** vis-à-vis de
l'estimatif n'est pas affiché : une option de 2 000 € face à un estimatif de
100 000 € serait signalée « anormalement basse » à chaque fois, ce qui
apprendrait à ignorer l'alerte. Une **variante**, qui couvre le même périmètre,
reste comparée normalement.

Enfin, puisqu'une même entreprise peut remettre plusieurs offres, son nom seul
ne suffit plus à les distinguer : colonnes du comparatif et messages d'écart
portent la nature de l'offre et son intitulé.

### Une remise globale, répartie

Une offre peut porter une remise globale, distincte des prix de chaque ligne.
Elle se soustrait du montant déclaré pour obtenir le montant net qui sert à
toute comparaison — jamais retirée d'une seule ligne au choix.

### Export Excel du comparatif

Le comparatif est ce qu'on envoie au maître d'ouvrage. Il ne sortait jusqu'ici
qu'en Word, à l'intérieur du rapport d'analyse : lisible, mais impossible à
reprendre. Le classeur porte deux feuilles — une synthèse, une ligne par offre
avec sa nature et son écart ; un détail croisant ouvrages et entreprises — et
des **nombres, pas du texte**, pour que le destinataire trie et recalcule sans
rien retaper.

Une cellule vide y signifie que l'entreprise n'a pas chiffré cet ouvrage. Jamais
zéro : elle ne l'a pas chiffré à zéro — règle 7.

Ce qui n'y figure pas : ni prix de base, ni coefficient d'ajustement. Ce sont
des données internes, et le comparatif sort de chez l'économiste — règle 8.

## Suivi financier de chantier

Phase 3 de la spécification (§5.6). Depuis la fiche mission, bouton
« Suivi de chantier ».

### L'attribution, maillon obligatoire

Une situation de travaux se calcule sur le marché du lot, jamais sur son
estimatif. Tant qu'aucune offre n'est retenue, le lot n'a pas de marché et
l'application refuse toute situation — avec un message qui dit pourquoi
plutôt qu'un champ grisé sans explication. Retenir une offre fixe le marché
au montant net de remise, recopié sur le lot : il ne doit pas changer sous
les pieds de l'économiste parce qu'une offre a été corrigée après coup.

Une offre non conforme peut être retenue — après régularisation, cela
arrive — mais le fait est journalisé tel quel. L'application constate, elle
ne juge pas à la place de l'économiste.

### Ce qu'une situation conserve vraiment

Une situation est **un montant cumulé validé à une date**. Le pourcentage
d'avancement n'est qu'une façon de le saisir, et un affichage.

La conséquence est voulue : quand un avenant élargit le marché, une situation
déjà validée ne bouge pas d'un centime — on ne récrit pas ce qui a été
certifié — et seul son pourcentage, qui n'est qu'une lecture, se recalcule.

Le montant de période n'est jamais saisi : il se déduit du cumul de la
situation moins celui de la précédente. Toute écriture sur un lot rechaîne
ses situations dans l'ordre, si bien que **la somme des périodes retombe
toujours exactement sur le cumul final**. Supprimer une situation du milieu
renumérote les suivantes et les rechaîne : une suite trouée se lit mal sur un
décompte.

### Retenue de garantie, avance, compte prorata

Point 10.6 de l'architecture. Les trois montants sont saisis par
l'économiste, pas déduits de règles codées en dur : les taux varient selon le
marché, le CCAP et les négociations, et une règle figée dans l'application se
tromperait souvent et en silence. Le domaine calcule le net à payer et les
cumuls, et sait proposer une retenue à un taux donné — un brouillon, jamais
une valeur imposée.

Le net à payer peut être négatif : une situation de régularisation en
moins-value existe, et la masquer serait pire que la montrer.

### Avenants

Un avenant peut porter sur un lot ou sur l'opération entière, et son montant
peut être négatif — une moins-value est un avenant comme un autre.

**Seuls les avenants acceptés déplacent le marché.** Un avenant proposé ou
refusé reste visible : c'est une trace utile en cas de contestation.

### Tableau de bord et alerte de dérive

Marché initial, avenants cumulés, marché actuel, travaux réalisés, reste à
réaliser, écart vis-à-vis de l'estimatif en euros et en pourcentage. L'alerte
se déclenche au seuil choisi sur la mission, 5 % par défaut.

La comparaison se fait avec la **version figée** retenue — le DCE en priorité.
Tant qu'aucune version n'a été figée, elle se fait avec l'estimatif courant, et
l'écran le dit franchement au lieu de laisser croire à une référence stable.
Voir « Versions de chiffrage et comparatif ».

Le tableau s'exporte en Excel, en deux feuilles — synthèse de l'opération et
détail par lot — avec des nombres et non du texte, pour que le destinataire
puisse les reprendre sans les retaper.

## Clôture de l'opération

### Le décompte général

Marché actuel, travaux exécutés, solde non exécuté, retenue de garantie à
restituer et net réglé, par lot puis pour l'opération entière. Le document
Word qui en sort s'appelle **projet** de décompte, et le dit en toutes lettres :
il ne comporte ni révision de prix, ni actualisation, ni intérêts moratoires,
ni pénalités.

Ce n'est pas un oubli. L'application ne tient aucune de ces données — pas
d'index BT, pas de dates de paiement, pas de constat de retard. Les calculer
demanderait de les inventer, et un décompte général est une pièce
contractuelle : un chiffre faux s'y paie cher. Le document sort donc complet
de ce qu'il sait et franc sur ce qu'il ignore, à compléter avant signature.

### La réinjection des prix réels

C'est ce qui referme la boucle du projet. À la clôture, l'application propose
les prix unitaires **de l'offre retenue**, ligne à ligne, en face de ceux qui
avaient été estimés, avec l'écart en pourcentage. Chaque ligne cochée part dans
la base de prix personnelle, avec le contexte de l'opération — type d'ouvrage,
nature des travaux, zone — et l'identifiant de la mission d'origine.

Deux règles, toutes deux dans la spécification :

- **le prix versé vient de l'entreprise, jamais de l'estimatif.** Verser son
  propre chiffrage reviendrait à se citer soi-même comme référence, et à
  confondre pour toujours ce qu'on avait prévu avec ce qui s'est pratiqué ;
- **rien n'entre en base sans avoir été coché.** L'écran propose, il n'écrit
  pas tout seul.

Un poste que l'entreprise n'a pas chiffré, un poste sans unité, un prix à zéro :
aucun ne devient un candidat, et chacun apparaît dans la liste des postes
écartés avec son motif. Un prix dont un équivalent existe déjà en base est
signalé « déjà en base » mais reste versable — deux relevés d'un même ouvrage,
c'est de la dispersion, pas un doublon.

### L'archivage

Clôturer passe l'opération en « terminée » et l'horodate. Rien n'est supprimé
ni verrouillé : le chiffrage, les pièces, les offres, les situations et le
journal restent entièrement consultables, et l'opération peut être rouverte.
Une clôture prononcée trop tôt ne doit pas être un piège.

## Dépendances et alertes de sécurité

`npm audit` sert de garde-fou, pas d'oracle : une alerte se juge sur l'usage
réel qu'en fait le projet, pas sur son étiquette de gravité.

### Ce qui a été traité

**Prisma** est monté de 6.2 à 6.19, dans la même majeure. **postcss** est forcé
en `^8.5.28` par un `overrides`, parce que la copie vulnérable était celle que
Next épingle en interne, pas la nôtre : corriger là évitait de sauter sur Next
16 pour une faille — du CSS attaquant traité par postcss — à laquelle un projet
dont tout le CSS est écrit à la main n'est pas exposé. **deepmerge-ts** est
forcé en `^8`, ce que le client Prisma accepte sans broncher. **Vitest** est
passé de 2 à 5, et les 444 tests sont repassés sans une seule modification.

De douze alertes, il en reste deux, et plus aucune haute ni critique.

### Ce qui n'a pas été traité, et pourquoi

Il reste `exceljs` et son `uuid`. L'avis porte sur un défaut de borne dans
`uuid` v3, v5 et v6 **quand un tampon est fourni**. ExcelJS n'appelle que
`uuidv4()`, sans argument — vérifié dans son source — et le projet n'utilise
`uuid` nulle part directement. L'application n'est donc pas exposée.

Surtout, le « correctif » que propose npm est `exceljs@3.4.0`, c'est-à-dire un
**retour en arrière** depuis la 4.4.0. Ce n'est pas une correction : ce serait
une régression sur le générateur du DPGF, pour une faille qui ne nous atteint
pas. L'alerte reste donc ouverte, sciemment.

Deux autres avis méritaient d'être relativisés au passage. Le critique de Vitest
ne vaut que si son interface web écoute, ce que ce projet ne lance jamais ; et
celui d'esbuild ne concerne que le serveur de développement. Ils ont quand même
été corrigés, parce que la montée de version ne coûtait rien.

## Organisation du code

```
src/
  domain/          TypeScript pur, aucune I/O, testable en millisecondes
    money/           Money, PrixUnitaire, arrondis
    chiffrage/       coefficients, calcul de ligne, totaux, ratios, comparaison de versions
    situations/      avancement, cumuls, tableau financier, décompte de solde
    offres/          écarts vis-à-vis de l'estimatif, anomalies, comparatif
    texte/           format des pièces écrites, lecture d'un CCTP Word, appariement
    coherence/       contrôle DPGF vers CCTP avant export
    normes/          détection des normes citées, contrôle de leur statut
    cloture/         décompte général, sélection des prix à réinjecter
  application/     cas d'usage et ports
    ports/           SourcePrix et SourceNormes, en attendant d'éventuelles sources tierces
    missions/        création, modification, duplication
    chiffrage/       recalcul persisté, arborescence, collage, versions figées
    prix/            base de prix personnelle, import de classeur
    import/          analyse d'un DPGF, sans entrée-sortie
    dce/             textes, cohérence, génération depuis les trames, assemblage
    trames/          bibliothèque de textes réutilisables
    audit/           journal des modifications et sa mise en forme
    normes/          référentiel des normes et DTU
    entreprises/     répertoire des entreprises
    consultations/   suivi des consultations par lot
    offres/          saisie et import des offres, tableau comparatif, rapport
    marche/          attribution d'un lot à une offre retenue
    avenants/        avenants de l'opération et des lots
    situations/      situations de travaux, rechaînage des cumuls
    suivi/           tableau de bord financier de chantier
    cloture/         décompte général, réinjection des prix, archivage
    export/          archive complète des données du compte
    saisie.ts        lecture des nombres et unités d'un tableur français
  infrastructure/  Prisma cloisonné par propriétaire, authentification argon2id
    sources-prix/    implémentation du port SourcePrix
    sources-normes/  implémentation du port SourceNormes
    excel/           lecture de classeurs, DPGF, suivi, comparatif des offres
    docx/            pièces écrites, rapport d'offres, décompte, lecture d'un CCTP, PDF
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
