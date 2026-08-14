@echo off
chcp 65001 >nul
title Atualizar Sistema Jaques Motorsport
setlocal
set "URL=https://github.com/joaovitorlopesparolin-tech/teste/raw/claude/jaques-motorsport-system-n3c5td/dist/sistema-jaques-motorsport.zip"
set "TMPZIP=%TEMP%\jaques-sistema.zip"
set "TMPDIR=%TEMP%\jaques-sistema-novo"

echo.
echo  ==========================================================
echo   ATUALIZAR O SISTEMA JAQUES MOTORSPORT
echo.
echo   Baixa a versao mais recente e substitui os arquivos do
echo   programa. OS SEUS DADOS NAO SAO TOCADOS - a pasta "data"
echo   com clientes, vendas e financeiro fica exatamente como esta.
echo   Precisa de internet. Leva 1 a 3 minutos.
echo  ==========================================================
echo.
pause

echo.
echo  [1/4] Baixando a versao mais recente...
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri '%URL%' -OutFile '%TMPZIP%' -UseBasicParsing } catch { exit 1 }"
if errorlevel 1 goto :falha_download
for %%F in ("%TMPZIP%") do if %%~zF LSS 1000000 goto :falha_download

echo  [2/4] Fechando o sistema...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
timeout /t 3 /nobreak >nul

echo  [3/4] Preparando os arquivos novos...
if exist "%TMPDIR%" rmdir /s /q "%TMPDIR%"
powershell -NoProfile -Command "try { Expand-Archive -Path '%TMPZIP%' -DestinationPath '%TMPDIR%' -Force } catch { exit 1 }"
if errorlevel 1 goto :falha_extrair
if not exist "%TMPDIR%\jaques-sistema\server.js" goto :falha_extrair

echo  [4/4] Instalando (a pasta "data" nao e alterada)...
robocopy "%TMPDIR%\jaques-sistema" "%~dp0." /E /XD data /XF "ATUALIZAR.bat" /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :falha_copia

rmdir /s /q "%TMPDIR%" 2>nul
del "%TMPZIP%" 2>nul

echo.
echo  Reabrindo o sistema...
if exist "%~dp0windows\iniciar-sistema.vbs" goto :abrir_vbs
start "" "%~dp0ABRIR O SISTEMA.bat"
goto :fim

:abrir_vbs
wscript "%~dp0windows\iniciar-sistema.vbs"

:fim
timeout /t 4 /nobreak >nul
start http://localhost:3000
echo.
echo  ==========================================================
echo   Pronto! Sistema atualizado e aberto no navegador.
echo   Seus dados continuam intactos.
echo  ==========================================================
echo.
pause
exit /b

:falha_download
echo.
echo   NAO CONSEGUI BAIXAR a atualizacao.
echo   Confira a internet e tente de novo. Nada foi alterado.
echo.
pause
exit /b

:falha_extrair
echo.
echo   O arquivo baixado veio incompleto. Tente de novo mais tarde.
echo   Nada foi alterado no sistema.
echo.
pause
exit /b

:falha_copia
echo.
echo   Nao consegui substituir os arquivos do programa.
echo   Feche o sistema (PARAR O SISTEMA.bat) e rode este atualizador
echo   de novo. Seus dados estao intactos.
echo.
pause
exit /b
