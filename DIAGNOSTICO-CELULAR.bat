@echo off
chcp 65001 >nul
title Diagnostico do acesso pelo celular - Sistema Jaques Motorsport
set OUT=%USERPROFILE%\Desktop\diagnostico-celular.txt

echo Sistema Jaques Motorsport - diagnostico do acesso pelo celular > "%OUT%"
echo Data: %date% %time% >> "%OUT%"
echo. >> "%OUT%"

echo === ENDERECOS DE REDE DO COMPUTADOR === >> "%OUT%"
ipconfig >> "%OUT%"
echo. >> "%OUT%"

echo === REGRA DO FIREWALL (Sistema Jaques Motorsport) === >> "%OUT%"
netsh advfirewall firewall show rule name="Sistema Jaques Motorsport" >> "%OUT%" 2>&1
echo. >> "%OUT%"

echo === ESTADO DO FIREWALL === >> "%OUT%"
netsh advfirewall show allprofiles state >> "%OUT%" 2>&1
echo. >> "%OUT%"

echo === SISTEMA ESCUTANDO NA PORTA 3000 === >> "%OUT%"
netstat -ano | findstr :3000 >> "%OUT%"
echo. >> "%OUT%"

echo === TESTE DE ABERTURA PELO PROPRIO PC (pelos IPs da rede) === >> "%OUT%"
powershell -NoProfile -Command "$ips = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' }).IPAddress; foreach ($ip in $ips) { try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 ('http://' + $ip + ':3000'); Write-Output ($ip + ' -> ABRIU (HTTP ' + $r.StatusCode + ')') } catch { Write-Output ($ip + ' -> FALHOU: ' + $_.Exception.Message) } }" >> "%OUT%" 2>&1

echo.
echo ==========================================================
echo  Pronto! O arquivo "diagnostico-celular.txt" foi criado
echo  na Area de Trabalho. Envie ele na conversa com o Claude.
echo ==========================================================
echo.
pause
