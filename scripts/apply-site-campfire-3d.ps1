param(
  [string]$TargetRoot = 'C:\messenger'
)

$ErrorActionPreference = 'Stop'
$SourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TargetRoot = [IO.Path]::GetFullPath($TargetRoot)
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupBase = Join-Path $TargetRoot '_site_backups'
$BackupRoot = Join-Path $BackupBase "website-$Stamp"

function Test-SamePath([string]$A, [string]$B) {
  $aFull = [IO.Path]::GetFullPath($A).TrimEnd('\','/')
  $bFull = [IO.Path]::GetFullPath($B).TrimEnd('\','/')
  return [string]::Equals($aFull, $bFull, [StringComparison]::OrdinalIgnoreCase)
}

Write-Host '=============================================================='
Write-Host ' CAMPFIRE - APLICAR SITE 3D BLACK PIANO - FIX IN-PLACE'
Write-Host '=============================================================='
Write-Host "Origem:  $SourceRoot"
Write-Host "Destino: $TargetRoot"
Write-Host ''

foreach ($required in @('package.json', 'electron\main.mjs')) {
  if (-not (Test-Path (Join-Path $TargetRoot $required))) {
    throw "C:\messenger nao parece ser a arvore canonica do Campfire. Ausente: $required"
  }
}

$sourceWebsite = Join-Path $SourceRoot 'website'
$sourceWorkflow = Join-Path $SourceRoot '.github\workflows\pages.yml'
$targetWebsite = Join-Path $TargetRoot 'website'
$workflowDir = Join-Path $TargetRoot '.github\workflows'
$targetWorkflow = Join-Path $workflowDir 'pages.yml'
$inPlaceMode = Test-SamePath $SourceRoot $TargetRoot

if ($inPlaceMode) {
  Write-Host '[1/5] MODO IN-PLACE: o pacote ja esta dentro de C:\messenger.'
  Write-Host '      Nenhum arquivo sera copiado sobre ele mesmo.'

  if (-not (Test-Path (Join-Path $targetWebsite 'index.html'))) {
    $latestBackup = Get-ChildItem -LiteralPath $BackupBase -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName 'index.html') } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1

    if (-not $latestBackup) {
      throw 'website\index.html esta ausente e nenhum backup valido foi encontrado. Extraia novamente o ZIP do site em C:\messenger e execute este BAT outra vez.'
    }

    Write-Host "      Restaurando website do backup mais recente: $($latestBackup.FullName)"
    if (Test-Path $targetWebsite) { Remove-Item $targetWebsite -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $targetWebsite | Out-Null
    Copy-Item -Path (Join-Path $latestBackup.FullName '*') -Destination $targetWebsite -Recurse -Force
  }
} else {
  if (-not (Test-Path (Join-Path $sourceWebsite 'index.html'))) { throw 'Pacote do site incompleto: website\index.html ausente.' }
  if (-not (Test-Path $sourceWorkflow)) { throw 'Pacote do site incompleto: .github\workflows\pages.yml ausente.' }

  if (Test-Path $targetWebsite) {
    Write-Host "[1/5] Criando backup do site anterior em: $BackupRoot"
    New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
    Copy-Item -Path (Join-Path $targetWebsite '*') -Destination $BackupRoot -Recurse -Force
    Remove-Item $targetWebsite -Recurse -Force
  } else {
    Write-Host '[1/5] Nenhum site anterior encontrado; backup nao necessario.'
  }

  Write-Host '[2/5] Instalando website 3D...'
  New-Item -ItemType Directory -Force -Path $targetWebsite | Out-Null
  Copy-Item -Path (Join-Path $sourceWebsite '*') -Destination $targetWebsite -Recurse -Force
}

if ($inPlaceMode) {
  Write-Host '[2/5] Website 3D confirmado no destino.'
} elseif (-not (Test-Path (Join-Path $targetWebsite 'index.html'))) {
  throw 'Falha ao instalar website\index.html.'
}

Write-Host '[3/5] Instalando/confirmando workflow do GitHub Pages...'
New-Item -ItemType Directory -Force -Path $workflowDir | Out-Null
if (-not (Test-SamePath $sourceWorkflow $targetWorkflow)) {
  Copy-Item -LiteralPath $sourceWorkflow -Destination $targetWorkflow -Force
} elseif (-not (Test-Path $targetWorkflow)) {
  throw 'Workflow pages.yml ausente em modo in-place. Extraia novamente o pacote.'
} else {
  Write-Host '      Workflow ja esta no destino; copia sobre si mesmo ignorada.'
}

Write-Host '[4/5] Copiando/confirmando testes do site...'
$targetTests = Join-Path $TargetRoot 'tests'
New-Item -ItemType Directory -Force -Path $targetTests | Out-Null
foreach ($testName in @('website-structure.test.mjs', 'fire-interaction.test.mjs', 'pages-workflow.test.mjs')) {
  $sourceTest = Join-Path $SourceRoot "tests\$testName"
  $targetTest = Join-Path $targetTests $testName
  if (-not (Test-SamePath $sourceTest $targetTest)) {
    Copy-Item -LiteralPath $sourceTest -Destination $targetTest -Force
  } elseif (-not (Test-Path $targetTest)) {
    throw "Teste ausente em modo in-place: $testName"
  }
}

Write-Host '[5/5] Protegendo backups locais no .gitignore...'
$gitignore = Join-Path $TargetRoot '.gitignore'
if (-not (Test-Path $gitignore)) { New-Item -ItemType File -Path $gitignore | Out-Null }
$lines = @(Get-Content -LiteralPath $gitignore -ErrorAction SilentlyContinue)
if ($lines -notcontains '_site_backups/') { Add-Content -LiteralPath $gitignore -Value '_site_backups/' -Encoding UTF8 }

foreach ($requiredSiteFile in @('index.html', 'styles.css', 'app.js', 'scene\fire-scene.js')) {
  if (-not (Test-Path (Join-Path $targetWebsite $requiredSiteFile))) {
    throw "Site 3D incompleto depois da aplicacao. Ausente: website\$requiredSiteFile"
  }
}

Write-Host ''
Write-Host 'PASS: SITE CAMPFIRE 3D APLICADO'
Write-Host "Site:     $targetWebsite"
Write-Host "Workflow: $targetWorkflow"
Write-Host ''
Write-Host 'O proximo push da branch main podera acionar o GitHub Pages.'
