' Lanza run_scrape.bat sin ventana visible.
' Uso desde Task Scheduler:
'   Program/script: wscript.exe
'   Argumentos:     "C:\Users\viroc\OneDrive\Escritorio\ONPE_API\run_scrape_hidden.vbs"
'
' El tercer argumento de Run() es False => fire-and-forget (no esperar).
' El segundo es 0 => ventana oculta.

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir
shell.Run Chr(34) & fso.BuildPath(scriptDir, "run_scrape.bat") & Chr(34), 0, False
