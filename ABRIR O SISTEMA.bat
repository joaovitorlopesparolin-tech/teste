@echo off
title Abrindo o Sistema Jaques Motorsport...
echo Abrindo o sistema... aguarde alguns segundos.
wscript.exe "%~dp0windows\iniciar-sistema.vbs"
timeout /t 3 /nobreak >nul
start http://localhost:3000
exit
