# Faire tourner l'application sur votre PC

Pour un test réel, sur une opération que vous connaissez déjà. Tout reste sur
votre machine : aucune donnée ne sort, rien n'est publié sur internet.

Comptez vingt minutes la première fois, dont quinze d'attente pendant que
l'ordinateur travaille seul.

---

## 1. Installer Docker Desktop

Une seule chose à installer. Elle contient tout le reste.

1. Aller sur <https://www.docker.com/products/docker-desktop/>
2. Télécharger la version Windows, l'installer, **redémarrer le PC**.
3. Lancer Docker Desktop. Attendre que la baleine, en bas à droite près de
   l'horloge, cesse de bouger. C'est le signe qu'il est prêt.

Laissez Docker Desktop ouvert : l'application en a besoin pour tourner.

## 2. Récupérer l'application

1. Aller sur <https://github.com/jordan97212-dotcom/economiste-mission>
2. Bouton vert **Code**, puis **Download ZIP**.
3. Décompresser le dossier où vous voulez — par exemple
   `Documents\economiste-mission`.

Évitez le Bureau et les dossiers synchronisés avec OneDrive : la synchronisation
en arrière-plan ralentit l'application et peut verrouiller des fichiers.

## 3. Démarrer

Double-cliquer sur **`Demarrer.bat`**.

Une fenêtre noire s'ouvre. **Le premier lancement prend dix à quinze minutes** :
l'ordinateur construit l'application, puis prépare sa base de données. Les fois
suivantes, quelques secondes. Le navigateur s'ouvre tout seul une fois
l'application prête — sur un disque lent, la fenêtre peut afficher « toujours
en préparation » plusieurs fois avant d'y arriver : c'est normal, elle attend
jusqu'à cinq minutes après la construction avant d'abandonner.

Le navigateur s'ouvre tout seul sur l'application — et s'il ne s'ouvre pas, la
fenêtre noire affiche l'adresse à taper : `http://localhost:3000`. Si Windows affiche un
avertissement de sécurité sur un fichier téléchargé, choisir *Informations
complémentaires* puis *Exécuter quand même*.

## 4. Créer votre compte

Au premier écran, l'application demande de créer le compte : votre nom, une
adresse e-mail et un mot de passe d'au moins douze caractères.

Ce compte n'existe que sur votre PC. Il n'y a pas de récupération de mot de
passe : **notez-le quelque part de sûr.**

## 5. Au quotidien

| Pour | Double-cliquer sur |
| --- | --- |
| Démarrer | `Demarrer.bat` |
| Arrêter | `Arreter.bat` |
| Sauvegarder vos données | `Sauvegarder.bat` |
| Comprendre un problème | `Diagnostic.bat` |

Fermer la fenêtre noire n'arrête pas l'application : elle continue en arrière-plan.
Pour revenir dessus, ouvrir <http://localhost:3000> dans le navigateur.

---

## Sauvegardes : à faire dès le premier jour

L'application garde vos données sur votre disque dur. Un disque tombe en panne,
un PC se fait voler, une fausse manipulation arrive.

**`Sauvegarder.bat` écrit deux choses dans le dossier `sauvegardes`** : un
fichier `.sql` daté, qui contient toute la base, et une copie datée des pièces
déposées — plans, rapports, diagnostics. Ces pièces ne sont pas dans la base :
ce sont de vrais fichiers, rangés dans le dossier `donnees` à côté de
l'application. Une sauvegarde qui n'emporterait que le `.sql` laisserait des
plans référencés mais introuvables.

Lancez-le à la fin de chaque séance de travail sérieuse, et **copiez les deux
ailleurs** : disque externe, clé USB, ou service de sauvegarde en ligne. Une
sauvegarde qui dort à côté de l'original ne protège de rien.

Deuxième filet, indépendant : dans l'application, **Mes données → Télécharger
l'archive**. Vous obtenez un zip avec les bordereaux en Excel, les textes en
fichiers texte et tout le reste en JSON. Ce zip se relit sans l'application,
même dans dix ans, même si ce logiciel a disparu.

