@echo off
rem Start the Payload Pets deployer on Windows. Double-click this file or run: deploy.cmd
rem Then open http://localhost:8000
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
if errorlevel 1 pause
