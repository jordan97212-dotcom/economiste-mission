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
if %essais%==30 call :montrerJournal 15
timeout /t 2 /nobreak >nul
goto attendre

:pret
echo   Pret.
call :ouvrirNavigateur
echo.
echo   L application tourne.
echo.
echo   Si aucune fenetre de navigateur ne s est ouverte, ouvrez le vous-meme
echo   et tapez cette adresse ^(elle ne change jamais^) :
echo.
echo        http://localhost:3000
echo.
echo   Vous pouvez fermer cette fenetre : l application continue de tourner.
echo   Pour l arreter, double-cliquez sur Arreter.bat
echo.
pause
exit /b 0

:lent
echo.
echo   L application met plus de temps que prevu ^(plus de 5 minutes^).
echo   Voici ce qu elle raconte — la cause est presque toujours dans ces lignes :
echo.
call :montrerJournal 30
echo.
echo   J ouvre quand meme le navigateur sur http://localhost:3000 : si elle
echo   finit de se preparer, la page apparaitra en rechargeant.
call :ouvrirNavigateur
echo.
echo   Si la page reste introuvable, lancez Diagnostic.bat et envoyez la
echo   fenetre entiere.
echo.
pause
exit /b 0

:erreur
echo.
echo   Le demarrage a echoue avant meme que l application ne se lance.
echo.
echo   Cause la plus frequente : Docker Desktop n est pas demarre. Regardez
echo   l icone baleine en bas a droite, attendez qu elle se stabilise, puis
echo   relancez ce fichier.
echo.
echo   Le message d erreur exact est affiche juste au-dessus : c est lui
echo   qu il faut lire, ou recopier si vous demandez de l aide.
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

rem --------------------------------------------------------------------
rem Les dernieres lignes du journal de l application. Quand le demarrage
rem traine, la raison y est presque toujours ecrite noir sur blanc ;
rem l afficher ici evite d avoir a lancer Diagnostic.bat pour la voir.
rem --------------------------------------------------------------------
:montrerJournal
docker compose logs --tail %1 app 2>nul
goto :eof

rem --------------------------------------------------------------------
rem Ouvrir le navigateur par defaut. « start » y suffit presque toujours,
rem mais pas partout : session ouverte en administrateur, association du
rem protocole http absente, image d entreprise verrouillee. On essaie donc
rem les trois voies connues plutot que d abandonner a la premiere.
rem
rem explorer.exe renvoie 1 meme quand il reussit : c est pour cela qu il
rem vient en dernier, et qu on ne teste pas son code de retour.
rem --------------------------------------------------------------------
:ouvrirNavigateur
start "" "http://localhost:3000"
if not errorlevel 1 goto :eof
echo   ^(la methode habituelle n a pas repondu, j en essaie une autre^)
rundll32 url.dll,FileProtocolHandler "http://localhost:3000"
if not errorlevel 1 goto :eof
explorer "http://localhost:3000"
goto :eof
