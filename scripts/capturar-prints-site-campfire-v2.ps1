$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = [IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
$OutputDir = Join-Path $Root "website\assets\screenshots"
$ReportPath = Join-Path $Root "CAPTURAS_SITE_CAMPFIRE_V2.txt"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class CampfireShotWin32
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(
        IntPtr hwnd,
        int dwAttribute,
        out RECT pvAttribute,
        int cbAttribute
    );
}
"@

[void][CampfireShotWin32]::SetProcessDPIAware()

$Steps = @(
    [pscustomobject]@{
        File = "site-01-home.png"
        Title = "Tela principal"
        Help = "Deixe o Campfire na tela principal, sem nenhum modal aberto."
    },
    [pscustomobject]@{
        File = "site-02-menu-arquivo.png"
        Title = "Menu Arquivo"
        Help = "Clique em Arquivo e deixe o menu suspenso aberto."
    },
    [pscustomobject]@{
        File = "site-03-menu-contatos.png"
        Title = "Menu Contatos"
        Help = "Clique em Contatos e deixe o menu suspenso aberto."
    },
    [pscustomobject]@{
        File = "site-04-amigos.png"
        Title = "Amigos"
        Help = "Abra a janela de Amigos/Contatos. Deixe a aba mais interessante visivel."
    },
    [pscustomobject]@{
        File = "site-05-criar-campfire.png"
        Title = "Criar Campfire"
        Help = "Abra 'Criar Campfire' e deixe o formulario visivel, sem criar a sala."
    },
    [pscustomobject]@{
        File = "site-06-configuracoes.png"
        Title = "Configuracoes"
        Help = "Abra Configuracoes e deixe uma tela geral representativa visivel."
    },
    [pscustomobject]@{
        File = "site-07-idioma-escala.png"
        Title = "Idioma e escala"
        Help = "Em Configuracoes, abra a area onde aparecem Idioma e Escala da interface."
    },
    [pscustomobject]@{
        File = "site-08-animes.png"
        Title = "Animes"
        Help = "Feche modais e abra a aba Animes de uma Campfire."
    },
    [pscustomobject]@{
        File = "site-09-tela-compartilhamento.png"
        Title = "Compartilhamento de tela"
        Help = "Abra a aba Tela/Compartilhamento. Nao e necessario iniciar transmissao."
    },
    [pscustomobject]@{
        File = "site-10-voz-video.png"
        Title = "Voz e video"
        Help = "Abra Configuracoes > Voz e video ou a area de voz que voce queira divulgar."
    },
    [pscustomobject]@{
        File = "site-11-fechamento.png"
        Title = "Fechamento divertido"
        Help = "Clique no X do Campfire e deixe aberto o dialogo 'Vai abandonar a fogueira?'. Nao escolha nenhuma opcao."
    },
    [pscustomobject]@{
        File = "site-12-sobre.png"
        Title = "Sobre o Campfire"
        Help = "Cancele o fechamento e abra Ajuda > Sobre o Campfire (ou Plus!/Sobre)."
    }
)

function Write-Report([string]$Text) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Text
    Add-Content -LiteralPath $ReportPath -Value $line -Encoding UTF8
}

function Get-WindowTitle([IntPtr]$Handle) {
    $buffer = New-Object System.Text.StringBuilder 1024
    [void][CampfireShotWin32]::GetWindowText($Handle, $buffer, $buffer.Capacity)
    return $buffer.ToString()
}

function Get-CampfireBounds([IntPtr]$Handle) {
    $rect = New-Object CampfireShotWin32+RECT

    # DWMWA_EXTENDED_FRAME_BOUNDS = 9.
    # This excludes the invisible resize shadow on modern Windows.
    $hr = [CampfireShotWin32]::DwmGetWindowAttribute(
        $Handle,
        9,
        [ref]$rect,
        [Runtime.InteropServices.Marshal]::SizeOf([type][CampfireShotWin32+RECT])
    )

    if ($hr -ne 0) {
        if (-not [CampfireShotWin32]::GetWindowRect($Handle, [ref]$rect)) {
            throw "Nao foi possivel obter os limites da janela."
        }
    }

    return $rect
}

function Show-Step([int]$Index) {
    $step = $Steps[$Index]
    $number = $Index + 1
    $total = $Steps.Count

    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor DarkGray
    Write-Host (" [{0}/{1}] {2}" -f $number, $total, $step.Title) -ForegroundColor Cyan
    Write-Host "==============================================================" -ForegroundColor DarkGray
    Write-Host $step.Help
    Write-Host ""
    Write-Host ("Arquivo: {0}" -f $step.File) -ForegroundColor Gray
    Write-Host "Prepare o Campfire e pressione F8." -ForegroundColor Green
    Write-Host "F9 pula esta captura. F12 encerra."
}

