#!/bin/sh
# Démarrage de l'application dans son conteneur.
#
# Trois étapes, à chaque lancement : appliquer les migrations qui manquent,
# poser la nomenclature si elle n'existe pas encore, puis démarrer. Aucune
# n'écrase de donnée existante — on peut donc redémarrer autant qu'on veut.
set -e

# Annoncer la version des le depart : c'est la premiere ligne du journal, et
# elle dit sans ambiguite quelle image tourne reellement.
if [ -f ./VERSION ]; then
  echo "  Version de l'image : $(cat ./VERSION)"
fi

PRISMA="node ./outils-prisma/node_modules/prisma/build/index.js"

# Docker Compose attend déjà que la base se déclare saine. Cette reprise ne
# couvre que le cas où elle accepte les connexions sans être tout à fait prête.
essai=1
while [ "$essai" -le 10 ]; do
  if $PRISMA migrate deploy; then
    break
  fi
  if [ "$essai" -eq 10 ]; then
    echo ""
    echo "✗ Impossible de préparer la base de données après dix tentatives."
    echo "  L'application ne démarre pas plutôt que de travailler sur un"
    echo "  schéma incertain. Voir LANCER-SUR-MON-PC.md, section « Si ça coince »."
    echo ""
    echo "  Si les lignes ci-dessus disent « Cannot find module », ce n'est pas"
    echo "  la base qui est en cause : c'est l'image qui est incomplète, et il"
    echo "  faut la reconstruire (Arreter.bat puis Demarrer.bat)."
    exit 1
  fi
  echo "  nouvelle tentative dans 3 s… (${essai}/10)"
  essai=$((essai + 1))
  sleep 3
done

node prisma/seed.mjs

echo ""
echo "  L'application est prête : ouvrez http://localhost:3000"
echo ""
exec node server.js
