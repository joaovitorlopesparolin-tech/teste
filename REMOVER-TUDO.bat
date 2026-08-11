@echo off
chcp 65001 >nul
title Remover Sistema Jaques Motorsport
echo Encerrando o sistema, se estiver rodando...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
echo Removendo o inicio automatico...
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Sistema Jaques Motorsport.vbs" 2>nul
schtasks /delete /f /tn "Sistema Jaques Motorsport" >nul 2>nul
echo Removendo o atalho da Area de Trabalho...
del "%USERPROFILE%\Desktop\Sistema Jaques Motorsport.url" 2>nul
echo.
echo ============================================
echo  Pronto! Todos os vestigios foram removidos.
echo  Seu Windows esta exatamente como era antes.
echo  O Node.js continua instalado - e inofensivo
echo  e nao roda nada sozinho. Se quiser tirar:
echo  Configuracoes - Aplicativos - Node.js - Desinstalar
echo ============================================
pause
