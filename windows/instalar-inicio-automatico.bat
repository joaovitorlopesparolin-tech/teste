@echo off
echo Configurando inicio automatico do Sistema Jaques Motorsport...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\Sistema Jaques Motorsport.vbs" echo CreateObject("WScript.Shell").Run "wscript.exe ""%~dp0iniciar-sistema.vbs""", 0, False
echo Pronto! O sistema iniciara sozinho, sem janela, sempre que o Windows ligar.
echo Iniciando agora tambem...
wscript.exe "%~dp0iniciar-sistema.vbs"
pause
