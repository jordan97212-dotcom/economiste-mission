@echo off
chcp 65001 >nul
title Missions - economiste de la construction
cd /d "%~dp0"

echo.
echo   Demarrage de l application...
echo   Le tout premier lancement prend plusieurs minutes : il construit
echo   l application. Les suivants prennent quelques secondes.
echo.

docker compose up -d --build
if errorlevel 1 goto erreur

echo.
echo   Attente du demarrage...
set /a essais=0
:attendre
set /a essais+=1
curl -s -o nul http://localhost:3000 && goto pret
if %essais% geq 60 goto lent
timeout /t 2 /nobreak >nul
goto attendre

:pret
echo   Pret.
start "" http://localhost:3000
echo.
echo   L application tourne dans votre navigateur.
echo   Vous pouvez fermer cette fenetre : elle continue de tourner.
echo   Pour l arreter, double-cliquez sur Arreter.bat
echo.
pause
exit /b 0

:lent
echo.
echo   L application met plus de temps que prevu.
echo   Ouvrez http://localhost:3000 dans quelques instants.
echo   Si rien ne vient, lancez Diagnostic.bat
echo.
pause
exit /b 0

:erreur
echo.
echo   Le demarrage a echoue.
echo   Verifiez que Docker Desktop est lance (icone baleine, en bas a droite).
echo   Puis relancez ce fichier. Si cela persiste, lancez Diagnostic.bat
echo.
pause
exit /b 1
