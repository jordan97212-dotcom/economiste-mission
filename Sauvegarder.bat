@echo off
chcp 65001 >nul
title Sauvegarde des donnees
cd /d "%~dp0"

if not exist "sauvegardes" mkdir "sauvegardes"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set horodatage=%%I
set fichier=sauvegardes\donnees_%horodatage%.sql
set dossierPieces=sauvegardes\pieces_%horodatage%

echo.
echo   Sauvegarde en cours...
echo.

docker compose exec -T db pg_dump -U eco -d economiste > "%fichier%"
if errorlevel 1 goto erreur

for %%F in ("%fichier%") do set taille=%%~zF
if "%taille%"=="0" goto vide
if "%taille%"=="" goto vide

echo   Base de donnees sauvegardee :
echo   %fichier% ^(%taille% octets^)

rem Les plans et pieces deposees ne sont pas dans la base : ils vivent dans
rem le dossier « donnees ». Une sauvegarde qui n emporterait que le SQL
rem laisserait des pieces referencees mais introuvables.
if exist "donnees\pieces" (
  echo.
  echo   Copie des pieces deposees ^(plans, rapports, diagnostics^)...
  xcopy "donnees\pieces" "%dossierPieces%" /E /I /Q /Y >nul
  if errorlevel 1 goto piecesEchec
  echo   Pieces sauvegardees :
  echo   %dossierPieces%
) else (
  echo.
  echo   Aucune piece deposee a sauvegarder.
)

echo.
echo   Copiez ces deux elements ailleurs : disque externe, ou service de
echo   sauvegarde en ligne. Une sauvegarde qui dort a cote de
echo   l original ne protege de rien.
echo.
pause
exit /b 0

:piecesEchec
echo.
echo   La base est sauvegardee, mais la copie des pieces a echoue.
echo   Vos plans sont toujours dans le dossier « donnees » : copiez-le
echo   a la main avant de considerer la sauvegarde comme complete.
echo.
pause
exit /b 1

:vide
if exist "%fichier%" del "%fichier%"
echo   La sauvegarde est vide : elle a ete supprimee plutot que de vous
echo   laisser croire que vos donnees sont a l abri.
echo   L application est-elle demarree ? Lancez Demarrer.bat puis reessayez.
echo.
pause
exit /b 1

:erreur
echo   La sauvegarde a echoue.
echo   Verifiez que l application est demarree (Demarrer.bat).
echo.
pause
exit /b 1
