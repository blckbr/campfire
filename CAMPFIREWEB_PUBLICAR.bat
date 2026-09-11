@echo off
setlocal EnableExtensions
chcp 65001 >nul
title CAMPFIREWEB 1.1.0 - PUBLICAR CLOUDFLARE PAGES

cd /d "%~dp0"

echo ==============================================================
echo  CAMPFIREWEB 1.1.0 - VALIDAR E PUBLICAR
echo  Build protegido: configuracao - testes - bundle - deploy - validacao
echo ==============================================================
echo.
echo Projeto Cloudflare Pages: campfireweb
echo URL: https://campfireweb.pages.dev/
echo Requer: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
echo.

if not exist package.json (
  echo [ERRO] Execute este BAT na raiz do Campfire 1.1.0.
  pause
  exit /b 1
)

where node >nul 2>&1 || (
  echo [ERRO] Node.js nao foi encontrado no PATH.
  pause
  exit /b 2
)
where npm >nul 2>&1 || (
  echo [ERRO] npm nao foi encontrado no PATH.
  pause
  exit /b 3
)

set "CAMPFIRE_DESKTOP_SOURCE=C:\messenger"

echo [1/7] Preparando configuracao publica do CampfireWeb...
node scripts\prepare-campfireweb-env.mjs
if errorlevel 1 goto :fail

echo.
echo [2/7] Instalando exatamente o package-lock atual...
call npm ci
if errorlevel 1 goto :fail

echo.
echo [3/7] Testando CampfireWeb...
call npm run test:campfireweb
if errorlevel 1 goto :fail
node --test tests\campfireweb-env-publication-regression.test.mjs
if errorlevel 1 goto :fail
node --test tests\campfireweb-oauth-return-regression.test.mjs
if errorlevel 1 goto :fail

echo.
echo [4/7] Gerando build Web...
call npm run build:campfireweb
if errorlevel 1 goto :fail

echo.
echo [5/7] Validando o bundle antes de publicar...
node scripts\verify-campfireweb-build.mjs
if errorlevel 1 goto :fail

echo.
echo [6/7] Publicando no Cloudflare Pages...
call npx wrangler pages deploy dist --project-name campfireweb
if errorlevel 1 goto :fail

echo.
echo [7/7] Validando a publicacao real, sem cache...
node scripts\verify-campfireweb-public.mjs
if errorlevel 1 goto :fail

echo.
echo ==============================================================
echo  CAMPFIREWEB 1.1.0 PUBLICADO E VALIDADO
echo ==============================================================
echo https://campfireweb.pages.dev/
echo.
pause
exit /b 0

:fail
set "CODE=%errorlevel%"
if "%CODE%"=="0" set "CODE=1"
echo.
echo ==============================================================
echo  PUBLICACAO INTERROMPIDA COM SEGURANCA
echo ==============================================================
echo Codigo de saida: %CODE%
echo Nenhuma publicacao sera chamada de final sem build e validacao publica.
echo.
pause
exit /b %CODE%
