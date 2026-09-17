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
echo   === Les pieces deposees ^(plans, rapports^) ===
if exist "donnees\pieces" (
  dir /s /b "donnees\pieces" 2>nul | find /c /v "" > "%TEMP%\nbpieces.txt"
  set /p nbpieces=<"%TEMP%\nbpieces.txt"
  del "%TEMP%\nbpieces.txt" 2>nul
  call echo    Dossier present : %%nbpieces%% fichier^(s^).
) else (
  echo    Aucun dossier « donnees\pieces » : normal si vous n avez rien depose.
)

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