Les deux sont utiles : le premier restaure tout à l'identique, le second reste
lisible quoi qu'il arrive.

---

## Ce que vaut vraiment ce test

Le but n'est pas de vérifier que l'application fonctionne — les tests s'en
chargent. Le but est de voir si elle tient devant un vrai dossier.

**Prenez une opération passée dont vous connaissez déjà les chiffres.** C'est le
seul moyen de repérer une erreur : vous savez ce que le total doit donner.

Suggestion de parcours :

1. Créer la mission avec ses vraies caractéristiques : surface, budget,
   coefficient d'ajustement que vous appliquez réellement.
2. **Importer votre DPGF Excel** d'origine (bouton *Importer un DPGF*), plutôt
   que de tout ressaisir. C'est le passage le plus révélateur : vos fichiers ont
   leurs habitudes de mise en forme, et c'est là que ça coince si ça doit coincer.
3. Comparer le total obtenu avec celui de votre tableur d'origine. **S'ils
   diffèrent, c'est une information précieuse** — dites-le moi avec les deux
   chiffres, je saurai d'où vient l'écart.
4. Rédiger deux ou trois textes de CCTP, générer le CCTP en Word, et le relire
   comme si vous l'envoyiez.
5. Sortir le DPGF à remplir par l'entreprise, l'ouvrir dans Excel, saisir
   quelques prix : les montants doivent se calculer tout seuls.

Notez ce qui vous freine, même les détails : un mot mal choisi, un clic de trop,
une colonne au mauvais endroit. C'est exactement ce qui ne se voit pas depuis
le code.

---

## Si ça coince

**Lancez `Diagnostic.bat`** et copiez-moi la fenêtre entière. Elle contient
l'état des services et les journaux, c'est-à-dire la réponse dans la plupart des
cas.

Les trois causes les plus fréquentes :

| Ce que vous voyez | Ce que c'est |
| --- | --- |
| « Le démarrage a échoué » tout de suite | Docker Desktop n'est pas lancé, ou pas encore prêt. Attendre que la baleine se stabilise, relancer. |
| Le navigateur affiche une page d'erreur | L'application démarre encore. Attendre une minute, recharger la page. |
| La fenêtre dit que l'application met plus de temps que prévu | Elle continue probablement en arrière-plan. Ouvrez http://localhost:3000 pour vérifier, ou lancez `Diagnostic.bat`. |
| Le navigateur affiche `ERR_EMPTY_RESPONSE` | Quelque chose écoute sur le port 3000, mais rien ne répond : l'application redémarre en boucle derrière. Lancez `Diagnostic.bat` — la ligne « Etat des deux services » dira `Restarting` ou `Exited`, et le journal juste en dessous dira pourquoi. Si ce journal parle de `Cannot find module`, l'image est incomplète : `Arreter.bat`, puis `Demarrer.bat` pour la reconstruire. |
| La fenêtre dit « Pret. » mais aucun navigateur ne s'ouvre | L'application tourne : ouvrez votre navigateur et tapez `http://localhost:3000`. Le script essaie trois façons d'ouvrir le navigateur ; si aucune ne marche, c'est l'association du protocole `http` sous Windows qui est en cause, pas l'application. Mettez l'adresse en favori. |
| Le port 3000 est déjà utilisé | Un autre programme l'occupe. Me le dire : le changer prend une ligne. |

## Mettre à jour

Quand je livre des corrections : télécharger le ZIP à nouveau, remplacer les
fichiers, relancer `Demarrer.bat`. **Vos données ne bougent pas** — elles vivent
dans Docker, pas dans le dossier. Les modifications de structure s'appliquent
toutes seules au démarrage.

Par prudence, lancez `Sauvegarder.bat` avant toute mise à jour.

## Tout effacer

Si vous voulez repartir de zéro, ou désinstaller :

```
docker compose down -v
```

à taper dans une invite de commande ouverte dans le dossier. **Cette commande
efface définitivement toutes vos données** — d'où l'intérêt d'avoir sauvegardé
avant. `Arreter.bat`, lui, ne supprime rien.
