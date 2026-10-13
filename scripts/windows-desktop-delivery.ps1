param([string]$Source, [string]$Destination)
$ErrorActionPreference = 'Stop'

function Test-YiyuRunning([string]$DesktopPath) {
    # Keep this script ASCII so Windows PowerShell 5.1 does not misdecode names.
    # Query failure throws: unknown state never permits replacement.
    $desktopName = [System.IO.Path]::GetFileNameWithoutExtension($DesktopPath)
    $processes = @(Get-Process -ErrorAction Stop)
    return @($processes | Where-Object { $_.ProcessName -in @('yiyu', $desktopName) }).Count -gt 0
}

function Update-YiyuDesktop([string]$ReleasePath, [string]$DesktopPath) {
    if (-not (Test-Path -LiteralPath $ReleasePath -PathType Leaf)) { throw 'YIYU_RELEASE_MISSING' }
    if (Test-YiyuRunning $DesktopPath) { return 'running' }
    $staged = Join-Path (Split-Path -Parent $DesktopPath) ('.yiyu-delivery-' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [System.IO.File]::Copy($ReleasePath, $staged, $false)
        # Recheck immediately before replacement; never kill, wait or retry.
        if (Test-YiyuRunning $DesktopPath) { return 'running' }
        if (Test-Path -LiteralPath $DesktopPath -PathType Leaf) {
            # PowerShell 5.1 coerces $null to an empty string for string arguments.
            [System.IO.File]::Replace($staged, $DesktopPath, [System.Management.Automation.Language.NullString]::Value)
        } else {
            [System.IO.File]::Move($staged, $DesktopPath)
        }
        return 'updated'
    } finally {
        if (Test-Path -LiteralPath $staged -PathType Leaf) { Remove-Item -LiteralPath $staged -Force }
    }
}

if ($Source -and $Destination) {
    try {
        $result = Update-YiyuDesktop $Source $Destination
        if ($result -eq 'running') { Write-Output 'YIYU_DELIVERY_RUNNING: replacement aborted; previous desktop file retained.'; exit 20 }
        Write-Output 'YIYU_DELIVERY_UPDATED'
    } catch {
        Write-Error 'YIYU_DELIVERY_ABORTED: safe replacement unavailable; no automatic retry.'
        exit 1
    }
}
