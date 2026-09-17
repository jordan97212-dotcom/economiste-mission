@echo off
chcp 65001 >nul
title Reparation de l historique des migrations
cd /d "%~dp0"

echo.
echo   Reparation de l historique des migrations
echo.
echo   A utiliser quand le demarrage s arrete sur l erreur P3005 :
echo   « The database schema is not empty ».
echo.
echo   Votre base contient des tables, mais Prisma n y trouve pas la trace
echo   de ce qui a deja ete applique. Il refuse alors d y toucher — c est
echo   une bonne prudence de sa part.
echo.
echo   Cet outil regarde la base elle-meme et reconstitue cette trace.
echo   Il ne cree, ne modifie et n efface AUCUNE de vos donnees : il
echo   n ecrit que dans la table d historique de Prisma.
echo.
pause

echo.
echo   Demarrage de la base de donnees...
docker compose up -d db
if errorlevel 1 goto erreur

echo.
docker compose run --rm --entrypoint node app outils/reparer-base.mjs
if errorlevel 1 goto echecOutil

echo.
echo   Historique reconstitue.
echo.
echo   Relancez maintenant Demarrer.bat : les migrations qui restent
echo   s appliqueront normalement.
echo.
pause
exit /b 0

:echecOutil
echo.
echo   La reparation n a pas abouti. Le detail est affiche juste au-dessus.
echo   Copiez cette fenetre entiere si vous demandez de l aide : elle dit
echo   exactement ce que contient votre base.
echo.
echo   Vos donnees n ont pas ete touchees.
echo.
pause
exit /b 1

:erreur
echo.
echo   Impossible de demarrer la base de donnees.
echo   Verifiez que Docker Desktop est lance, puis reessayez.
echo.
pause
exit /b 1
