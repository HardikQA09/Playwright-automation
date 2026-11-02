<#
  Registers the OolTool test schedules in Windows Task Scheduler.

    npm run schedule:register                 create / update the tasks
    npm run schedule:register -- -Remove      delete them
    npm run schedule:register -- -DailyAt 05:30 -EveryTwoDaysAt 08:00 -WeeklyAt 22:00 -WeeklyDay Saturday

  Each task runs "node scripts/run-scheduled.js <suite> --email", which runs the
  tests, builds the report, and emails Pankaj + REPORT_EMAIL_TO. Output goes to
  logs\scheduled-*.log. Only one scheduled run executes at a time (the others
  skip), because they share one test account and one test-results folder.

  Pass -NoEmail to register without --email.
#>
param(
  [string]$DailyAt = '06:00',
  [string]$EveryTwoDaysAt = '09:00',
  [string]$WeeklyAt = '22:00',
  [string]$WeeklyDay = 'Saturday',
  [string[]]$Only,
  [switch]$Remove,
  [switch]$NoEmail
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$logs = Join-Path $project 'logs'

$tasks = @(
  @{ Name = 'OolTool-Daily';        Suite = 'daily';      Trigger = { New-ScheduledTaskTrigger -Daily -At $DailyAt } },
  @{ Name = 'OolTool-Every2Days';   Suite = 'every2days'; Trigger = { New-ScheduledTaskTrigger -Daily -DaysInterval 2 -At $EveryTwoDaysAt } },
  @{ Name = 'OolTool-Weekly';       Suite = 'weekly';     Trigger = { New-ScheduledTaskTrigger -Weekly -DaysOfWeek $WeeklyDay -At $WeeklyAt } }
)

foreach ($task in $tasks) {
  # -Only daily   (or every2days, weekly) registers just those suites
  if ($Only -and ($Only -notcontains $task.Suite)) { continue }

  if ($Remove) {
    Unregister-ScheduledTask -TaskName $task.Name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed $($task.Name)"
    continue
  }

  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $log = Join-Path $logs "scheduled-$($task.Suite).log"
  $emailFlag = if ($NoEmail) { '' } else { ' --email' }

  $action = New-ScheduledTaskAction `
    -Execute 'cmd.exe' `
    -Argument "/c `"`"$node`" scripts\run-scheduled.js $($task.Suite)$emailFlag >> `"$log`" 2>&1`"" `
    -WorkingDirectory $project

  $settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 8) `
    -MultipleInstances IgnoreNew

  Register-ScheduledTask `
    -TaskName $task.Name `
    -Action $action `
    -Trigger (& $task.Trigger) `
    -Settings $settings `
    -Description "OolTool Playwright $($task.Suite) run, report and email" `
    -Force | Out-Null

  Write-Host "Registered $($task.Name)  ($($task.Suite))  log: $log"
}

if (-not $Remove) {
  Write-Host ''
  Write-Host 'Note: the PC must be on (and the user logged in) at run time.'
  Write-Host 'Test now: Start-ScheduledTask -TaskName OolTool-Daily'
}
