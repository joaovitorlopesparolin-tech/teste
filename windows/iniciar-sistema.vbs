' Inicia o Sistema Jaques Motorsport em segundo plano (sem janela).
' De dois cliques neste arquivo. Para parar, use parar-sistema.bat.
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = pasta
sh.Run "cmd /c node server.js", 0, False
