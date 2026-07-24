@echo off
setlocal
chcp 65001 >nul
title Poli AI Assistant Diagnostics

set "DIAGNOSTICS_SCRIPT=%~dp0Poli-Diagnostics.ps1"
if not exist "%DIAGNOSTICS_SCRIPT%" (
  echo ERROR: The diagnostics script was not found.
  echo Expected file: "%DIAGNOSTICS_SCRIPT%"
  echo.
  pause
  exit /b 2
)

set "DIAGNOSTICS_ARGS="
if "%POLI_DIAGNOSTICS_TEST%"=="1" set "DIAGNOSTICS_ARGS=-NoOpen"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%DIAGNOSTICS_SCRIPT%" %DIAGNOSTICS_ARGS%
set "DIAGNOSTICS_EXIT=%ERRORLEVEL%"

echo.
if not "%DIAGNOSTICS_EXIT%"=="0" (
  echo Diagnostics failed with exit code %DIAGNOSTICS_EXIT%.
) else (
  echo Diagnostics completed.
  echo Send the report generated on the Desktop to the developer.
)
echo.
if not "%POLI_DIAGNOSTICS_NO_PAUSE%"=="1" pause
exit /b %DIAGNOSTICS_EXIT%
