<#
.SYNOPSIS
  Launches the Valhalla Engine Room landing page on localhost port 8001.

.DESCRIPTION
  Starts a python http.server instance rooted at the project root (so the
  shared/ folder resolves correctly via "../shared/" from v1-engine-room) and
  records its PID in .serve-pids.txt so it can be stopped later.

  Run once:
    .\serve.ps1
  Stop it later:
    .\serve.ps1 -Stop

.NOTES
  Requires Python 3 on PATH. Tested on Windows PowerShell.
#>
[CmdletBinding()]
param(
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$PidFile = Join-Path $ProjectRoot '.serve-pids.txt'
$Port = 8001
$Folder = 'v1-engine-room'
$Name = 'Engine Room'

function Stop-Servers {
    if (-not (Test-Path $PidFile)) {
        Write-Host 'No .serve-pids.txt found - nothing to stop.' -ForegroundColor Yellow
        return
    }
    $stopped = 0
    Get-Content $PidFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line) { return }
        $parts = $line -split ':'
        $procId = [int]$parts[0]
        $port = $parts[1]
        try {
            $proc = Get-Process -Id $procId -ErrorAction Stop
            Stop-Process -Id $procId -Force
            Write-Host ("Stopped PID {0} (port {1}, was: {2})" -f $procId, $port, $proc.ProcessName) -ForegroundColor DarkYellow
            $stopped++
        } catch {
            Write-Host ("PID {0} (port {1}) was not running." -f $procId, $port) -ForegroundColor DarkGray
        }
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host ("Stopped {0} server(s)." -f $stopped) -ForegroundColor Green
}

function Start-Servers {
    Push-Location $ProjectRoot
    try {
        $py = Get-Command python -ErrorAction SilentlyContinue
        if (-not $py) {
            throw 'Could not find "python" on PATH. Install Python 3 or use "py".'
        }

        if (Test-Path $PidFile) { Remove-Item $PidFile -Force }

        Write-Host ''
        Write-Host '== VALHALLA :: starting Engine Room server ==' -ForegroundColor Cyan
        Write-Host ''

        $proc = Start-Process -FilePath 'python' `
            -ArgumentList @('-m', 'http.server', "$Port", '--bind', '127.0.0.1') `
            -WorkingDirectory $ProjectRoot `
            -WindowStyle Hidden `
            -PassThru

        "$($proc.Id):$Port" | Add-Content -Path $PidFile

        $url = "http://localhost:$Port/$Folder/"
        Write-Host (" [{0}] {1,-16} -> {2}" -f $Port, $Name, $url) -ForegroundColor White

        Write-Host ''
        Write-Host 'Server is running. PID recorded in .serve-pids.txt.' -ForegroundColor Green
        Write-Host 'Stop it with:  .\serve.ps1 -Stop' -ForegroundColor DarkGray
        Write-Host ''
    } finally {
        Pop-Location
    }
}

if ($Stop) {
    Stop-Servers
} else {
    Start-Servers
}
