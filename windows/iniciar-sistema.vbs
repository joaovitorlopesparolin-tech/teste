' Inicia o Sistema Jaques Motorsport em segundo plano (sem janela).
' Usa o Node embutido no pacote (node.exe); se nao houver, usa o do sistema.
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = pasta
node = pasta & "\node.exe"
If fso.FileExists(node) Then
  sh.Run """" & node & """ server.js", 0, False
Else
  sh.Run "cmd /c node server.js", 0, False
End If
