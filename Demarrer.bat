@echo off
chcp 65001 >nul
title Missions - economiste de la construction
cd /d "%~dp0"

echo.
echo   Demarrage de l application...
echo   Le tout premier lancement prend plusieurs minutes : il construit
echo   l application, prepare la base de donnees et verifie sa nomenclature.
echo   Les lancements suivants prennent quelques secondes.
echo.

docker compose up -d --build
if errorlevel 1 goto erreur

echo.
echo   Construction terminee. Attente du demarrage de l application...
echo   (jusqu a 5 minutes au premier lancement : preparation de la base)
set /a essais=0

:attendre
set /a essais+=1
call :verifierReponse
if "%PRETE%"=="1" goto pret
if %essais% geq 150 goto lent
set /a reste=150-%essais%
set /a affichage=%essais% %% 15
if %affichage%==0 echo   ...toujours en preparation ^(jusqu a %reste% x 2 secondes restantes^)
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
echo   L application met plus de temps que prevu ^(plus de 5 minutes^).
echo   Elle continue probablement de se preparer en arriere-plan.
echo   Ouvrez http://localhost:3000 dans votre navigateur pour verifier,
echo   ou lancez Diagnostic.bat pour voir ce qui se passe reellement.
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

rem --------------------------------------------------------------------
rem Teste si l application repond, sans dependre uniquement de curl :
rem certains PC (image d entreprise, Windows ancien) ne l ont pas dans
rem le chemin. On retombe alors sur PowerShell, present partout.
rem --------------------------------------------------------------------
:verifierReponse
set PRETE=0
where curl >nul 2>nul
if errorlevel 1 goto viaPowershell
curl -s -o nul --max-time 3 http://localhost:3000
if not errorlevel 1 set PRETE=1
goto :eof

:viaPowershell
powershell -NoProfile -Command "try { (New-Object Net.WebClient).DownloadString('http://localhost:3000') | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 set PRETE=1
goto :eof
