@echo off
rem update-dsh.cmd - one-click launcher for update-dsh.ps1
rem ASCII-only; the ps1 is UTF-8 with BOM (pitfalls P1).
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-dsh.ps1"
