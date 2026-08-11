@echo off
chcp 65001 >nul
title Instalador - Sistema Jaques Motorsport
echo ==================================================
echo    INSTALADOR - SISTEMA JAQUES MOTORSPORT
echo ==================================================
echo.

REM ---------- 1) Node.js instalado? ----------
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js nao encontrado. Tentando instalar automaticamente...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
)
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo Nao consegui instalar sozinho. Vou abrir o site do Node.js:
  echo instale (botao verde LTS, avancar ate o fim) e rode este INSTALAR.bat de novo.
  start https://nodejs.org
  pause
  exit /b 1
)
echo [OK] Node.js presente.

REM ---------- 2) Inicio automatico e invisivel (sem admin) ----------
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\Sistema Jaques Motorsport.vbs" echo CreateObject("WScript.Shell").Run "wscript.exe ""%~dp0windows\iniciar-sistema.vbs""", 0, False
echo [OK] O sistema iniciara sozinho, sem janela, junto com o Windows.

REM ---------- 3) Inicia agora ----------
wscript.exe "%~dp0windows\iniciar-sistema.vbs"
echo [OK] Sistema iniciado em segundo plano.

REM ---------- 4) Atalho na Area de Trabalho ----------
powershell -NoProfile -Command "Set-Content -Path ([Environment]::GetFolderPath('Desktop')+'\Sistema Jaques Motorsport.url') -Value '[InternetShortcut]','URL=http://localhost:3000'" >nul 2>nul
echo [OK] Atalho 'Sistema Jaques Motorsport' criado na Area de Trabalho.

REM ---------- 5) Abre o navegador ----------
timeout /t 3 /nobreak >nul
start http://localhost:3000
echo.
echo ==================================================
echo  PRONTO! O sistema abriu no navegador.
echo  Login inicial: admin / admin123 (troque a senha)
echo  Nos proximos dias e so usar o atalho da Area de
echo  Trabalho - nada precisa ficar aberto.
echo ==================================================
pause
