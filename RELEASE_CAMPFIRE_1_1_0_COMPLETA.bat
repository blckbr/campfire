@echo off
setlocal EnableExtensions
chcp 65001 >nul
title CAMPFIRE 1.1.0 - RELEASE COMPLETA WINDOWS LINUX CLOUDFLARE GITHUB

set "ROOT=%~dp0"
if not exist "%ROOT%package.json" set "ROOT=C:\messenger\"

if not exist "%ROOT%package.json" (
  echo [ERRO] Nao encontrei o Campfire em "%~dp0" nem em C:\messenger.
  pause
  exit /b 1
)

if not exist "%ROOT%scripts\release-1.1.0-local-stage1.ps1" (
  echo [ERRO] Script Stage 1 ausente. Extraia o pacote de release dentro de C:\messenger.
  pause
  exit /b 2
)
if not exist "%ROOT%scripts\release-1.1.0-local-stage2-github.ps1" (
  echo [ERRO] Script Stage 2 ausente.
  pause
  exit /b 3
)

echo ==============================================================
echo  CAMPFIRE 1.1.0 - RELEASE COMPLETA
echo ==============================================================
echo.
echo Ordem protegida:
echo   1. Windows Setup + Portable x64
echo   2. Linux RPM + AppImage x86_64 via WSL
echo   3. campfire-br.pages.dev
echo   4. campfireweb.pages.dev
echo   5. GitHub main + tag/release v1.1.0
echo.
echo Se qualquer gate falhar, as etapas seguintes NAO sao executadas.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\release-1.1.0-local-stage1.ps1" -ProjectRoot "%ROOT%"
if errorlevel 1 goto :fail

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\release-1.1.0-local-stage2-github.ps1" -ProjectRoot "%ROOT%" -Repository "blckbr/campfire"
if errorlevel 1 goto :fail

echo.
echo ==============================================================
echo  CAMPFIRE 1.1.0 - RELEASE CONCLUIDA
echo ==============================================================
echo.
echo https://campfire-br.pages.dev/
echo https://campfireweb.pages.dev/
echo https://github.com/blckbr/campfire/releases/tag/v1.1.0
echo.
pause
exit /b 0

:fail
set "CODE=%errorlevel%"
if "%CODE%"=="0" set "CODE=1"
echo.
echo ==============================================================
echo  RELEASE INTERROMPIDA COM SEGURANCA
echo ==============================================================
echo Codigo de saida: %CODE%
echo Consulte C:\messenger\_campfire_release_logs\
echo Nenhuma etapa posterior e executada depois de uma falha.
echo.
pause
exit /b %CODE%
