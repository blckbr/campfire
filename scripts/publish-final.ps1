param(
  [string] $ProjectRoot = (Get-Location).Path,
  [string] $RepoName = 'campfire',
  [string] $CloudflareProject = 'campfire-br'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\')
$Version = '1.0.0'
$Tag = 'v1.0.0'
$InstallerName = 'Campfire-Black-Piano-Setup-1.0.0.exe'
$Installer = Join-Path $ProjectRoot "release\$InstallerName"
$Checksum = "$Installer.sha256.txt"
$Notes = Join-Path $ProjectRoot 'RELEASE_NOTES_1.0.0.md'
$Website = Join-Path $ProjectRoot 'website'

function Require-Command([string] $Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "$Name nao encontrado no PATH." }
}

function Run-Step([string] $Label, [scriptblock] $Action) {
  Write-Host ''
  Write-Host $Label
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Label falhou com codigo $LASTEXITCODE." }
}

Write-Host '=============================================================='
Write-Host ' CAMPFIRE 1.0.0 - GITHUB + CLOUDFLARE PAGES'
Write-Host '=============================================================='

Require-Command 'git.exe'
Require-Command 'gh.exe'
Require-Command 'npm.cmd'
Require-Command 'npx.cmd'

if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
  throw "Instalador ausente. Rode BUILD_CAMPFIRE_RELEASE.bat primeiro: $Installer"
}
if (-not (Test-Path -LiteralPath $Checksum -PathType Leaf)) {
  throw 'Arquivo SHA-256 ausente.'
}
if (-not (Test-Path -LiteralPath $Notes -PathType Leaf)) {
  throw 'RELEASE_NOTES_1.0.0.md ausente.'
}

$expectedScreens = @(
  'site-01-home.png','site-02-menu-arquivo.png','site-03-menu-contatos.png',
  'site-04-amigos.png','site-05-criar-campfire.png','site-06-configuracoes.png',
  'site-07-idioma-escala.png','site-08-animes.png','site-09-tela-compartilhamento.png',
  'site-10-voz-video.png','site-11-fechamento.png','site-12-sobre.png'
)
$screenDir = Join-Path $ProjectRoot 'website\assets\screenshots'
foreach ($screen in $expectedScreens) {
  if (-not (Test-Path -LiteralPath (Join-Path $screenDir $screen) -PathType Leaf)) {
    throw "Screenshot final ausente em website\assets\screenshots: $screen"
  }
}

