$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$launcherCandidates = @(Get-ChildItem -LiteralPath $projectRoot -Filter '*.bat' -File | Where-Object {
  (Get-Content -LiteralPath $_.FullName -Raw) -match 'npx --yes http-server \. -p %PORT%'
})
if ($launcherCandidates.Count -ne 1) { throw "Expected one game launcher, found $($launcherCandidates.Count)." }
$launcherPath = $launcherCandidates[0].FullName
if (-not $launcherPath.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Launcher resolved outside project: $launcherPath"
}

$launcher = $null
try {
  $launcher = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', ('"' + $launcherPath + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
  $response = $null
  for ($attempt = 0; $attempt -lt 50; $attempt += 1) {
    try {
      $candidate = Invoke-WebRequest -Uri 'http://127.0.0.1:18763/' -UseBasicParsing -TimeoutSec 1
      if ($candidate.StatusCode -eq 200) {
        $response = $candidate
        break
      }
    } catch {
      Start-Sleep -Milliseconds 400
    }
  }

  if (-not $response) { throw '启动游戏.bat did not serve HTTP 200 on port 18763.' }
  if ($response.Content -notmatch 'game-canvas') { throw 'Served page does not contain the game canvas.' }
  Write-Output 'startup HTTP status: 200'
  Write-Output 'startup HTML game canvas: present'
} finally {
  $listeners = Get-NetTCPConnection -LocalPort 18763 -State Listen -ErrorAction SilentlyContinue
  foreach ($serverOwnerId in @($listeners.OwningProcess | Select-Object -Unique)) {
    if (-not $serverOwnerId) { continue }
    $server = Get-CimInstance Win32_Process -Filter "ProcessId=$serverOwnerId" -ErrorAction SilentlyContinue
    if ($server -and $server.Name -match '^node(\.exe)?$' -and $server.CommandLine -match 'http-server') {
      Stop-Process -Id $serverOwnerId -Force -ErrorAction SilentlyContinue
    }
  }
  if ($launcher -and -not $launcher.HasExited) {
    Stop-Process -Id $launcher.Id -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Milliseconds 500
if (Get-NetTCPConnection -LocalPort 18763 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Port 18763 remained occupied after startup smoke cleanup.'
}
Write-Output 'startup cleanup: complete'
