@echo off
echo Instalando inicio automatico do Sistema Jaques Motorsport...
schtasks /create /f /tn "Sistema Jaques Motorsport" /tr "wscript.exe \"%~dp0iniciar-sistema.vbs\"" /sc onlogon
if %errorlevel%==0 (
  echo.
  echo Pronto! O sistema iniciara sozinho, sem janela, sempre que o Windows ligar.
  echo Iniciando agora tambem...
  wscript.exe "%~dp0iniciar-sistema.vbs"
) else (
  echo Falhou - tente clicar com o botao direito e Executar como administrador.
)
pause