Push-Location $ProjectRoot
try {
  Run-Step '[1/9] Conferindo autenticacao do GitHub...' {
    & gh.exe auth status
  }

  $owner = (& gh.exe api user --jq .login).Trim()
  $userId = (& gh.exe api user --jq .id).Trim()
  if (-not $owner) { throw 'Nao foi possivel descobrir o usuario autenticado no GitHub.' }
  $repo = "$owner/$RepoName"
  $repoUrl = "https://github.com/$repo"
  $releaseUrl = "$repoUrl/releases/tag/$Tag"
  $downloadUrl = "$repoUrl/releases/download/$Tag/$InstallerName"

  & gh.exe repo view $repo *> $null
  $repoExists = ($LASTEXITCODE -eq 0)

  @"
window.CAMPFIRE_SITE_CONFIG = Object.freeze({
  version: '$Version',
  githubUrl: '$repoUrl',
  releaseUrl: '$releaseUrl',
  downloadUrl: '$downloadUrl'
});
"@ | Set-Content -LiteralPath (Join-Path $Website 'config.js') -Encoding UTF8

  Run-Step '[2/9] Verificando Campfire antes da publicacao...' {
    & npm.cmd run verify
  }

  $gitDir = Join-Path $ProjectRoot '.git'
  if (-not $repoExists -and (Test-Path -LiteralPath $gitDir -PathType Container)) {
    $gitBackupRoot = Join-Path $ProjectRoot ('_campfire_backups\git-before-publication-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $gitBackupRoot -Force | Out-Null
    Move-Item -LiteralPath $gitDir -Destination (Join-Path $gitBackupRoot '.git')
    Write-Host ''
    Write-Host "[3/9] Historico Git anterior preservado em: $gitBackupRoot"
  }

  if (-not (Test-Path -LiteralPath $gitDir -PathType Container)) {
    Run-Step '[3/9] Inicializando repositorio Git publico limpo...' {
      & git.exe init
    }
  } else {
    Write-Host ''
    Write-Host '[3/9] Repositorio Git publico existente detectado.'
  }

  & git.exe branch -M main
  & git.exe config user.name 'Deivison Santos'
  & git.exe config user.email "$userId+$owner@users.noreply.github.com"

  # Preserve legacy files locally while removing them from the public Git index.
  & git.exe rm -r --cached --ignore-unmatch node_modules dist release src-tauri backup-tauri _campfire_backups _campfire_voice_pro_update _campfire_select_hotfix _campfire_voice_dock_select_fix patch MEDIA_PRO_PATCH _exports *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao limpar arquivos locais/legados do indice Git.' }

  $forbiddenTracked = & git.exe ls-files | Select-String -Pattern '(^|/)(\.env($|\.)|node_modules/|dist/|release/|src-tauri/|_campfire_backups/|backup-tauri/|_campfire_voice_pro_update/|_campfire_select_hotfix/|_campfire_voice_dock_select_fix/)'
  if ($forbiddenTracked) {
    throw "Arquivos proibidos ja estao rastreados pelo Git:`n$($forbiddenTracked -join "`n")"
  }

  & git.exe add -A
  $stagedForbidden = & git.exe diff --cached --name-only | Select-String -Pattern '(^|/)(\.env($|\.)|node_modules/|dist/|release/|src-tauri/|_campfire_backups/|backup-tauri/|_campfire_voice_pro_update/|_campfire_select_hotfix/|_campfire_voice_dock_select_fix/)'
  if ($stagedForbidden) {
    & git.exe reset
    throw "Arquivos proibidos tentaram entrar no commit:`n$($stagedForbidden -join "`n")"
  }

  $hasHead = $true
  & git.exe rev-parse --verify HEAD *> $null
  if ($LASTEXITCODE -ne 0) { $hasHead = $false }

  $changes = (& git.exe status --porcelain)
  if ($changes) {
    & git.exe commit -m 'release: Campfire Black Piano 1.0.0'
    if ($LASTEXITCODE -ne 0) { throw 'git commit falhou.' }
  } elseif (-not $hasHead) {
    throw 'Repositorio sem commit e sem alteracoes para criar o primeiro commit.'
  }

  Write-Host ''
  Write-Host '[4/9] Preparando repositorio publico no GitHub...'

  $origin = (& git.exe remote get-url origin 2>$null)
  if (-not $origin) {
    if ($repoExists) {
      & git.exe remote add origin "$repoUrl.git"
      if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel adicionar origin.' }
    } else {
      & gh.exe repo create $repo --public --source . --remote origin --description 'Campfire Black Piano — chat, voz, video, compartilhamento de tela e Watch Together.'
      if ($LASTEXITCODE -ne 0) { throw 'gh repo create falhou.' }
    }
  } else {
    & git.exe remote set-url origin "$repoUrl.git"
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel apontar origin para o repositorio publico do Campfire.' }
  }

  Run-Step '[5/9] Enviando codigo-fonte para o GitHub...' {
    & git.exe push -u origin main
  }

  $head = (& git.exe rev-parse HEAD).Trim()
  & git.exe rev-parse $Tag *> $null
  if ($LASTEXITCODE -ne 0) {
    & git.exe tag -a $Tag -m 'Campfire Black Piano 1.0.0'
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel criar a tag v1.0.0.' }
  } else {
    $tagCommit = (& git.exe rev-list -n 1 $Tag).Trim()
    if ($tagCommit -ne $head) {
      throw "A tag $Tag ja existe e aponta para outro commit. Nao vou mover uma tag estavel automaticamente."
    }
  }
  Run-Step '[6/9] Enviando tag v1.0.0...' {
    & git.exe push origin $Tag
  }

  Write-Host ''
  Write-Host '[7/9] Criando/verificando GitHub Release...'
  & gh.exe release view $Tag -R $repo *> $null
  if ($LASTEXITCODE -ne 0) {
    & gh.exe release create $Tag $Installer $Checksum -R $repo --verify-tag --title 'Campfire Black Piano 1.0.0' --notes-file $Notes
    if ($LASTEXITCODE -ne 0) { throw 'gh release create falhou.' }
  } else {
    Write-Host '       Release v1.0.0 ja existe; mantendo-a.'
  }

  Write-Host ''
  Write-Host '[8/9] Autenticando no Cloudflare Wrangler...'
  & npx.cmd --yes wrangler@latest whoami *> $null
  if ($LASTEXITCODE -ne 0) {
    & npx.cmd --yes wrangler@latest login
    if ($LASTEXITCODE -ne 0) { throw 'Login do Cloudflare falhou.' }
  }

  & npx.cmd --yes wrangler@latest pages deployment list --project-name $CloudflareProject --json *> $null
  if ($LASTEXITCODE -ne 0) {
    & npx.cmd --yes wrangler@latest pages project create $CloudflareProject --production-branch main
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel criar o projeto Cloudflare Pages.' }
  }

  Run-Step '[9/9] Publicando website na Cloudflare Pages...' {
    & npx.cmd --yes wrangler@latest pages deploy website --project-name $CloudflareProject --branch main --commit-hash $head --commit-message 'Campfire Black Piano 1.0.0'
  }

  $siteUrl = "https://$CloudflareProject.pages.dev/"
  Write-Host ''
  Write-Host '=============================================================='
  Write-Host ' CAMPFIRE 1.0.0 PUBLICADO'
  Write-Host '=============================================================='
  Write-Host ''
  Write-Host "GitHub:     $repoUrl"
  Write-Host "Release:    $releaseUrl"
  Write-Host "Download:   $downloadUrl"
  Write-Host "Cloudflare: $siteUrl"
  Write-Host ''
  Start-Process $siteUrl
  Start-Process $releaseUrl
}
finally {
  Pop-Location
}
