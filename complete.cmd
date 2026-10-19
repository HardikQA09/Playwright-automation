@echo off
cd /d "%~dp0"
set RECORD_ALL_ARTIFACTS=true
set REPORT_EMAIL_TO=pankaj.bhatla@ooltool.com,syesha.sen@ooltool.com,chetan.thumar@quantuminfoway.com,vishal.chauhan@quantuminfoway.com,hardik.thanki@quantuminfoway.com
node scripts\run-complete-suite.js
exit /b %ERRORLEVEL%
