param(
  [string] $ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\')
$Version = '1.0.0'
$InstallerName = "Campfire-Black-Piano-Setup-$Version.exe"
$ReleaseDir = Join-Path $ProjectRoot 'release'
$Installer = Join-Path $ReleaseDir $InstallerName
$ChecksumFile = "$Installer.sha256.txt"

function Run-Step([string] $Label, [scriptblock] $Action) {
  Write-Host ''
  Write-Host $Label
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Label falhou com codigo $LASTEXITCODE."
  }
}

Write-Host '=============================================================='
Write-Host ' CAMPFIRE BLACK PIANO 1.0.0 - GERAR RELEASE WINDOWS'
Write-Host '=============================================================='
Write-Host ''
Write-Host "Projeto: $ProjectRoot"

$packagePath = Join-Path $ProjectRoot 'package.json'
if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
  throw 'package.json nao encontrado.'
}

$pkg = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($pkg.version -ne $Version) {
  throw "Versao inesperada no package.json: $($pkg.version). Esperado: $Version."
}
if ($pkg.build.appId -ne 'com.devsaex.campfire') {
  throw "appId inesperado: $($pkg.build.appId)."
}

$icon = Join-Path $ProjectRoot 'build\icon.ico'
if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) {
  throw 'build\icon.ico nao encontrado.'
}

Push-Location $ProjectRoot
try {
  Run-Step '[1/5] Instalando dependencias exatas...' {
    & npm.cmd ci
  }

  Run-Step '[2/5] Verificando codigo e build web...' {
    & npm.cmd run verify
  }

  if (Test-Path -LiteralPath $Installer) {
    Remove-Item -LiteralPath $Installer -Force
  }
  if (Test-Path -LiteralPath $ChecksumFile) {
    Remove-Item -LiteralPath $ChecksumFile -Force
  }

  $builder = Join-Path $ProjectRoot 'node_modules\.bin\electron-builder.cmd'
  if (-not (Test-Path -LiteralPath $builder -PathType Leaf)) {
    throw 'electron-builder local nao encontrado depois do npm ci.'
  }

  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  Run-Step '[3/5] Gerando instalador NSIS x64...' {
    & $builder --win nsis --x64
  }

  if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
    throw "Instalador nao encontrado: $Installer"
  }

  Write-Host ''
  Write-Host '[4/5] Gerando SHA-256...'
  $hash = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $InstallerName" | Set-Content -LiteralPath $ChecksumFile -Encoding ASCII

  $actual = (Get-Content -LiteralPath $ChecksumFile -Raw).Trim().Split(' ')[0]
  if ($actual -ne $hash) {
    throw 'Falha ao validar o arquivo SHA-256.'
  }

  Write-Host '[5/5] Conferindo artefatos...'
  $size = (Get-Item -LiteralPath $Installer).Length
  if ($size -lt 10MB) {
    throw "Instalador pequeno demais: $size bytes."
  }

  @(
    'CAMPFIRE RELEASE BUILD PASS',
    "Version=$Version",
    "Installer=$InstallerName",
    "Bytes=$size",
    "SHA256=$hash",
    "GeneratedAt=$((Get-Date).ToString('o'))"
  ) | Set-Content -LiteralPath (Join-Path $ReleaseDir 'RELEASE_READY.txt') -Encoding UTF8

  Write-Host ''
  Write-Host '=============================================================='
  Write-Host ' CAMPFIRE RELEASE BUILD PASS'
  Write-Host '=============================================================='
  Write-Host ''
  Write-Host "Instalador: $Installer"
  Write-Host "SHA-256:   $hash"
  Write-Host ''
  Write-Host 'Antes de publicar, instale e abra este EXE pelo menos uma vez.'
  Start-Process explorer.exe -ArgumentList "/select,`"$Installer`""
}
finally {
  Pop-Location
}
