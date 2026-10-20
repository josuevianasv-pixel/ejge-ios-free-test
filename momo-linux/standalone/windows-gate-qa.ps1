# Ephemeral Windows PowerShell 5.1 test. Does NOT run the full game or touch cabinets.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$SourceRoot,
  [string]$ReportFile = "$env:RUNNER_TEMP\mme5-standalone-result.json"
)
$ErrorActionPreference = 'Stop'
$server=Join-Path $SourceRoot 'server-local.ps1'
if(-not(Test-Path -LiteralPath $server)){throw 'SOURCE_REQUIRED: missing server-local.ps1'}
$raw=Get-Content -LiteralPath $server -Raw -Encoding UTF8
$entry='[MMStandaloneServer]::Run($RootDir, $Port)'
if(($raw.Split(@($entry),[StringSplitOptions]::None)).Count -ne 2){throw 'SOURCE_MISMATCH: server entrypoint changed'}
# Compile same server code and original native drivers, without starting the money server.
$compileOnly=$raw.Replace($entry, "Write-Output 'C_SHARP_BUILD_OK'")
$compileFile=Join-Path $env:RUNNER_TEMP 'mme5-standalone-compileonly.ps1'
[IO.File]::WriteAllText($compileFile,$compileOnly,(New-Object Text.UTF8Encoding($false)))
. $compileFile -RootDir $SourceRoot -Port 18992
if(-not ([System.Management.Automation.PSTypeName]'EJGELinkedCoordinator').Type){throw 'CSharp type not compiled'}
# Do not use a real operator config, balances, bills, licences or machine identity.
$dir=Join-Path $env:RUNNER_TEMP ('mme5-network-gate-'+[guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Force $dir)
$cfg=Join-Path $dir 'operator-config.json'
$json='{"version":14,"progressive":{"networkMode":"STANDALONE","link":{"autoDiscovery":false}}}'
[IO.File]::WriteAllText($cfg,$json,(New-Object Text.UTF8Encoding($false)))
$beforeTcp=@(Get-NetTCPConnection -State Listen -LocalPort 39052 -ErrorAction SilentlyContinue).Count
$beforeUdp=@(Get-NetUDPEndpoint -LocalPort 39051 -ErrorAction SilentlyContinue).Count
$coordinator=New-Object EJGELinkedCoordinator -ArgumentList @($dir,$SourceRoot,$cfg)
try {
  $coordinator.Start()
  if($coordinator.IsNetworkRunning){throw 'STANDALONE_FAILED: network coordinator reports running'}
  Start-Sleep -Milliseconds 450
  $afterTcp=@(Get-NetTCPConnection -State Listen -LocalPort 39052 -ErrorAction SilentlyContinue).Count
  $afterUdp=@(Get-NetUDPEndpoint -LocalPort 39051 -ErrorAction SilentlyContinue).Count
  if($afterTcp -gt $beforeTcp){throw 'STANDALONE_FAILED: TCP Linked port opened'}
  if($afterUdp -gt $beforeUdp){throw 'STANDALONE_FAILED: UDP Linked port opened'}
  $log=Join-Path $dir 'LINKED_EVENT.log'
  if(-not(Test-Path -LiteralPath $log)){throw 'STANDALONE_FAILED: no coordinator event log'}
  if(-not ((Get-Content -LiteralPath $log -Raw) -match 'STANDALONE_LINK_NETWORK_DISABLED')) {
    throw 'STANDALONE_FAILED: expected disabled-network event missing'
  }
  $output=[ordered]@{
    source='PRIVATE_EPHEMERAL_LAB'
    powershell='5.1'
    compiled=$true
    coordinator_started=$false
    linked_tcp_opened=$false
    linked_udp_opened=$false
    operator_accounting_modified=$false
    production_approved=$false
    note='No Edge, real bill acceptor, Windows LTSC or 72h test executed'
  }
  $output|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $ReportFile -Encoding UTF8
  Write-Host 'STANDALONE_WINDOWS_PRIVATE_LAB_PASS: C# compiled, Linked disabled, no new UDP/TCP listeners'
} finally {
  if($coordinator){$coordinator.Stop()}
}