function Save-StepScreenshot([int]$Index) {
    $step = $Steps[$Index]
    $hwnd = [CampfireShotWin32]::GetForegroundWindow()

    if ($hwnd -eq [IntPtr]::Zero) {
        [Console]::Beep(420, 140)
        Write-Host "[IGNORADO] Nenhuma janela ativa." -ForegroundColor Yellow
        return $false
    }

    $title = Get-WindowTitle $hwnd
    if ($title -notmatch "(?i)Campfire") {
        [Console]::Beep(420, 140)
        Write-Host ""
        Write-Host "[IGNORADO] A janela ativa nao e o Campfire." -ForegroundColor Yellow
        Write-Host ("Janela ativa: {0}" -f $title)
        Write-Host "Clique no Campfire e pressione F8 novamente."
        return $false
    }

    $rect = Get-CampfireBounds $hwnd
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top

    if ($width -lt 300 -or $height -lt 200) {
        [Console]::Beep(420, 140)
        Write-Host "[IGNORADO] A janela parece minimizada ou pequena demais." -ForegroundColor Yellow
        return $false
    }

    $path = Join-Path $OutputDir $step.File
    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    try {
        $graphics.CopyFromScreen(
            $rect.Left,
            $rect.Top,
            0,
            0,
            (New-Object System.Drawing.Size($width, $height)),
            [System.Drawing.CopyPixelOperation]::SourceCopy
        )
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }

    Write-Host ""
    Write-Host ("[CAPTURADO] {0}" -f $step.File) -ForegroundColor Green
    Write-Host ("             {0} x {1}" -f $width, $height)
    Write-Report ("CAPTURADO | {0} | {1}x{2}" -f $step.File, $width, $height)
    [Console]::Beep(950, 80)
    [Console]::Beep(1150, 80)
    return $true
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
Set-Content -LiteralPath $ReportPath -Value "CAMPFIRE - CAPTURAS GUIADAS V2" -Encoding UTF8

# Preserve any previous site screenshots instead of overwriting silently.
$old = @(Get-ChildItem -LiteralPath $OutputDir -File -Filter "site-*.png" -ErrorAction SilentlyContinue)
if ($old.Count -gt 0) {
    $archive = Join-Path $OutputDir ("previous-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    New-Item -ItemType Directory -Path $archive -Force | Out-Null
    foreach ($file in $old) {
        Move-Item -LiteralPath $file.FullName -Destination (Join-Path $archive $file.Name) -Force
    }
    Write-Host ("Capturas anteriores arquivadas em: {0}" -f $archive) -ForegroundColor DarkGray
    Write-Report ("Capturas anteriores movidas para $archive")
}

Write-Host ""
Write-Host "=============================================================="
Write-Host " CAMPFIRE - CAPTURA GUIADA V2"
Write-Host "=============================================================="
Write-Host ""
Write-Host "Esta versao nao usa mapeamento de interface."
Write-Host "Voce controla o Campfire; o script somente captura e nomeia."
Write-Host ""
Write-Host "F8  = capturar"
Write-Host "F9  = pular"
Write-Host "F12 = encerrar"
Write-Host ""

$VK_F8 = 0x77
$VK_F9 = 0x78
$VK_F12 = 0x7B

$index = 0
$prevF8 = $false
$prevF9 = $false
$prevF12 = $false

Show-Step $index

while ($index -lt $Steps.Count) {
    $f8 = (([CampfireShotWin32]::GetAsyncKeyState($VK_F8) -band 0x8000) -ne 0)
    $f9 = (([CampfireShotWin32]::GetAsyncKeyState($VK_F9) -band 0x8000) -ne 0)
    $f12 = (([CampfireShotWin32]::GetAsyncKeyState($VK_F12) -band 0x8000) -ne 0)

    if ($f12 -and -not $prevF12) {
        Write-Report "ENCERRADO pelo usuario com F12."
        Write-Host ""
        Write-Host "[ENCERRADO] Sessao finalizada por F12." -ForegroundColor Yellow
        break
    }

    if ($f9 -and -not $prevF9) {
        $step = $Steps[$index]
        Write-Host ""
        Write-Host ("[PULADO] {0}" -f $step.File) -ForegroundColor Yellow
        Write-Report ("PULADO | " + $step.File)
        [Console]::Beep(600, 90)
        $index++
        if ($index -lt $Steps.Count) {
            Start-Sleep -Milliseconds 250
            Show-Step $index
        }
    }
    elseif ($f8 -and -not $prevF8) {
        if (Save-StepScreenshot $index) {
            $index++
            if ($index -lt $Steps.Count) {
                Start-Sleep -Milliseconds 250
                Show-Step $index
            }
        }
    }

    $prevF8 = $f8
    $prevF9 = $f9
    $prevF12 = $f12
    Start-Sleep -Milliseconds 45
}

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Green
Write-Host " CAPTURA GUIADA FINALIZADA" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Write-Host ""
Write-Host ("Imagens: {0}" -f $OutputDir)
Write-Host ("Relatorio: {0}" -f $ReportPath)
Write-Host ""
Write-Host "Abrindo a pasta de screenshots..."
Start-Process explorer.exe -ArgumentList "`"$OutputDir`""
