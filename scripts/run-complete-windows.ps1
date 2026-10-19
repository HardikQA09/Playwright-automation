<#
Downloads GitHub main into the existing Oools_paywright folder (keeps .env),
then runs the complete suite with AIR, screenshots, and the report email.

No Git required.

  powershell -ExecutionPolicy Bypass -File scripts\run-complete-windows.ps1
#>

param(
  [string]$ProjectDir = 'C:\Users\BAPS\Documents\Oools_paywright'
)

$ErrorActionPreference = 'Stop'
$log = Join-Path $env:TEMP 'ool-complete-setup.log'

function Write-Log {
  param([string]$Message)
  $line = '{0} {1}' -f (Get-Date -Format o), $Message
  Add-Content -LiteralPath $log -Value $line
  Write-Host $line
}

try {
  Write-Log "Log file: $log"

  if (-not (Test-Path -LiteralPath $ProjectDir)) {
    $matches = @(Get-ChildItem 'C:\Users\BAPS\Documents' -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match 'ool' })
    Write-Log ("Project folder not found: {0}. Nearby: {1}" -f $ProjectDir, ($matches.FullName -join ', '))
    if ($matches.Count -eq 1) {
      $ProjectDir = $matches[0].FullName
      Write-Log "Using $ProjectDir"
    } else {
      throw "Project folder not found: $ProjectDir"
    }
  }

  $zip = Join-Path $env:TEMP 'ool-main.zip'
  $extract = Join-Path $env:TEMP 'ool-main-extract'
  $zipUrl = 'https://codeload.github.com/hardikrthanki/Playwright-automation/zip/refs/heads/main'

  Write-Log "Downloading $zipUrl"
  if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
    & curl.exe -L --fail --retry 3 -o $zip $zipUrl
    if ($LASTEXITCODE -ne 0) {
      throw "curl failed with exit code $LASTEXITCODE"
    }
  } else {
    Invoke-WebRequest -Uri $zipUrl -OutFile $zip
  }

  $zipStream = [System.IO.File]::OpenRead($zip)
  try {
    $b1 = $zipStream.ReadByte()
    $b2 = $zipStream.ReadByte()
  } finally {
    $zipStream.Close()
  }
  if ($b1 -ne 0x50 -or $b2 -ne 0x4B) {
    throw "Download is not a zip file: $zip"
  }
  Write-Log ("Zip size {0} bytes" -f (Get-Item -LiteralPath $zip).Length)

  if (Test-Path -LiteralPath $extract) {
    Remove-Item -LiteralPath $extract -Recurse -Force
  }
  New-Item -ItemType Directory -Path $extract | Out-Null

  if (Get-Command tar.exe -ErrorAction SilentlyContinue) {
    Write-Log 'Extracting with tar.exe'
    & tar.exe -xf $zip -C $extract
    if ($LASTEXITCODE -ne 0) {
      throw "tar extract failed with exit code $LASTEXITCODE"
    }
  } else {
    Write-Log 'Extracting with Expand-Archive'
    Expand-Archive -Force -LiteralPath $zip -DestinationPath $extract
  }

  $pkg = Get-ChildItem -LiteralPath $extract -Recurse -Filter package.json |
    Where-Object { (Get-Content -LiteralPath $_.FullName -Raw) -match '"complete"' } |
    Select-Object -First 1
  if (-not $pkg) {
    $pkg = Get-ChildItem -LiteralPath $extract -Recurse -Filter package.json | Select-Object -First 1
  }
  if (-not $pkg) {
    throw "package.json not found in $extract"
  }

  $src = $pkg.Directory.FullName
  Write-Log "Copying $src -> $ProjectDir"

  $envFile = Join-Path $ProjectDir '.env'
  $envBackup = Join-Path $env:TEMP 'ool-env-backup'
  if (Test-Path -LiteralPath $envFile) {
    Copy-Item -LiteralPath $envFile -Destination $envBackup -Force
    Write-Log 'Backed up .env'
  }

  & robocopy.exe $src $ProjectDir /E /XD .git /NFL /NDL /NJH /NJS /NP
  $copyCode = $LASTEXITCODE
  Write-Log "robocopy exit $copyCode"
  if ($copyCode -ge 8) {
    throw "robocopy failed with exit code $copyCode"
  }

  if (Test-Path -LiteralPath $envBackup) {
    Copy-Item -LiteralPath $envBackup -Destination $envFile -Force
    Write-Log 'Restored .env'
  }

  $runner = Join-Path $ProjectDir 'scripts\run-complete-suite.js'
  if (-not (Test-Path -LiteralPath $runner)) {
    throw "Still missing $runner"
  }
  Write-Log "Found $runner"

  Set-Location -LiteralPath $ProjectDir
  Write-Log "npm install in $ProjectDir"
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE"
  }

  $env:RECORD_ALL_ARTIFACTS = 'true'
  $env:REPORT_EMAIL_TO = 'pankaj.bhatla@ooltool.com,syesha.sen@ooltool.com,chetan.thumar@quantuminfoway.com,vishal.chauhan@quantuminfoway.com,hardik.thanki@quantuminfoway.com'

  Write-Log 'Starting complete suite'
  node .\scripts\run-complete-suite.js
  exit $LASTEXITCODE
}
catch {
  Write-Log ("ERROR: {0}" -f $_.Exception.Message)
  Write-Host "Full log: $log"
  exit 1
}
