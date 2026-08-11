@echo off
title Sistema Jaques Motorsport
echo ============================================
echo   Sistema Jaques Motorsport - modo visivel
echo   NAO FECHE esta janela enquanto usa o sistema
echo   Acesse: http://localhost:3000
echo ============================================
cd /d "%~dp0.."
if exist "%~dp0..\node.exe" ("%~dp0..\node.exe" server.js) else (node server.js)
pause
