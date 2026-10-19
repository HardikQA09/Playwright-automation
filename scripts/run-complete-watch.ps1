$env:WATCH = 'true'
& node (Join-Path $PSScriptRoot 'run-complete-suite.js') --headed
exit $LASTEXITCODE
