$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$OutputDir = Join-Path $Root "website\assets\screenshots"
$Report = Join-Path $Root "CAPTURAS_SITE_CAMPFIRE.txt"
$BackupRoot = Join-Path $OutputDir "_previous-auto-captures"
$Starter = Join-Path $Root "INICIAR_CAMPFIRE_CORRIGIDO.bat"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class CampfireAutoCaptureWin32
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
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsZoomed(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool MoveWindow(
        IntPtr hWnd,
        int X,
        int Y,
        int nWidth,
        int nHeight,
        bool bRepaint
    );

    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

[void][CampfireAutoCaptureWin32]::SetProcessDPIAware()

$SW_RESTORE = 9
$SW_MAXIMIZE = 3
$WM_SYSCOMMAND = 0x0112
$SC_CLOSE = 0xF060
$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004

$script:Captured = 0
$script:Skipped = 0
$script:WindowHandle = [IntPtr]::Zero
$script:OriginalRect = $null
$script:OriginalMaximized = $false

function Write-ReportLine([string]$Text) {
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Text
    Write-Host $line
    Add-Content -LiteralPath $Report -Value $line -Encoding UTF8
}

function Normalize-UiText([string]$Text) {
    if ([string]::IsNullOrWhiteSpace($Text)) { return "" }
    $formD = $Text.Normalize([Text.NormalizationForm]::FormD)
    $builder = New-Object Text.StringBuilder
    foreach ($char in $formD.ToCharArray()) {
        $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
        if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($char)
        }
    }
    return (($builder.ToString().Normalize([Text.NormalizationForm]::FormC)).ToLowerInvariant() -replace '\s+', ' ').Trim()
}

function Get-WindowArea([IntPtr]$Handle) {
    $rect = New-Object CampfireAutoCaptureWin32+RECT
    if (-not [CampfireAutoCaptureWin32]::GetWindowRect($Handle, [ref]$rect)) { return 0 }
    return [Math]::Max(0, ($rect.Right - $rect.Left)) * [Math]::Max(0, ($rect.Bottom - $rect.Top))
}

function Find-CampfireWindow {
    $candidates = @(
        Get-Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.MainWindowHandle -ne 0 -and
                $_.MainWindowTitle -match "(?i)Campfire"
            }
    )

    if ($candidates.Count -eq 0 -and (Test-Path -LiteralPath $Starter)) {
        Write-ReportLine "Campfire nao esta aberto. Iniciando pelo BAT oficial..."
        Start-Process -FilePath $Starter -WorkingDirectory $Root | Out-Null

        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Milliseconds 750
            $candidates = @(
                Get-Process -ErrorAction SilentlyContinue |
                    Where-Object {
                        $_.MainWindowHandle -ne 0 -and
                        $_.MainWindowTitle -match "(?i)Campfire"
                    }
            )
            if ($candidates.Count -gt 0) { break }
        }
    }

    if ($candidates.Count -eq 0) {
        throw "Nao encontrei a janela do Campfire. Abra o Campfire e execute este BAT novamente."
    }

    $best = $null
    $bestArea = -1
    foreach ($proc in $candidates) {
        $area = Get-WindowArea ([IntPtr]$proc.MainWindowHandle)
        if ($area -gt $bestArea) {
            $bestArea = $area
            $best = $proc
        }
    }

    return [IntPtr]$best.MainWindowHandle
}

function Bring-CampfireFront {
    if ($script:WindowHandle -eq [IntPtr]::Zero) { return }
    [void][CampfireAutoCaptureWin32]::ShowWindow($script:WindowHandle, $SW_RESTORE)
    [void][CampfireAutoCaptureWin32]::SetForegroundWindow($script:WindowHandle)
    Start-Sleep -Milliseconds 220
}

function Save-OriginalWindowState {
    $rect = New-Object CampfireAutoCaptureWin32+RECT
    if (-not [CampfireAutoCaptureWin32]::GetWindowRect($script:WindowHandle, [ref]$rect)) {
        throw "Nao consegui ler o tamanho da janela do Campfire."
    }

    $script:OriginalRect = [pscustomobject]@{
        Left = $rect.Left
        Top = $rect.Top
        Width = $rect.Right - $rect.Left
        Height = $rect.Bottom - $rect.Top
    }
    $script:OriginalMaximized = [CampfireAutoCaptureWin32]::IsZoomed($script:WindowHandle)
}

