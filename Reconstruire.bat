@echo off
chcp 65001 >nul
title Reconstruction complete de l application
cd /d "%~dp0"

echo.
echo   Reconstruction complete de l application.
echo.
echo   A utiliser quand une correction ne semble pas prise en compte :
echo   Docker reconstruit alors tout depuis zero, sans reutiliser la moindre
echo   etape gardee en memoire.
echo.
echo   Vos donnees ne sont PAS touchees : la base et le dossier « donnees »
echo   vivent en dehors de l image. Seule l application est refabriquee.
echo.
echo   Comptez plusieurs minutes.
echo.
pause

if not exist "donnees\pieces" mkdir "donnees\pieces" 2>nul

echo.
echo   Arret des services...
docker compose down

echo.
echo   Reconstruction sans cache...
docker compose build --no-cache
if errorlevel 1 goto erreur

echo.
echo   Redemarrage...
docker compose up -d
if errorlevel 1 goto erreur

echo.
echo   Reconstruction terminee.
echo   Lancez Diagnostic.bat : les deux lignes « version » doivent enfin
echo   afficher la meme chose.
echo.
echo   Puis ouvrez http://localhost:3000
echo.
pause
exit /b 0

:erreur
echo.
echo   La reconstruction a echoue. Le message exact est affiche juste
echo   au-dessus : c est lui qu il faut lire, ou recopier si vous demandez
echo   de l aide.
echo.
pause
exit /b 1
