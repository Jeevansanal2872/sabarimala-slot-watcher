@echo off
cd /d "%~dp0"
title Virtual Q Detector

echo Stopping any previous instances...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "Virtual Q Detector.exe" >nul 2>&1
timeout /t 1 /nobreak >nul

echo Starting Virtual Q Detector...
npm start
if errorlevel 1 (
  echo.
  echo An error occurred while starting Virtual Q Detector.
  pause
)