function Set-StandardCaptureSize {
    Bring-CampfireFront
    $screen = [System.Windows.Forms.Screen]::FromHandle($script:WindowHandle)
    $work = $screen.WorkingArea

    $width = [Math]::Min(1600, [Math]::Max(1000, $work.Width - 40))
    $height = [Math]::Min(900, [Math]::Max(650, $work.Height - 40))

    if (($width / $height) -gt 1.86) {
        $width = [Math]::Floor($height * (16.0 / 9.0))
    }

    if (($width / $height) -lt 1.60) {
        $height = [Math]::Floor($width * (9.0 / 16.0))
    }

    $x = $work.Left + [Math]::Floor(($work.Width - $width) / 2)
    $y = $work.Top + [Math]::Floor(($work.Height - $height) / 2)

    [void][CampfireAutoCaptureWin32]::ShowWindow($script:WindowHandle, $SW_RESTORE)
    [void][CampfireAutoCaptureWin32]::MoveWindow(
        $script:WindowHandle,
        [int]$x,
        [int]$y,
        [int]$width,
        [int]$height,
        $true
    )
    Bring-CampfireFront
    Start-Sleep -Milliseconds 700
    Write-ReportLine ("Janela temporariamente padronizada para {0}x{1}." -f $width, $height)
}

function Restore-OriginalWindowState {
    if ($script:WindowHandle -eq [IntPtr]::Zero -or $null -eq $script:OriginalRect) { return }
    try {
        [void][CampfireAutoCaptureWin32]::ShowWindow($script:WindowHandle, $SW_RESTORE)
        [void][CampfireAutoCaptureWin32]::MoveWindow(
            $script:WindowHandle,
            [int]$script:OriginalRect.Left,
            [int]$script:OriginalRect.Top,
            [int]$script:OriginalRect.Width,
            [int]$script:OriginalRect.Height,
            $true
        )
        if ($script:OriginalMaximized) {
            [void][CampfireAutoCaptureWin32]::ShowWindow($script:WindowHandle, $SW_MAXIMIZE)
        }
        Write-ReportLine "Tamanho/posicao originais restaurados."
    } catch {
        Write-ReportLine ("AVISO: nao consegui restaurar a janela: " + $_.Exception.Message)
    }
}

function Get-AutomationRoot {
    return [System.Windows.Automation.AutomationElement]::FromHandle($script:WindowHandle)
}

function Find-UiElement([string[]]$Names) {
    $rootElement = Get-AutomationRoot
    if ($null -eq $rootElement) { return $null }

    foreach ($name in $Names) {
        try {
            $condition = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::NameProperty,
                $name
            )
            $found = $rootElement.FindFirst(
                [System.Windows.Automation.TreeScope]::Descendants,
                $condition
            )
            if ($null -ne $found) { return $found }
        } catch {}
    }

    $wanted = @($Names | ForEach-Object { Normalize-UiText $_ } | Where-Object { $_ })
    try {
        $all = $rootElement.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )
        for ($i = 0; $i -lt $all.Count; $i++) {
            $element = $all.Item($i)
            $name = ""
            try { $name = [string]$element.Current.Name } catch {}
            if ([string]::IsNullOrWhiteSpace($name)) { continue }
            $normalized = Normalize-UiText $name
            foreach ($candidate in $wanted) {
                if ($normalized -eq $candidate -or $normalized.Contains($candidate)) {
                    return $element
                }
            }
        }
    } catch {}

    return $null
}

function Click-ElementCenter($Element) {
    try {
        $rect = $Element.Current.BoundingRectangle
        if ($rect.Width -lt 2 -or $rect.Height -lt 2) { return $false }
        $x = [int]($rect.Left + ($rect.Width / 2))
        $y = [int]($rect.Top + ($rect.Height / 2))
        Bring-CampfireFront
        [void][CampfireAutoCaptureWin32]::SetCursorPos($x, $y)
        [CampfireAutoCaptureWin32]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 40
        [CampfireAutoCaptureWin32]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
        return $true
    } catch {
        return $false
    }
}

