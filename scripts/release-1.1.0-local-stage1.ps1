param(
  [string] $ProjectRoot = 'C:\messenger'
)

$ErrorActionPreference = 'Stop'
$Version = '1.1.0'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\')
$ReleaseDir = Join-Path $ProjectRoot 'release'
$BackupRoot = Join-Path $ProjectRoot '_campfire_backups'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogDir = Join-Path $ProjectRoot '_campfire_release_logs'
$LogFile = Join-Path $LogDir "Campfire-$Version-Stage1-$Timestamp.log"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Require-Command([string] $Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "$Name nao encontrado no PATH." }
  return $cmd
}

function Invoke-Native([string] $File, [string[]] $Arguments, [string] $Label) {
  Write-Host ''
  Write-Host $Label
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label falhou com codigo $LASTEXITCODE."
  }
}

function Get-WslPath([string] $WindowsPath) {
  $converted = & wsl.exe wslpath -a $WindowsPath
  if ($LASTEXITCODE -ne 0) { throw "wslpath falhou para: $WindowsPath" }
  return (($converted | Select-Object -Last 1).ToString().Trim())
}

$PublishDirectories = @(
  '.github','build','docs','electron','functions','public','release-baseline',
  'scripts','src','supabase','tests','website'
)
$PublishRootFiles = @(
  '.gitignore','.env.example','README.md','index.html','package.json','package-lock.json',
  'tsconfig.json','tsconfig.node.json','tsconfig.web.json','vite.config.ts',
  'CAMPFIREWEB_PUBLICAR.bat','CAMPFIREWEB_ARQUIVOS.txt','CAMPFIREWEB_LEIA-ME.txt',
  'ABRIR_CAMPFIRE_R6_6_6_15.bat','RELEASE_NOTES_1.0.0.md','RELEASE_NOTES_1.1.0.md',
  'RELEASE_CAMPFIRE_1_1_0_COMPLETA.bat'
)

function Get-PublishableFiles([string] $Root) {
  $items = New-Object System.Collections.Generic.List[System.IO.FileInfo]
  foreach ($directory in $PublishDirectories) {
    $full = Join-Path $Root $directory
    if (Test-Path -LiteralPath $full -PathType Container) {
      Get-ChildItem -LiteralPath $full -Recurse -File | ForEach-Object { [void]$items.Add($_) }
    }
  }
  foreach ($name in $PublishRootFiles) {
    $full = Join-Path $Root $name
    if (Test-Path -LiteralPath $full -PathType Leaf) {
      [void]$items.Add((Get-Item -LiteralPath $full))
    }
  }
  return $items | Sort-Object FullName -Unique
}

