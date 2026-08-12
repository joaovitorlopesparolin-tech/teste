@echo off
chcp 65001 >nul
title Parar Sistema Jaques Motorsport
echo Encerrando o sistema...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
echo.
echo ==========================================================
echo  Sistema parado. Os dados estao salvos na pasta "data".
echo.
echo  Use este botao antes de ATUALIZAR o sistema (extrair um
echo  ZIP novo por cima da pasta). Depois e so abrir de novo
echo  com "ABRIR O SISTEMA.bat".
echo ==========================================================
pause
