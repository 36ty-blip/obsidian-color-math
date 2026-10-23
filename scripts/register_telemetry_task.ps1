# register_telemetry_task.ps1
# Registers the "ColorMath-TelemetryArchiver" task in Windows Task Scheduler
# using the native Windows Schedule.Service COM API (works in both pwsh 7 and powershell 5.1,
# requires zero Administrator elevation, and runs strictly under the interactive user session).

$ErrorActionPreference = "Stop"

$TaskName = "ColorMath-TelemetryArchiver"
$VbsPath = "C:\Users\aditya\Documents\CODES\TypeScript\obsidian-color-math\scripts\telemetry_silent.vbs"
$WorkDir = "C:\Users\aditya\Documents\CODES\TypeScript\obsidian-color-math"

$Service = New-Object -ComObject "Schedule.Service"
$Service.Connect()

$RootFolder = $Service.GetFolder("\")
$TaskDef = $Service.NewTask(0)

# Metadata
$TaskDef.RegistrationInfo.Description = "Archives Obsidian Color Math 14-day expiring GitHub traffic and release download telemetry once upon laptop logon, then exits completely."
$TaskDef.RegistrationInfo.Author = $env:USERNAME

# Settings: Run on battery, do not stop on battery, 2-minute hard timeout, ignore concurrent instances
$TaskDef.Settings.Enabled = $true
$TaskDef.Settings.AllowDemandStart = $true
$TaskDef.Settings.StartWhenAvailable = $true
$TaskDef.Settings.DisallowStartIfOnBatteries = $false
$TaskDef.Settings.StopIfGoingOnBatteries = $false
$TaskDef.Settings.ExecutionTimeLimit = "PT2M"
$TaskDef.Settings.MultipleInstances = 2 # IgnoreNew
$TaskDef.Settings.Hidden = $false

# Trigger 1: At Logon (TASK_TRIGGER_LOGON = 9) with 1-minute delay so Wi-Fi is connected
$Trigger = $TaskDef.Triggers.Create(9)
$Trigger.UserId = "$env:USERDOMAIN\$env:USERNAME"
$Trigger.Delay = "PT1M"
$Trigger.Enabled = $true

# Also add a Daily trigger (TASK_TRIGGER_DAILY = 2) with StartWhenAvailable in case the laptop wakes from sleep on a new day without a full reboot
$DailyTrigger = $TaskDef.Triggers.Create(2)
$DailyTrigger.StartBoundary = (Get-Date -Format "yyyy-MM-ddT10:00:00")
$DailyTrigger.DaysInterval = 1
$DailyTrigger.Enabled = $true

# Action: Execute wscript.exe (GUI subsystem -> 100% invisible, zero console flash)
$Action = $TaskDef.Actions.Create(0)
$Action.Path = "wscript.exe"
$Action.Arguments = "//B //NoLogo `"$VbsPath`""
$Action.WorkingDirectory = $WorkDir

# Register under current interactive user (6 = TASK_CREATE_OR_UPDATE, 3 = TASK_LOGON_INTERACTIVE_TOKEN)
$Registered = $RootFolder.RegisterTaskDefinition(
    $TaskName,
    $TaskDef,
    6,
    $null,
    $null,
    3
)

Write-Host "✔ Registered Windows Scheduled Task: $($Registered.Name)" -ForegroundColor Green
Write-Host "  • Triggers: At Laptop Logon (+1 min Wi-Fi delay) & Daily Wake Catch-Up" -ForegroundColor Cyan
Write-Host "  • Launcher: wscript.exe //B //NoLogo telemetry_silent.vbs (Zero console window flash)" -ForegroundColor Cyan
Write-Host "  • Behavior: Runs once per day (~2s), saves data/telemetry_history.json, and exits completely (0% background CPU)." -ForegroundColor Cyan
