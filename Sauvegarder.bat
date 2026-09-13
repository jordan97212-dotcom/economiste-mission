@echo off
chcp 65001 >nul
title Sauvegarde des donnees
cd /d "%~dp0"

if not exist "sauvegardes" mkdir "sauvegardes"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set horodatage=%%I
set fichier=sauvegardes\donnees_%horodatage%.sql

echo.
echo   Sauvegarde en cours...
echo.

docker compose exec -T db pg_dump -U eco -d economiste > "%fichier%"
if errorlevel 1 goto erreur

for %%F in ("%fichier%") do set taille=%%~zF
if "%taille%"=="0" goto vide
if "%taille%"=="" goto vide

echo   Sauvegarde terminee :
echo   %fichier%
echo   %taille% octets
echo.
echo   Copiez ce fichier ailleurs : disque externe, ou service de
echo   sauvegarde en ligne. Une sauvegarde qui dort a cote de
echo   l original ne protege de rien.
echo.
pause
exit /b 0

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
