@echo off
chcp 65001 >nul
title Diagnostic
cd /d "%~dp0"

echo.
echo   === Quelle version tourne ? ===
rem Deux valeurs : celle des fichiers du dossier, et celle embarquee dans
rem l image qui tourne. Si elles different, l image n a pas ete reconstruite
rem apres la mise a jour — et c est la explication de bien des pannes qui
rem « persistent malgre la correction ».
if exist "VERSION" (
  set /p versionDossier=<VERSION
  call echo    Fichiers du dossier : %%versionDossier%%
) else (
  echo    Fichiers du dossier : aucun fichier VERSION ^(version anterieure au 17/09/2026^).
)
docker compose exec -T app cat VERSION 2>nul | findstr /r "." >nul
if errorlevel 1 (
  echo    Image en cours       : illisible ^(le conteneur ne tourne pas assez longtemps^).
  echo                           Cherchez « Version de l image » dans le journal plus bas.
) else (
  for /f "delims=" %%V in ('docker compose exec -T app cat VERSION 2^>nul') do echo    Image en cours       : %%V
)

echo.
echo   === Docker est-il installe et lance ? ===
docker version --format "   Docker {{.Server.Version}} repond." 2>nul
if errorlevel 1 echo    NON : lancez Docker Desktop, attendez que la baleine se stabilise.

echo.
echo   === Etat des deux services ===
rem « -a » montre aussi les conteneurs arretes. Un « Restarting » ou un
rem « Exited » ici explique a lui seul une page vide dans le navigateur :
rem Docker garde le port ouvert pendant que l application, derriere, redemarre
rem en boucle. C est exactement ce que Chrome appelle ERR_EMPTY_RESPONSE.
docker compose ps -a

echo.
echo   === Qui ecoute sur le port 3000 ? ===
netstat -ano | findstr ":3000" | findstr "LISTENING"
if errorlevel 1 echo    Personne n ecoute sur le port 3000.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  echo    Processus %%P :
  tasklist /fi "PID eq %%P" /nh
)

echo.
echo   === L application repond-elle ? ===
curl -s -o nul -w "   Reponse HTTP %%{http_code} sur http://localhost:3000" http://localhost:3000
if errorlevel 1 echo    Aucune reponse exploitable ^(voir le code curl ci-dessus^).
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
