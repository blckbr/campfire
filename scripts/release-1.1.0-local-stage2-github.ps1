param(
  [string] $ProjectRoot = 'C:\messenger',
  [string] $Repository = 'blckbr/campfire'
)

$ErrorActionPreference = 'Stop'
$Version = '1.1.0'
$Tag = 'v1.1.0'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd('\')
$ReleaseDir = Join-Path $ProjectRoot 'release'
$MarkerPath = Join-Path $ReleaseDir "STAGE1_COMPLETE_$Version.json"
$ExpectedManifest = Join-Path $ReleaseDir "STAGE1_SOURCE_MANIFEST_$Version.sha256.txt"
$LogDir = Join-Path $ProjectRoot '_campfire_release_logs'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile = Join-Path $LogDir "Campfire-$Version-Stage2-GitHub-$Timestamp.log"
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
  if ($LASTEXITCODE -ne 0) { throw "$Label falhou com codigo $LASTEXITCODE." }
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

function Copy-PublishableSource([string] $From, [string] $To) {
  foreach ($directory in $PublishDirectories) {
    $sourceDir = Join-Path $From $directory
    if (Test-Path -LiteralPath $sourceDir -PathType Container) {
      Copy-Item -LiteralPath $sourceDir -Destination $To -Recurse -Force
    }
  }
  foreach ($name in $PublishRootFiles) {
    $sourceFile = Join-Path $From $name
    if (Test-Path -LiteralPath $sourceFile -PathType Leaf) {
      $destination = Join-Path $To $name
      $parent = Split-Path -Parent $destination
      if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
      Copy-Item -LiteralPath $sourceFile -Destination $destination -Force
    }
  }
}

function Verify-Url([string] $Url, [string] $Needle) {
  $separator = if ($Url.Contains('?')) { '&' } else { '?' }
  $response = Invoke-WebRequest -UseBasicParsing -Uri ($Url + $separator + 'verify=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Headers @{ 'Cache-Control' = 'no-cache' }
  if ($response.StatusCode -ne 200) { throw "$Url HTTP $($response.StatusCode)." }
  if ($Needle -and $response.Content -notmatch [regex]::Escape($Needle)) { throw "$Url nao contem '$Needle'." }
}

Start-Transcript -LiteralPath $LogFile -Force | Out-Null
try {
  Write-Host '=================================================================='
  Write-Host ' CAMPFIRE 1.1.0 - STAGE 2: GITHUB'
  Write-Host ' Esta etapa so continua se Stage 1 estiver comprovadamente valido.'
  Write-Host '=================================================================='

  if (-not (Test-Path -LiteralPath $MarkerPath -PathType Leaf)) { throw "Marker de Stage 1 ausente: $MarkerPath" }
  if (-not (Test-Path -LiteralPath $ExpectedManifest -PathType Leaf)) { throw "Manifest de fonte ausente: $ExpectedManifest" }
  $marker = Get-Content -LiteralPath $MarkerPath -Raw | ConvertFrom-Json
  if ($marker.status -ne 'STAGE1_COMPLETE' -or $marker.version -ne $Version) { throw 'Marker Stage 1 invalido.' }

  Verify-Url 'https://campfire-br.pages.dev/' 'Campfire Black Piano 1.1.0'
  Verify-Url 'https://campfireweb.pages.dev/' '<div id="root"></div>'
  Write-Host '[PASS] Os dois sites Cloudflare estao publicados antes do GitHub.'

  $CurrentManifest = Join-Path $env:TEMP "Campfire-$Version-source-current-$PID.sha256.txt"
  Write-SourceManifest $ProjectRoot $CurrentManifest
  $expectedText = (Get-Content -LiteralPath $ExpectedManifest -Raw).Trim()
  $currentText = (Get-Content -LiteralPath $CurrentManifest -Raw).Trim()
  Remove-Item -LiteralPath $CurrentManifest -Force -ErrorAction SilentlyContinue
  if ($expectedText -ne $currentText) {
    throw 'A fonte mudou depois dos builds/Cloudflare. Stage 1 precisa ser refeito para manter binarios e GitHub sincronizados.'
  }
  Write-Host '[PASS] Fonte atual e exatamente a mesma usada no Stage 1.'

  $ArtifactNames = @(
    "Campfire-Setup-$Version-x64.exe",
    "Campfire-Portable-$Version-x64.exe",
    "Campfire-$Version-linux-x86_64.rpm",
    "Campfire-$Version-linux-x86_64.AppImage"
  )
  foreach ($name in $ArtifactNames) {
    $path = Join-Path $ReleaseDir $name
    $sidecar = "$path.sha256.txt"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Artefato ausente: $name" }
    if (-not (Test-Path -LiteralPath $sidecar -PathType Leaf)) { throw "Checksum ausente: $name.sha256.txt" }
  }

  Require-Command 'git.exe' | Out-Null
  Require-Command 'gh.exe' | Out-Null
  Require-Command 'npm.cmd' | Out-Null
  Require-Command 'node.exe' | Out-Null

  Push-Location $ProjectRoot
  try {
    Invoke-Native 'node.exe' @('scripts\verify-release-artifacts.mjs','--platform','all') '[1/8] Revalidando os 4 artefatos e checksums...'
    Invoke-Native 'npm.cmd' @('run','verify') '[2/8] Revalidando a fonte exata antes do GitHub...'
  }
  finally { Pop-Location }

  Invoke-Native 'gh.exe' @('auth','status') '[3/8] Conferindo autenticacao GitHub...'
  Invoke-Native 'gh.exe' @('auth','setup-git') 'Configurando Git para usar a autenticacao do GitHub CLI...'

  & gh.exe release view $Tag -R $Repository *> $null
  if ($LASTEXITCODE -eq 0) {
    throw "A release $Tag ja existe. Nao vou sobrescrever uma release estavel automaticamente."
  }
  & git.exe ls-remote --exit-code --tags "https://github.com/$Repository.git" "refs/tags/$Tag" *> $null
  if ($LASTEXITCODE -eq 0) {
    throw "A tag $Tag ja existe no remoto. Nao vou move-la automaticamente."
  }

  $StageRepo = Join-Path $env:TEMP "Campfire-$Version-GitHub-$PID"
  if (Test-Path -LiteralPath $StageRepo) { Remove-Item -LiteralPath $StageRepo -Recurse -Force }
  Invoke-Native 'gh.exe' @('repo','clone',$Repository,$StageRepo) '[4/8] Clonando o repositorio publico atual em staging...'
  Invoke-Native 'git.exe' @('-C',$StageRepo,'checkout','main') 'Conferindo branch main...'
  Invoke-Native 'git.exe' @('-C',$StageRepo,'pull','--ff-only','origin','main') 'Atualizando main sem reescrever historico...'

  $PreserveDir = Join-Path $env:TEMP "Campfire-$Version-Preserve-$PID"
  New-Item -ItemType Directory -Path $PreserveDir -Force | Out-Null
  foreach ($pattern in @('LICENSE*','CODE_OF_CONDUCT*','SECURITY*')) {
    Get-ChildItem -LiteralPath $StageRepo -File -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $PreserveDir -Force
    }
  }

  Get-ChildItem -LiteralPath $StageRepo -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
  Copy-PublishableSource $ProjectRoot $StageRepo
  Get-ChildItem -LiteralPath $PreserveDir -File -ErrorAction SilentlyContinue | ForEach-Object {
    $dest = Join-Path $StageRepo $_.Name
    if (-not (Test-Path -LiteralPath $dest -PathType Leaf)) { Copy-Item -LiteralPath $_.FullName -Destination $dest -Force }
  }
  Remove-Item -LiteralPath $PreserveDir -Recurse -Force -ErrorAction SilentlyContinue

  Invoke-Native 'git.exe' @('-C',$StageRepo,'config','user.name','Deivison Santos') 'Configurando autor do commit...'
  $login = (& gh.exe api user --jq .login).Trim()
  $userId = (& gh.exe api user --jq .id).Trim()
  if (-not $login -or -not $userId) { throw 'Nao foi possivel resolver usuario GitHub autenticado.' }
  Invoke-Native 'git.exe' @('-C',$StageRepo,'config','user.email',"$userId+$login@users.noreply.github.com") 'Configurando email noreply...'

  Invoke-Native 'git.exe' @('-C',$StageRepo,'add','-A') '[5/8] Preparando fonte 1.1.0 para commit...'
  $staged = & git.exe -C $StageRepo diff --cached --name-only
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel listar arquivos staged.' }
  $forbidden = $staged | Where-Object { $_ -match '(^|/)(\.env($|\.)|node_modules/|dist/|release/|_campfire_backups/|_campfire_release_logs/)' }
  if ($forbidden) {
    & git.exe -C $StageRepo reset *> $null
    throw "Arquivos proibidos tentaram entrar no GitHub:`n$($forbidden -join "`n")"
  }
  if (-not $staged) { throw 'Nenhuma alteracao encontrada entre 1.0.0 e a fonte 1.1.0.' }

  Invoke-Native 'git.exe' @('-C',$StageRepo,'commit','-m',"release: Campfire $Version") '[6/8] Criando commit Campfire 1.1.0...'
  Invoke-Native 'git.exe' @('-C',$StageRepo,'push','origin','main') 'Enviando main sem force-push...'
  Invoke-Native 'git.exe' @('-C',$StageRepo,'tag','-a',$Tag,'-m',"Campfire $Version") 'Criando tag v1.1.0...'
  Invoke-Native 'git.exe' @('-C',$StageRepo,'push','origin',$Tag) 'Enviando tag v1.1.0...'

  $assets = New-Object System.Collections.Generic.List[string]
  foreach ($name in $ArtifactNames) {
    [void]$assets.Add((Join-Path $ReleaseDir $name))
    [void]$assets.Add((Join-Path $ReleaseDir "$name.sha256.txt"))
  }
  $notes = Join-Path $ProjectRoot 'RELEASE_NOTES_1.1.0.md'
  if (-not (Test-Path -LiteralPath $notes -PathType Leaf)) { throw 'RELEASE_NOTES_1.1.0.md ausente.' }

  $releaseArgs = @('release','create',$Tag) + $assets.ToArray() + @('-R',$Repository,'--verify-tag','--title',"Campfire $Version",'--notes-file',$notes)
  Invoke-Native 'gh.exe' $releaseArgs '[7/8] Criando GitHub Release v1.1.0 e enviando os 8 assets...'

  Invoke-Native 'gh.exe' @('release','view',$Tag,'-R',$Repository,'--json','tagName,name,isDraft,isPrerelease,url,assets') '[8/8] Validando a release publicada...'

  foreach ($name in $ArtifactNames) {
    $download = "https://github.com/$Repository/releases/download/$Tag/$name"
    $response = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $download -MaximumRedirection 5
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) { throw "Download publico falhou: $download HTTP $($response.StatusCode)" }
  }

  Write-Host ''
  Write-Host '=================================================================='
  Write-Host ' CAMPFIRE 1.1.0 PUBLICADO NA ORDEM APROVADA'
  Write-Host ' 1. Windows + Linux'
  Write-Host ' 2. campfire-br + campfireweb'
  Write-Host ' 3. GitHub main + tag + Release v1.1.0'
  Write-Host '=================================================================='
  Write-Host "Repositorio: https://github.com/$Repository"
  Write-Host "Release:     https://github.com/$Repository/releases/tag/$Tag"
  Write-Host "Log:         $LogFile"

  Remove-Item -LiteralPath $StageRepo -Recurse -Force -ErrorAction SilentlyContinue
}
finally {
  Stop-Transcript | Out-Null
}
