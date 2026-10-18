# MME5 Windows QA: emulador virtual, no dinero real.
# Las fuentes se extraen de una Release PRIVADA; este script no publica el juego.
param(
  [Parameter(Mandatory=$true)][string]$RootDir,
  [Parameter(Mandatory=$true)][string]$ReportDir,
  [int]$Port = 18991
)
$ErrorActionPreference="Stop"
$ProgressPreference="SilentlyContinue"
$RootDir=(Resolve-Path -LiteralPath $RootDir).Path
New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
$ReportDir=(Resolve-Path -LiteralPath $ReportDir).Path
$results=New-Object System.Collections.ArrayList
$failCount=0
$runtime=if($env:RUNNER_TEMP){$env:RUNNER_TEMP}else{[IO.Path]::GetTempPath()}
$testRoot=Join-Path $runtime ("mme5-bill-qa-"+[Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
function Assert-QA([bool]$ok,[string]$message){if(-not $ok){throw $message}}
function Add-Result([string]$name,[scriptblock]$block){
  try{
    & $block
    [void]$script:results.Add([pscustomobject]@{name=$name;status="PASS"})
    Write-Host "PASS $name"
  }catch{
    $script:failCount++
    $safe=[string]$_.Exception.Message
    $safe=$safe.Replace($RootDir,"<PRIVATE_SOURCE>").Replace($testRoot,"<TEST_TEMP>")
    [void]$script:results.Add([pscustomobject]@{name=$name;status="FAIL";detail=$safe})
    Write-Host "FAIL $name : $safe"
  }
}
function New-TestDriver([string]$scenario){
  $dir=Join-Path $testRoot $scenario
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  $driver=New-Object VirtualBillAcceptorNative -ArgumentList @($dir)
  $driver.Start()
  $driver.SetDesired($true,"QA_LAB_BASE_IDLE")
  return $driver
}
function Find-Bill($driver,[string]$id){
  $data=$driver.Snapshot()
  return @($data["recentBills"] | Where-Object { $_["id"] -eq $id })
}
$virtualFile=Join-Path $RootDir "native\VirtualBillAcceptorNative.cs"
$managerFile=Join-Path $RootDir "native\BillAcceptorManager.cs"
$qaFile=Join-Path $RootDir "TEST-BILLETERO-VIRTUAL-DURABILIDAD-QA.ps1"
$serverFile=Join-Path $RootDir "server-local.ps1"
if(!(Test-Path $virtualFile) -or !(Test-Path $managerFile) -or !(Test-Path $serverFile)){
  throw "SOURCE_MISSING: faltan las fuentes necesarias para compilar el billetero virtual"
}
Add-Result "native_csharp_compile" {
  $manager=Get-Content -LiteralPath $managerFile -Raw -Encoding UTF8
  $match=[regex]::Match($manager,'(?s)public interface IEJGEBillAcceptorNative\s*\{.*?\}')
  Assert-QA $match.Success "Interfaz IEJGEBillAcceptorNative ausente"
  $native=Get-Content -LiteralPath $virtualFile -Raw -Encoding UTF8
  $pos=$native.IndexOf("public sealed class VirtualBillAcceptorNative")
  Assert-QA ($pos -gt 0) "Clase virtual ausente"
  $combined=$native.Substring(0,$pos)+$match.Value+[Environment]::NewLine+$native.Substring($pos)
  Add-Type -TypeDefinition $combined -ReferencedAssemblies "System.Web.Extensions.dll" -ErrorAction Stop | Out-Null
}
if($failCount -eq 0){
  Add-Result "single_bill_ack_idempotent_after_restart" {
    $d=New-TestDriver "normal"
    $x=$d.InjectBill(5.00)
    Assert-QA ($x["ok"] -eq $true) "Insercion fallo"
    $id=[string]$x["id"]
    Assert-QA (-not [string]::IsNullOrWhiteSpace($id)) "ID vacio"
    $reason=""
    Assert-QA (-not $d.PrepareForGame(150,[ref]$reason)) "Autorizo PLAY con nota pendiente"
    Assert-QA ($d.Acknowledge($id)) "ACK inicial fallo"
    Assert-QA ($d.Acknowledge($id)) "ACK repetido fallo"
    Assert-QA ((@(Find-Bill $d $id)).Count -eq 1) "Registro duplicado"
    $d.Stop()
    $second=New-TestDriver "normal"
    $rows=@(Find-Bill $second $id)
    Assert-QA ($rows.Count -eq 1) "ID perdido tras reinicio"
    Assert-QA ($rows[0]["acked"] -eq $true) "ACK perdido tras reinicio"
    Assert-QA ($second.Acknowledge($id)) "ACK repetido tras reinicio fallo"
    $second.Stop()
  }
  Add-Result "disk_fault_blocks_ack_and_recovers" {
    $d=New-TestDriver "fault"
    [void]$d.SetStorageFault($true)
    $x=$d.InjectBill(5.00)
    Assert-QA ($x["ok"] -eq $false) "Acepto sin guardado"
    Assert-QA ($x["physicallyStacked"] -eq $true) "STACKED simulado no reportado"
    $id=[string]$x["id"]
    Assert-QA (-not [string]::IsNullOrWhiteSpace($id)) "ID pendiente vacio"
    Assert-QA ($d.Snapshot()["historyUnsafe"] -eq $true) "No inhibio historial inseguro"
    Assert-QA (-not $d.Acknowledge($id)) "ACK durante fallo de disco"
    $restore=$d.SetStorageFault($false)
    Assert-QA ($restore["historyUnsafe"] -eq $false) "No recupero guardado"
    Assert-QA ((@(Find-Bill $d $id)).Count -eq 1) "Perdio ID pendiente"
    Assert-QA ($d.Acknowledge($id)) "ACK tras restaurar fallo"
    $d.Stop()
    $again=New-TestDriver "fault"
    $rows=@(Find-Bill $again $id)
    Assert-QA ($rows.Count -eq 1) "ID perdido al reiniciar"
    Assert-QA ($rows[0]["acked"] -eq $true) "ACK no era duradero"
    $again.Stop()
  }
  Add-Result "ack_write_failure_fails_closed" {
    $d=New-TestDriver "ack-fault"
    $x=$d.InjectBill(1.00)
    Assert-QA ($x["ok"] -eq $true) "No se preparo nota"
    $id=[string]$x["id"]
    [void]$d.SetStorageFault($true)
    Assert-QA (-not $d.Acknowledge($id)) "ACK debio fallar"
    Assert-QA ($d.Snapshot()["historyUnsafe"] -eq $true) "No inhibio despues de fallo de ACK"
    [void]$d.SetStorageFault($false)
    Assert-QA ($d.Acknowledge($id)) "Repeticion tras recuperacion fallo"
    $d.Stop()
  }
  Add-Result "stacker_removal_inhibits" {
    $d=New-TestDriver "stacker"
    [void]$d.SetStackerPresent($false)
    $x=$d.InjectBill(5)
    Assert-QA ($x["error"] -eq "STACKER_REMOVED") "Acepto sin stacker"
    [void]$d.SetStackerPresent($true)
    $d.SetDesired($true,"QA_RECOVERY")
    $x=$d.InjectBill(5)
    Assert-QA ($x["ok"] -eq $true) "No recupero stacker"
    Assert-QA ($d.Acknowledge([string]$x["id"])) "ACK fallo"
    $d.Stop()
  }
  Add-Result "corrupt_history_does_not_overwrite" {
    $dir=Join-Path $testRoot "corrupt"
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $file=Join-Path $dir "virtual-bill-history-QA.json"
    $bad='{"schema":"CORRUPTED_DO_NOT_OVERWRITE"}'
    [IO.File]::WriteAllText($file,$bad)
    $d=New-TestDriver "corrupt"
    Assert-QA ($d.Snapshot()["historyUnsafe"] -eq $true) "No detecto corrupcion"
    $x=$d.InjectBill(5)
    Assert-QA ($x["ok"] -eq $false) "Acepto con historial corrupto"
    Assert-QA ([IO.File]::ReadAllText($file) -eq $bad) "Sobrescribio historial corrupto"
    $d.Stop()
  }
  Add-Result "ebds_id003_pulse" {
    foreach($proto in @("EBDS","ID003","PULSE")){
      $d=New-TestDriver ("protocol-"+$proto)
      $d.ConfigureProtocol($proto)
      $x=$d.InjectBill(1)
      Assert-QA ($x["ok"] -eq $true) ("No inyecto "+$proto)
      Assert-QA (([string]$x["id"]) -like ("VIRTUAL-"+$proto+"-*")) ("ID incorrecto "+$proto)
      Assert-QA ($d.Acknowledge([string]$x["id"])) ("ACK incorrecto "+$proto)
      $d.Stop()
    }
  }
}
Add-Result "whole_server_csharp_compile" {
  $validator=Join-Path $RootDir "VALIDAR-COMPILACION-QA7.ps1"
  Assert-QA (Test-Path $validator) "Validador completo ausente"
  $ps=Join-Path $PSHOME "powershell.exe"
  $out=& $ps -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $validator -RootDir $RootDir 2>&1
  Assert-QA ($LASTEXITCODE -eq 0) ("Compilacion integral fallo: "+(($out|Out-String).Trim()))
}
# The private E2E script uses Invoke-WebRequest on Windows PowerShell 5.1.
# On non-2xx replies its error body may already be consumed before the catch
# reads it. Replace ONLY the HTTP transport in the ephemeral test copy.
$qaRunnerFile=Join-Path $RootDir "TEST-BILLETERO-VIRTUAL-DURABILIDAD-PUBLIC-RUNNER.ps1"
function Prepare-QARunnerScript {
  $original=Get-Content -LiteralPath $qaFile -Raw -Encoding UTF8
  $begin=$original.IndexOf('function Api(')
  $end=$original.IndexOf('function Assert(',[Math]::Max(0,$begin))
  Assert-QA ($begin -ge 0 -and $end -gt $begin) "Helper HTTP privado ausente; no se modifica la prueba"
  $transport=@'
function Api([string]$method,[string]$path,[hashtable]$body=@{}){
  $req=[System.Net.HttpWebRequest][System.Net.WebRequest]::Create(($base+$path))
  $req.Method=$method
  $req.Timeout=10000
  $req.Proxy=$null
  $req.KeepAlive=$false
  if($method -eq 'POST'){
    $payload=[Text.Encoding]::UTF8.GetBytes(($body|ConvertTo-Json -Depth 7 -Compress))
    $req.ContentType='application/json'
    $req.ContentLength=$payload.Length
    $w=$req.GetRequestStream()
    try{$w.Write($payload,0,$payload.Length)}finally{$w.Dispose()}
  }
  $resp=$null
  try{$resp=[System.Net.HttpWebResponse]$req.GetResponse()}
  catch [System.Net.WebException]{
    $resp=$_.Exception.Response
    if($null -eq $resp){throw}
  }
  try{
    $code=[int]$resp.StatusCode
    $reader=New-Object IO.StreamReader($resp.GetResponseStream())
    try{$raw=$reader.ReadToEnd()}finally{$reader.Dispose()}
    if([string]::IsNullOrWhiteSpace($raw)){
      throw ("HTTP "+$code+" BODY_EMPTY at "+$path+"; cannot prove persisted bill outcome")
    }
    try{$obj=ConvertFrom-Json -InputObject $raw}
    catch{throw ("HTTP "+$code+" NON_JSON_RESPONSE at "+$path)}
    return @{http=$code;body=$obj}
  }finally{if($null -ne $resp){$resp.Dispose()}}
}
'@
  $patched=$original.Substring(0,$begin)+$transport+[Environment]::NewLine+$original.Substring($end)
  # ConvertFrom-Json on Windows PowerShell 5.1 produces a PSCustomObject;
  # assigning a NEW field directly throws. Keep all monetary assertions unchanged.
  $patched=$patched.Replace('$prev.verifiedAt=(Get-Date).ToString(''o'')', '$prev | Add-Member -NotePropertyName verifiedAt -NotePropertyValue ((Get-Date).ToString(''o'')) -Force')
  Set-Content -LiteralPath $qaRunnerFile -Value $patched -Encoding UTF8
  $tokens=$null;$errors=$null
  [void][System.Management.Automation.Language.Parser]::ParseFile($qaRunnerFile,[ref]$tokens,[ref]$errors)
  Assert-QA ($errors.Count -eq 0) "Sintaxis invalida del helper HTTP Windows"
}

$serverProcess=$null
function Stop-Server {
  if($script:serverProcess){
    try{Stop-Process -Id $script:serverProcess.Id -Force -ErrorAction SilentlyContinue}catch{}
    $script:serverProcess=$null
    Start-Sleep -Seconds 2
  }
}
function Start-Server {
  $ps=Join-Path $PSHOME "powershell.exe"
  $stdout=Join-Path $testRoot "server.stdout.log"
  $stderr=Join-Path $testRoot "server.stderr.log"
  $args='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$serverFile+'" -RootDir "'+$RootDir+'" -Port '+$Port
  $script:serverProcess=Start-Process -FilePath $ps -ArgumentList $args -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  for($i=0;$i -lt 60;$i++){
    Start-Sleep -Seconds 2
    if($script:serverProcess.HasExited){throw "Servidor termino antes de responder"}
    try{
      $s=Invoke-RestMethod -Uri ("http://127.0.0.1:"+$Port+"/__local/billacceptor/status") -TimeoutSec 2
      if($s.ok -eq $true){return}
    }catch{}
  }
  throw "Servidor no respondio a endpoint local en 120 segundos"
}
if($failCount -eq 0){
  try{
    $env:MME5_QA_BILL_STORAGE_FAULT="YES"
    Add-Result "http_disk_failure_and_recovery" {
      Assert-QA (Test-Path $qaFile) "Script E2E original ausente"
      Prepare-QARunnerScript
      Start-Server
      & $qaRunnerFile -Fase FalloYRecuperacion -Puerto $Port -ConfirmoLaboratorioSinDineroReal
    }
    if($failCount -eq 0){
      Add-Result "http_same_id_after_server_restart" {
        Stop-Server
        Start-Server
        & $qaRunnerFile -Fase DespuesDeReinicio -Puerto $Port -ConfirmoLaboratorioSinDineroReal
      }
    }
  }finally{Stop-Server}
}
$report=[ordered]@{
  schema="MME5_PUBLIC_RUNNER_BILL_QA_V1"
  scope="WINDOWS_VIRTUAL_BILL_ONLY_NO_REAL_MONEY"
  testedAt=(Get-Date).ToUniversalTime().ToString("o")
  total=$results.Count
  passed=@($results|Where-Object {$_.status -eq "PASS"}).Count
  failed=$failCount
  tests=@($results)
  original210SuiteNotExecuted=$true
  physicalMEIValidated=$false
}
$file=Join-Path $ReportDir "bill-qa-summary.json"
$report|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $file -Encoding UTF8
Write-Host "REPORT=$file PASS=$($report.passed) FAIL=$failCount"
if($failCount -gt 0){exit 1}
exit 0