function Write-SourceManifest([string] $Root, [string] $Path) {
  $lines = foreach ($file in Get-PublishableFiles $Root) {
    $relative = $file.FullName.Substring($Root.Length).TrimStart('\').Replace('\','/')
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $relative"
  }
  $lines | Set-Content -LiteralPath $Path -Encoding ASCII
}

function Normalize-WindowsArtifact([string] $Pattern, [string] $ExactName) {
  $matches = @(Get-ChildItem -LiteralPath $ReleaseDir -File -Filter $Pattern)
  if ($matches.Count -ne 1) {
    throw "Esperado exatamente 1 artefato '$Pattern'; encontrados $($matches.Count)."
  }
  $destination = Join-Path $ReleaseDir $ExactName
  if ($matches[0].FullName -ne $destination) {
    Move-Item -LiteralPath $matches[0].FullName -Destination $destination -Force
  }
}

function Ensure-PagesProject([string] $Name) {
  & npx.cmd --yes wrangler@latest pages deployment list --project-name $Name --json *> $null
  if ($LASTEXITCODE -ne 0) {
    Invoke-Native 'npx.cmd' @('--yes','wrangler@latest','pages','project','create',$Name,'--production-branch','main') "Criando projeto Cloudflare Pages '$Name'..."
  }
}

function Verify-MarketingSite {
  $url = "https://campfire-br.pages.dev/?cfv=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
  $response = Invoke-WebRequest -UseBasicParsing -Uri $url -Headers @{ 'Cache-Control' = 'no-cache' }
  if ($response.StatusCode -ne 200) { throw "campfire-br HTTP $($response.StatusCode)." }
  if ($response.Content -notmatch 'Campfire Black Piano 1\.1\.0') { throw 'campfire-br nao contem a identidade 1.1.0 esperada.' }
  foreach ($asset in @(
    'Campfire-Setup-1.1.0-x64.exe',
    'Campfire-Portable-1.1.0-x64.exe',
    'Campfire-1.1.0-linux-x86_64.rpm',
    'Campfire-1.1.0-linux-x86_64.AppImage'
  )) {
    if ($response.Content -notmatch [regex]::Escape($asset)) { throw "campfire-br nao referencia $asset." }
  }
  Write-Host '[PASS] campfire-br.pages.dev publicado e sem cache antigo.'
}

Start-Transcript -LiteralPath $LogFile -Force | Out-Null
try {
  Write-Host '=================================================================='
  Write-Host ' CAMPFIRE 1.1.0 - STAGE 1: BUILD NATIVO + CLOUDFLARE'
  Write-Host ' GitHub fica BLOQUEADO nesta etapa.'
  Write-Host '=================================================================='
  Write-Host "Projeto: $ProjectRoot"
  Write-Host "Log:     $LogFile"

  Require-Command 'node.exe' | Out-Null
  Require-Command 'npm.cmd' | Out-Null
  Require-Command 'npx.cmd' | Out-Null
  Require-Command 'wsl.exe' | Out-Null

  $packagePath = Join-Path $ProjectRoot 'package.json'
  if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) { throw 'package.json nao encontrado.' }
  $pkg = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
  if ($pkg.version -ne $Version) { throw "Versao inesperada: $($pkg.version). Esperado: $Version." }
  if ($pkg.build.appId -ne 'com.devsaex.campfire') { throw "appId inesperado: $($pkg.build.appId)." }
  if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'build\icon.ico') -PathType Leaf)) {
    throw 'build\icon.ico ausente. Aplique o pacote de release 1.1.0 antes de continuar.'
  }

  Push-Location $ProjectRoot
  try {
    Write-Host ''
    Write-Host '[0/12] Preparando configuracao publica VITE_* para os builds...'
    $env:CAMPFIRE_DESKTOP_SOURCE = $ProjectRoot
    & node.exe 'scripts\prepare-campfireweb-env.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar VITE_* publicas.' }

    if (Test-Path -LiteralPath $ReleaseDir -PathType Container) {
      New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
      $releaseBackup = Join-Path $BackupRoot "release-before-$Version-$Timestamp"
      Move-Item -LiteralPath $ReleaseDir -Destination $releaseBackup
      Write-Host "[INFO] Release anterior preservada em $releaseBackup"
    }
    New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null

    Invoke-Native 'npm.cmd' @('ci','--no-audit','--no-fund') '[1/12] Instalando dependencias exatas no Windows...'
    Invoke-Native 'npm.cmd' @('run','verify') '[2/12] Verificando fonte, testes, TypeScript e Vite no Windows...'

    $builder = Join-Path $ProjectRoot 'node_modules\.bin\electron-builder.cmd'
    if (-not (Test-Path -LiteralPath $builder -PathType Leaf)) { throw 'electron-builder.cmd nao encontrado apos npm ci.' }
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    Invoke-Native $builder @('--win','nsis','--x64') '[3/12] Gerando Windows Setup NSIS x64...'
    Invoke-Native $builder @('--win','portable','--x64') '[4/12] Gerando Windows Portable x64...'

    Normalize-WindowsArtifact 'Campfire-Setup-*.exe' "Campfire-Setup-$Version-x64.exe"
    Normalize-WindowsArtifact 'Campfire-Portable-*.exe' "Campfire-Portable-$Version-x64.exe"
    Invoke-Native 'node.exe' @('scripts\verify-release-artifacts.mjs','--platform','windows','--write-checksums') '[5/12] Validando Windows e gerando SHA-256...'

    $wslDistros = & wsl.exe -l -q
    if ($LASTEXITCODE -ne 0 -or -not ($wslDistros | Where-Object { $_.Trim() })) {
      throw 'Nenhuma distribuicao WSL instalada. Linux RPM/AppImage precisa de um ambiente Linux nativo antes da publicacao.'
    }

    $LinuxStage = Join-Path $env:TEMP "Campfire-$Version-Linux-Source-$PID"
    if (Test-Path -LiteralPath $LinuxStage) { Remove-Item -LiteralPath $LinuxStage -Recurse -Force }
    New-Item -ItemType Directory -Path $LinuxStage -Force | Out-Null
    foreach ($directory in $PublishDirectories) {
      $sourceDir = Join-Path $ProjectRoot $directory
      if (Test-Path -LiteralPath $sourceDir -PathType Container) {
        Copy-Item -LiteralPath $sourceDir -Destination $LinuxStage -Recurse -Force
      }
    }
    foreach ($name in $PublishRootFiles) {
      $sourceFile = Join-Path $ProjectRoot $name
      if (Test-Path -LiteralPath $sourceFile -PathType Leaf) {
        Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $LinuxStage $name) -Force
      }
    }
    $publicEnv = Join-Path $ProjectRoot '.env.web.local'
    if (-not (Test-Path -LiteralPath $publicEnv -PathType Leaf)) { throw '.env.web.local publica nao foi gerada.' }
    Copy-Item -LiteralPath $publicEnv -Destination (Join-Path $LinuxStage '.campfire-public.env') -Force

    $LinuxStageWsl = Get-WslPath $LinuxStage
    $ReleaseDirWsl = Get-WslPath $ReleaseDir
    $LinuxHelperWsl = Get-WslPath (Join-Path $ProjectRoot 'scripts\build-linux-1.1.0-wsl.sh')
    Invoke-Native 'wsl.exe' @('bash',$LinuxHelperWsl,$LinuxStageWsl,$ReleaseDirWsl) '[6/12] Gerando Linux RPM + AppImage x86_64 no WSL...'
    Remove-Item -LiteralPath $LinuxStage -Recurse -Force -ErrorAction SilentlyContinue

    Invoke-Native 'node.exe' @('scripts\verify-release-artifacts.mjs','--platform','all') '[7/12] Validando os 4 artefatos e 4 checksums...'

    Invoke-Native 'npm.cmd' @('run','build:campfireweb') '[8/12] Gerando CampfireWeb de producao...'
    Invoke-Native 'node.exe' @('scripts\verify-campfireweb-build.mjs') '[9/12] Validando bundle CampfireWeb...'

    Write-Host ''
    Write-Host '[10/12] Autenticando e publicando campfire-br.pages.dev...'
    & npx.cmd --yes wrangler@latest whoami *> $null
    if ($LASTEXITCODE -ne 0) {
      Invoke-Native 'npx.cmd' @('--yes','wrangler@latest','login') 'Login Cloudflare Wrangler...'
    }
    Invoke-Native 'npx.cmd' @('--yes','wrangler@latest','whoami') 'Confirmando conta Cloudflare...'
    Ensure-PagesProject 'campfire-br'
    Invoke-Native 'npx.cmd' @('--yes','wrangler@latest','pages','deploy','website','--project-name','campfire-br','--branch','main','--commit-message',"Campfire $Version website") 'Deploy campfire-br...'
    Verify-MarketingSite

    Write-Host ''
    Write-Host '[11/12] Publicando campfireweb.pages.dev...'
    Ensure-PagesProject 'campfireweb'
    Invoke-Native 'npx.cmd' @('--yes','wrangler@latest','pages','deploy','dist','--project-name','campfireweb','--branch','main','--commit-message',"CampfireWeb $Version") 'Deploy campfireweb...'
    Invoke-Native 'node.exe' @('scripts\verify-campfireweb-public.mjs') 'Validando CampfireWeb publico...'

    Write-Host ''
    Write-Host '[12/12] Gravando evidencia de Stage 1...'
    $sourceManifest = Join-Path $ReleaseDir "STAGE1_SOURCE_MANIFEST_$Version.sha256.txt"
    Write-SourceManifest $ProjectRoot $sourceManifest

    $artifactNames = @(
      "Campfire-Setup-$Version-x64.exe",
      "Campfire-Portable-$Version-x64.exe",
      "Campfire-$Version-linux-x86_64.rpm",
      "Campfire-$Version-linux-x86_64.AppImage"
    )
    $artifacts = foreach ($name in $artifactNames) {
      $path = Join-Path $ReleaseDir $name
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Artefato final ausente: $name" }
      [ordered]@{
        name = $name
        bytes = (Get-Item -LiteralPath $path).Length
        sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    }

    $marker = [ordered]@{
      status = 'STAGE1_COMPLETE'
      version = $Version
      completedAt = (Get-Date).ToString('o')
      sourceManifest = (Split-Path -Leaf $sourceManifest)
      cloudflare = [ordered]@{
        website = 'https://campfire-br.pages.dev/'
        webapp = 'https://campfireweb.pages.dev/'
      }
      artifacts = $artifacts
    }
    $markerPath = Join-Path $ReleaseDir "STAGE1_COMPLETE_$Version.json"
    $marker | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $markerPath -Encoding UTF8

    Write-Host ''
    Write-Host '=================================================================='
    Write-Host ' STAGE 1 CONCLUIDO - BUILDS + CLOUDFLARE VALIDOS'
    Write-Host ' GitHub ainda NAO foi alterado.'
    Write-Host '=================================================================='
    Write-Host "Marker: $markerPath"
    Write-Host "Log:    $LogFile"
  }
  finally {
    Pop-Location
  }
}
finally {
  Stop-Transcript | Out-Null
}