function Invoke-UiElement($Element) {
    if ($null -eq $Element) { return $false }
    $current = $Element
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker

    for ($depth = 0; $depth -lt 7 -and $null -ne $current; $depth++) {
        try {
            $pattern = $current.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
            if ($null -ne $pattern) {
                $pattern.Invoke()
                return $true
            }
        } catch {}

        try {
            $pattern = $current.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
            if ($null -ne $pattern) {
                $pattern.Select()
                return $true
            }
        } catch {}

        try {
            $pattern = $current.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
            if ($null -ne $pattern) {
                $pattern.Expand()
                return $true
            }
        } catch {}

        try {
            if (Click-ElementCenter $current) { return $true }
        } catch {}

        try { $current = $walker.GetParent($current) } catch { $current = $null }
    }

    return $false
}

function Invoke-ByNames([string[]]$Names, [string]$Description, [int]$WaitMs = 650) {
    Bring-CampfireFront
    $element = Find-UiElement $Names
    if ($null -eq $element) {
        Write-ReportLine ("SKIP navegacao: " + $Description + " (controle nao encontrado).")
        return $false
    }

    if (-not (Invoke-UiElement $element)) {
        Write-ReportLine ("SKIP navegacao: " + $Description + " (controle encontrado, mas nao clicavel).")
        return $false
    }

    Start-Sleep -Milliseconds $WaitMs
    return $true
}

function Send-Escape([int]$Count = 1) {
    Bring-CampfireFront
    for ($i = 0; $i -lt $Count; $i++) {
        [System.Windows.Forms.SendKeys]::SendWait("{ESC}")
        Start-Sleep -Milliseconds 320
    }
}

function Prepare-OutputFolder {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    $existing = @(Get-ChildItem -LiteralPath $OutputDir -Filter "site-*.png" -File -ErrorAction SilentlyContinue)
    if ($existing.Count -gt 0) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backup = Join-Path $BackupRoot $stamp
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        foreach ($file in $existing) {
            Move-Item -LiteralPath $file.FullName -Destination (Join-Path $backup $file.Name) -Force
        }
        Write-ReportLine ("Capturas automaticas anteriores movidas para: " + $backup)
    }
}

function Capture-Window([string]$FileName, [string]$Description) {
    Bring-CampfireFront

    $rect = New-Object CampfireAutoCaptureWin32+RECT
    if (-not [CampfireAutoCaptureWin32]::GetWindowRect($script:WindowHandle, [ref]$rect)) {
        Write-ReportLine ("SKIP captura " + $Description + ": GetWindowRect falhou.")
        $script:Skipped++
        return $false
    }

    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    if ($width -lt 200 -or $height -lt 200) {
        Write-ReportLine ("SKIP captura " + $Description + ": janela pequena/minimizada.")
        $script:Skipped++
        return $false
    }

    $path = Join-Path $OutputDir $FileName
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

    $bytes = (Get-Item -LiteralPath $path).Length
    $script:Captured++
    Write-ReportLine ("CAPTURADO {0}: {1} ({2}x{3}, {4} bytes)" -f $Description, $FileName, $width, $height, $bytes)
    return $true
}

function Capture-Home {
    Invoke-ByNames @("Mensagens","Messages","Mensajes","Nachrichten","Messaggi") "aba Mensagens" 450 | Out-Null
    Capture-Window "site-01-home.png" "Tela principal" | Out-Null
}

function Capture-FileMenu {
    if (Invoke-ByNames @("Arquivo","File","Archivo","Fichier","Datei") "menu Arquivo" 400) {
        Capture-Window "site-02-menu-arquivo.png" "Menu Arquivo" | Out-Null
        Send-Escape
    } else {
        $script:Skipped++
    }
}

