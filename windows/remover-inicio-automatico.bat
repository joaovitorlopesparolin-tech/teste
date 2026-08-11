@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Sistema Jaques Motorsport.vbs" 2>nul
schtasks /delete /f /tn "Sistema Jaques Motorsport" 2>nul
echo Inicio automatico removido.
pause
