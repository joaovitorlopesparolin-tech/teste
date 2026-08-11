@echo off
chcp 65001 >nul
title Diagnostico - Sistema Jaques Motorsport
set "REL=%USERPROFILE%\Desktop\diagnostico-jaques.txt"
echo Coletando informacoes... aguarde uns 10 segundos.

> "%REL%" echo ===== DIAGNOSTICO - SISTEMA JAQUES MOTORSPORT =====
>> "%REL%" echo Data: %date% %time%
>> "%REL%" echo.
>> "%REL%" echo ----- Windows -----
>> "%REL%" ver
>> "%REL%" echo.
>> "%REL%" echo ----- Pasta onde este script esta -----
>> "%REL%" echo %~dp0
dir /b "%~dp0" >> "%REL%" 2>&1
>> "%REL%" echo.
>> "%REL%" echo ----- Node.js -----
where node >> "%REL%" 2>&1
node -v >> "%REL%" 2>&1
>> "%REL%" echo.
>> "%REL%" echo ----- winget disponivel? -----
where winget >> "%REL%" 2>&1
>> "%REL%" echo.
>> "%REL%" echo ----- Porta 3000 - sistema ja esta no ar? -----
netstat -ano | findstr :3000 >> "%REL%" 2>&1
>> "%REL%" echo.
>> "%REL%" echo ----- Processos node em execucao -----
tasklist | findstr /i node.exe >> "%REL%" 2>&1
>> "%REL%" echo.
>> "%REL%" echo ----- Inicio automatico configurado? -----
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Sistema Jaques Motorsport.vbs" (echo SIM - arquivo de inicio automatico existe>> "%REL%") else (echo NAO - arquivo de inicio automatico nao existe>> "%REL%")
>> "%REL%" echo.
>> "%REL%" echo ----- Teste real: iniciar o servidor e chamar a pagina -----
powershell -NoProfile -Command "try { $p = Start-Process node -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -RedirectStandardOutput ($env:TEMP+'\jq-out.txt') -RedirectStandardError ($env:TEMP+'\jq-err.txt') -PassThru -WindowStyle Hidden } catch { Add-Content '%REL%' ('Nao consegui executar o node: ' + $_.Exception.Message) }; Start-Sleep 4; try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 6; Add-Content '%REL%' ('>>> SISTEMA RESPONDEU: HTTP ' + $r.StatusCode + ' - ESTA FUNCIONANDO <<<') } catch { Add-Content '%REL%' ('Sistema nao respondeu no navegador: ' + $_.Exception.Message) }; Add-Content '%REL%' '--- mensagens do servidor ---'; Get-Content ($env:TEMP+'\jq-out.txt') -ErrorAction SilentlyContinue | Add-Content '%REL%'; Get-Content ($env:TEMP+'\jq-err.txt') -ErrorAction SilentlyContinue | Add-Content '%REL%'"
>> "%REL%" echo.
>> "%REL%" echo ===== FIM DO DIAGNOSTICO =====

echo.
echo Pronto! O arquivo diagnostico-jaques.txt foi criado na Area de Trabalho
echo e vai abrir agora. Copie TODO o conteudo e cole na conversa com o Claude.
start notepad "%REL%"
pause
