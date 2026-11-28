@echo off
setlocal
cd /d "%~dp0"
title Building Virtual Q Detector for Windows

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

echo [1/3] Installing dependencies (first time takes a few minutes)...
call npm install
if errorlevel 1 goto :fail

echo [2/3] Building the app...
call npm run dist:win
if errorlevel 1 goto :fail

echo [3/3] Done!
echo   Installer : dist\Virtual Q Detector Setup *.exe   (installs like a normal app)
echo   Portable  : dist\Virtual Q Detector *.exe          (just double-click, no install)
explorer dist
pause
exit /b 0

:fail
echo.
echo Build failed - scroll up for the error.
pause
exit /b 1
