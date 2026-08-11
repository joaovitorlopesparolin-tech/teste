@echo off
title Sistema Jaques Motorsport
echo ============================================
echo   Sistema Jaques Motorsport - modo visivel
echo   NAO FECHE esta janela enquanto usa o sistema
echo   Acesse: http://localhost:3000
echo ============================================
cd /d "%~dp0.."
node server.js
pause