function Capture-Friends {
    if (-not (Invoke-ByNames @("Contatos","Contacts","Contactos","Kontakte","Contatti") "menu Contatos" 350)) {
        $script:Skipped++
        return
    }

    if (Invoke-ByNames @("Meus amigos","Friends","Amigos","Amis","Freunde","Amici") "Meus amigos" 650) {
        Capture-Window "site-03-amigos.png" "Amigos" | Out-Null
        Send-Escape
    } else {
        Send-Escape
        $script:Skipped++
    }
}

function Capture-CreateCampfire {
    if (-not (Invoke-ByNames @("Arquivo","File","Archivo","Fichier","Datei") "menu Arquivo" 350)) {
        $script:Skipped++
        return
    }

    if (Invoke-ByNames @("Nova Campfire","Start a Campfire","Criar Campfire","Create Campfire") "Nova Campfire" 650) {
        Capture-Window "site-04-criar-campfire.png" "Criar Campfire" | Out-Null
        Send-Escape
    } else {
        Send-Escape
        $script:Skipped++
    }
}

function Open-Settings {
    if (-not (Invoke-ByNames @("Ferramentas","Tools","Herramientas","Outils","Werkzeuge","Strumenti") "menu Ferramentas" 350)) {
        return $false
    }
    if (Invoke-ByNames @("Configurações","Settings","Configuración","Paramètres","Einstellungen","Impostazioni") "Configurações" 650) {
        return $true
    }
    Send-Escape
    return $false
}

function Capture-SettingsAndMedia {
    if (-not (Open-Settings)) {
        $script:Skipped += 2
        return
    }

    Capture-Window "site-05-configuracoes.png" "Configurações" | Out-Null

    if (Invoke-ByNames @("Voz e vídeo","Voice and video","Voice & video","Voz y vídeo","Voix et vidéo","Sprache und Video","Voce e video") "Voz e video" 600) {
        Capture-Window "site-06-voz-video.png" "Voz e vídeo" | Out-Null
    } else {
        $script:Skipped++
    }

    Send-Escape
}

function Capture-Animes {
    Invoke-ByNames @("Mensagens","Messages","Mensajes","Nachrichten","Messaggi") "aba Mensagens" 350 | Out-Null
    if (Invoke-ByNames @("Animes","Anime") "aba Animes" 850) {
        Capture-Window "site-07-animes.png" "Animes" | Out-Null
        Invoke-ByNames @("Mensagens","Messages","Mensajes","Nachrichten","Messaggi") "voltar para Mensagens" 500 | Out-Null
    } else {
        $script:Skipped++
    }
}

function Capture-Screen {
    if (Invoke-ByNames @("Tela","Screen","Pantalla","Écran","Bildschirm","Schermo") "aba Tela" 700) {
        Capture-Window "site-08-tela.png" "Tela / compartilhamento" | Out-Null
        Invoke-ByNames @("Mensagens","Messages","Mensajes","Nachrichten","Messaggi") "voltar para Mensagens" 500 | Out-Null
    } else {
        $script:Skipped++
    }
}

function Get-CloseBehavior {
    $prefFile = $null
    try {
        $prefFile = Get-ChildItem -Path $env:APPDATA -Filter "campfire-desktop-preferences.json" -File -Recurse -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
    } catch {}

    if ($null -eq $prefFile) {
        Write-ReportLine "Preferencias de fechamento nao encontradas; assumindo o padrao Perguntar sempre."
        return "ask"
    }

    try {
        $json = Get-Content -LiteralPath $prefFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        $behavior = [string]$json.closeBehavior
        if ([string]::IsNullOrWhiteSpace($behavior)) { $behavior = "ask" }
        Write-ReportLine ("Ao fechar: " + $behavior + " (" + $prefFile.FullName + ")")
        return $behavior
    } catch {
        Write-ReportLine "Nao consegui ler closeBehavior; por seguranca, o modal de fechamento sera ignorado."
        return "unknown"
    }
}

