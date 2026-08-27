$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$OutputDir = Join-Path $Root "website\assets\screenshots"

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class CampfireCaptureWin32
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
}
"@

[void][CampfireCaptureWin32]::SetProcessDPIAware()

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

function Get-NextScreenshotNumber {
    $max = 0
    Get-ChildItem -LiteralPath $OutputDir -File -Filter "campfire-*.png" -ErrorAction SilentlyContinue |
        ForEach-Object {
            if ($_.BaseName -match '^campfire-(\d+)$') {
                $n = [int]$Matches[1]
                if ($n -gt $max) { $max = $n }
            }
        }
    return ($max + 1)
}

function Get-WindowTitle([IntPtr]$Handle) {
    $buffer = New-Object System.Text.StringBuilder 1024
    [void][CampfireCaptureWin32]::GetWindowText($Handle, $buffer, $buffer.Capacity)
    return $buffer.ToString()
}

function Save-CampfireScreenshot {
    $hwnd = [CampfireCaptureWin32]::GetForegroundWindow()
    if ($hwnd -eq [IntPtr]::Zero) {
        Write-Host "[AVISO] Nenhuma janela ativa foi encontrada." -ForegroundColor Yellow
        [Console]::Beep(500, 120)
        return
    }

    $title = Get-WindowTitle $hwnd
    if ($title -notmatch '(?i)Campfire') {
        Write-Host ""
        Write-Host "[IGNORADO] A janela ativa nao parece ser o Campfire." -ForegroundColor Yellow
        Write-Host "           Janela ativa: $title"
        Write-Host "           Clique no Campfire e pressione F8 novamente."
        [Console]::Beep(450, 120)
        return
    }

    $rect = New-Object CampfireCaptureWin32+RECT
    if (-not [CampfireCaptureWin32]::GetWindowRect($hwnd, [ref]$rect)) {
        Write-Host "[ERRO] Nao foi possivel obter o tamanho da janela." -ForegroundColor Red
        [Console]::Beep(350, 180)
        return
    }

    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top

    if ($width -le 20 -or $height -le 20) {
        Write-Host "[AVISO] A janela do Campfire esta minimizada ou possui tamanho invalido." -ForegroundColor Yellow
        [Console]::Beep(450, 120)
        return
    }

    $number = Get-NextScreenshotNumber
    $name = "campfire-{0:D2}.png" -f $number
    $path = Join-Path $OutputDir $name

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

    $size = (Get-Item -LiteralPath $path).Length
    Write-Host ""
    Write-Host "[CAPTURADO] $name" -ForegroundColor Green
    Write-Host "            $width x $height"
    Write-Host "            $size bytes"
    Write-Host "            $path"
    [Console]::Beep(900, 90)
}

Write-Host "=============================================================="
Write-Host " CAMPFIRE - CAPTURADOR DE SCREENSHOTS"
Write-Host "=============================================================="
Write-Host ""
Write-Host "Pasta de destino:"
Write-Host "  $OutputDir"
Write-Host ""
Write-Host "Como usar:"
Write-Host "  1. Deixe esta janela aberta."
Write-Host "  2. Abra o Campfire e deixe a tela que deseja fotografar visivel."
Write-Host "  3. Com o Campfire em primeiro plano, pressione F8."
Write-Host "  4. Repita para todas as telas."
Write-Host ""
Write-Host "Os arquivos serao salvos como:"
Write-Host "  campfire-01.png, campfire-02.png, ..."
Write-Host ""
Write-Host "Para encerrar: volte a esta janela e pressione Ctrl+C,"
Write-Host "ou simplesmente feche a janela."
Write-Host ""
Write-Host "Aguardando F8..." -ForegroundColor Cyan

$VK_F8 = 0x77
$wasDown = $false

while ($true) {
    $state = [CampfireCaptureWin32]::GetAsyncKeyState($VK_F8)
    $isDown = (($state -band 0x8000) -ne 0)

    if ($isDown -and -not $wasDown) {
        Save-CampfireScreenshot
    }

    $wasDown = $isDown
    Start-Sleep -Milliseconds 55
}
