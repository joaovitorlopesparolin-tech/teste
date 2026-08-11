@echo off
chcp 65001 >nul
title Instalador - Sistema Jaques Motorsport
echo ==================================================
echo    INSTALADOR - SISTEMA JAQUES MOTORSPORT
echo ==================================================
echo.

if exist "%~dp0node.exe" (
  echo [OK] Node.js ja vem embutido neste pacote - nada a instalar.
) else (
  where node >nul 2>nul || winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
)

REM inicio automatico invisivel - sem precisar de administrador
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\Sistema Jaques Motorsport.vbs" echo CreateObject("WScript.Shell").Run "wscript.exe ""%~dp0windows\iniciar-sistema.vbs""", 0, False
echo [OK] Inicio automatico configurado - o sistema liga junto com o Windows.

wscript.exe "%~dp0windows\iniciar-sistema.vbs"
echo [OK] Sistema iniciado em segundo plano.

powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Sistema Jaques Motorsport.lnk'); $s.TargetPath='%~dp0ABRIR O SISTEMA.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()" >nul 2>nul
echo [OK] Atalho criado na Area de Trabalho.

timeout /t 3 /nobreak >nul
start http://localhost:3000
echo.
echo ==================================================
echo  PRONTO! O sistema abriu no navegador.
echo  Login inicial: admin / admin123 - troque a senha.
echo  No dia a dia: atalho da Area de Trabalho ou o
echo  arquivo ABRIR O SISTEMA.bat - como abrir um site.
echo ==================================================
pause