function Capture-ClosePrompt {
    $behavior = Get-CloseBehavior
    if ($behavior -ne "ask") {
        Write-ReportLine "SKIP Fechamento: configure 'Ao fechar o Campfire' como 'Perguntar sempre' para capturar este modal sem risco."
        $script:Skipped++
        return
    }

    Bring-CampfireFront
    [void][CampfireAutoCaptureWin32]::PostMessage(
        $script:WindowHandle,
        [uint32]$WM_SYSCOMMAND,
        [IntPtr]$SC_CLOSE,
        [IntPtr]::Zero
    )
    Start-Sleep -Milliseconds 850

    $dialog = Find-UiElement @(
        "Vai abandonar a fogueira?",
        "Leaving the campfire?",
        "¿Vas a abandonar la fogata?",
        "Vous quittez le feu de camp ?",
        "Verlässt du das Lagerfeuer?",
        "Abbandoni il falò?"
    )

    if ($null -eq $dialog) {
        Write-ReportLine "SKIP Fechamento: o diálogo não apareceu. A janela nao sera fechada pelo capturador."
        $script:Skipped++
        Bring-CampfireFront
        return
    }

    Capture-Window "site-09-fechamento.png" "Modal de fechamento" | Out-Null

    $cancel = Find-UiElement @(
        "Foi mal, cliquei no X sem querer",
        "Oops, I clicked X by accident",
        "Perdón, hice clic en la X",
        "Oups, j'ai cliqué sur X",
        "Ups, ich habe aus Versehen auf X geklickt",
        "Ops, ho cliccato la X per sbaglio"
    )
    if ($null -ne $cancel) {
        [void](Invoke-UiElement $cancel)
        Start-Sleep -Milliseconds 450
    } else {
        Send-Escape
    }
}

function Capture-About {
    if (-not (Invoke-ByNames @("Ajuda","Help","Ayuda","Aide","Hilfe","Aiuto") "menu Ajuda" 350)) {
        $script:Skipped++
        return
    }

    if (Invoke-ByNames @("Sobre o Campfire","About Campfire","Acerca de Campfire","À propos de Campfire","Über Campfire","Informazioni su Campfire") "Sobre o Campfire" 600) {
        Capture-Window "site-10-sobre.png" "Sobre o Campfire" | Out-Null
        Send-Escape
    } else {
        Send-Escape
        $script:Skipped++
    }
}

try {
    Set-Content -LiteralPath $Report -Value "CAMPFIRE - CAPTURA AUTOMATICA PARA O SITE" -Encoding UTF8
    Write-ReportLine ("Raiz: " + $Root)
    Write-ReportLine "Nenhum dispositivo de voz/video sera ativado."

    Prepare-OutputFolder

    $script:WindowHandle = Find-CampfireWindow
    Write-ReportLine ("Janela encontrada: HWND=" + $script:WindowHandle)

    Save-OriginalWindowState
    Set-StandardCaptureSize

    Capture-Home
    Capture-FileMenu
    Capture-Friends
    Capture-CreateCampfire
    Capture-SettingsAndMedia
    Capture-Animes
    Capture-Screen
    Capture-ClosePrompt
    Capture-About

    Restore-OriginalWindowState

    Write-ReportLine ("RESUMO: capturadas=" + $script:Captured + " / ignoradas=" + $script:Skipped)
    Write-ReportLine ("Pasta: " + $OutputDir)

    try { Start-Process explorer.exe -ArgumentList ('"' + $OutputDir + '"') | Out-Null } catch {}

    Write-Host ""
    Write-Host "=============================================================="
    Write-Host " CAPTURA AUTOMATICA CONCLUIDA"
    Write-Host "=============================================================="
    Write-Host (" Capturadas: " + $script:Captured)
    Write-Host (" Ignoradas:  " + $script:Skipped)
    Write-Host ""
    Write-Host $OutputDir
    Write-Host ""
    Write-Host "Relatorio:"
    Write-Host $Report
    exit 0
}
catch {
    try { Restore-OriginalWindowState } catch {}
    Write-ReportLine ("FALHA: " + $_.Exception.Message)
    Write-ReportLine ("Detalhes: " + $_.ScriptStackTrace)
    Write-Host ""
    Write-Host "Envie este arquivo para o ChatGPT:"
    Write-Host $Report
    exit 1
}
