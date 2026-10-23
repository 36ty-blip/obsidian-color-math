' telemetry_silent.vbs
' Windowless background launcher for Obsidian Color Math Telemetry Archiver.
' Invoked once at Windows Logon by Task Scheduler ("ColorMath-TelemetryArchiver").
' Runs node scripts/telemetry.mjs --auto with WindowStyle = 0 (completely hidden, zero console flash)
' and exits immediately once the 2-second snapshot completes.

Dim WshShell, cmd
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\aditya\Documents\CODES\TypeScript\obsidian-color-math"
cmd = "node ""C:\Users\aditya\Documents\CODES\TypeScript\obsidian-color-math\scripts\telemetry.mjs"" --auto"
WshShell.Run cmd, 0, False
Set WshShell = Nothing
