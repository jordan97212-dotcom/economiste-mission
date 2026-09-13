@echo off
chcp 65001 >nul
title Arret de l application
cd /d "%~dp0"

echo.
echo   Arret de l application...
echo   Vos donnees restent enregistrees.
echo.

docker compose stop

echo.
echo   Arrete. Double-cliquez sur Demarrer.bat pour reprendre.
echo.
pause
