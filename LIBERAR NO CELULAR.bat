@echo off
chcp 65001 >nul
title Liberar acesso pelo celular - Sistema Jaques Motorsport
echo.
echo  Este passo libera o sistema no firewall do Windows para que
echo  CELULARES E OUTROS COMPUTADORES DO MESMO WI-FI consigam abrir.
echo  (De fora da rede da oficina ninguem acessa.)
echo.
echo  O Windows vai pedir permissao de administrador - clique em SIM.
echo.
pause
powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c netsh advfirewall firewall delete rule name=\"Sistema Jaques Motorsport\" >nul 2>&1 & netsh advfirewall firewall add rule name=\"Sistema Jaques Motorsport\" dir=in action=allow protocol=TCP localport=3000 profile=private,domain' -Verb RunAs"
echo.
echo ==========================================================
echo  Pronto! Agora, no celular (mesmo Wi-Fi), abra o endereco
echo  que aparece em:
echo.
echo  Administracao ^> Configuracoes ^> ACESSO PELO CELULAR
echo.
echo  (ou aponte a camera para o codigo QR daquela tela)
echo ==========================================================
pause
