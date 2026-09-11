@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d C:\messenger
if not exist package.json (
  echo [ERRO] Projeto Campfire nao encontrado em C:\messenger
  pause
  exit /b 1
)
if not exist node_modules\electron\dist\electron.exe (
  echo [ERRO] Electron nao encontrado. Execute primeiro o updater R6.6.6.15.
  pause
  exit /b 1
)
start "Campfire" "node_modules\electron\dist\electron.exe" .
exit /b 0
