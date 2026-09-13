@echo off
chcp 65001 >nul
title Diagnostic
cd /d "%~dp0"

echo.
echo   === Docker est-il installe et lance ? ===
docker version --format "   Docker {{.Server.Version}} repond." 2>nul
if errorlevel 1 echo    NON : lancez Docker Desktop, attendez que la baleine se stabilise.

echo.
echo   === Etat des deux services ===
docker compose ps

echo.
echo   === L application repond-elle ? ===
curl -s -o nul -w "   Reponse HTTP %%{http_code} sur http://localhost:3000" http://localhost:3000
if errorlevel 1 echo    Aucune reponse sur le port 3000.
echo.

echo.
echo   === 40 dernieres lignes du journal de l application ===
docker compose logs --tail 40 app

echo.
echo   === 15 dernieres lignes du journal de la base ===
docker compose logs --tail 15 db

echo.
echo   Copiez cette fenetre entiere si vous demandez de l aide.
echo.
pause
