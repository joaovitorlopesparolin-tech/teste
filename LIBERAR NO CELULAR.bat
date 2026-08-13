@echo off
chcp 65001 >nul
title Liberar acesso pelo celular - Sistema Jaques Motorsport

rem ── Ja estamos como administrador? ──────────────────────────────
net session >nul 2>&1
if %errorlevel% == 0 goto :admin

echo.
echo  Este passo libera o sistema no firewall do Windows para que
echo  CELULARES E OUTROS COMPUTADORES DO MESMO WI-FI consigam abrir.
echo  O sistema continua protegido: so entra quem tem usuario e senha.
echo.
echo  O Windows vai pedir permissao de administrador - clique em SIM.
echo.
pause
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b

rem ── Parte elevada: cria a regra do firewall ─────────────────────
:admin
echo Criando a regra do firewall...
netsh advfirewall firewall delete rule name="Sistema Jaques Motorsport" >nul 2>&1
netsh advfirewall firewall add rule name="Sistema Jaques Motorsport" dir=in action=allow protocol=TCP localport=3000 profile=any
if not %errorlevel% == 0 goto :falha

echo.
echo ==========================================================
echo  Pronto! Regra criada com sucesso.
echo.
echo  Agora, no celular - conectado no MESMO Wi-Fi - aponte a
echo  camera para o codigo QR em:
echo.
echo  Administracao ^> Configuracoes ^> ACESSO PELO CELULAR
echo ==========================================================
echo.
pause
exit /b

:falha
echo.
echo  Algo deu errado ao criar a regra. Tire uma foto desta tela
echo  e mande para o suporte.
echo.
pause
