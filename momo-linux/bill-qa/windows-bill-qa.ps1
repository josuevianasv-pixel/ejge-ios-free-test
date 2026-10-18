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
if($failCount -eq 0){
  Add-Result "native_mixed_denominations_multiple_pending_and_restart" {
    $denoms=@(1.00,5.00,10.00,20.00,50.00,100.00)
    $d=New-TestDriver "denominations"
    $ids=New-Object System.Collections.ArrayList
    $sum=0.0
    foreach($amount in $denoms){
      $x=$d.InjectBill([double]$amount)
      Assert-QA ($x["ok"] -eq $true) ("Falló inserción de "+$amount)
      Assert-QA ([Math]::Abs(([double]$x["amount"])-$amount) -lt 0.005) "Denominación alterada"
      $id=[string]$x["id"]
      Assert-QA (-not $ids.Contains($id)) "ID repetido"
      [void]$ids.Add($id)
      $sum+=$amount
    }
    Assert-QA ($d.Snapshot()["unackedAccepted"] -eq $denoms.Count) "Se perdió una nota pendiente"
    $reason=""
    Assert-QA (-not $d.PrepareForGame(250,[ref]$reason)) "PLAY permitido con notas no confirmadas"
    $d.Stop()
    $again=New-TestDriver "denominations"
    Assert-QA ($again.Snapshot()["unackedAccepted"] -eq $denoms.Count) "Pendientes perdidas por reinicio"
    $rows=$again.Snapshot()["recentBills"]
    $actual=0.0
    foreach($id in $ids){
      $matches=@($rows|Where-Object {$_['id'] -eq $id})
      Assert-QA ($matches.Count -eq 1) "ID perdido o duplicado tras reinicio"
      $actual += [double]$matches[0]["amount"]
      Assert-QA ($again.Acknowledge([string]$id)) "ACK falló para nota pendiente"
      Assert-QA ($again.Acknowledge([string]$id)) "ACK repetido falló"
    }
    Assert-QA ([Math]::Abs($actual-$sum) -lt 0.005) "Suma de denominaciones incorrecta"
    $again.Stop()
    $final=New-TestDriver "denominations"
    Assert-QA ($final.Snapshot()["unackedAccepted"] -eq 0) "ACK no persistente"
    foreach($id in $ids){Assert-QA (@(Find-Bill $final ([string]$id)).Count -eq 1) "Historial perdido"}
    $final.Stop()
  }
  Add-Result "native_180_sequential_bills_periodic_restart" {
    $d=New-TestDriver "stress180"
    $ids=New-Object System.Collections.ArrayList
    $denoms=@(1.0,5.0,10.0,20.0)
    $total=0.0
    for($i=0;$i -lt 180;$i++){
      if($i -gt 0 -and $i%45 -eq 0){
        $d.Stop()
        $d=New-TestDriver "stress180"
        Assert-QA ($d.Snapshot()["unackedAccepted"] -eq 0) "ACK pendiente tras reinicio de carga"
      }
      $a=$denoms[$i%$denoms.Length]
      $x=$d.InjectBill([double]$a)
      Assert-QA ($x["ok"] -eq $true) ("Error de inserción #"+$i)
      $id=[string]$x["id"]
      Assert-QA (-not $ids.Contains($id)) ("ID duplicado #"+$i)
      [void]$ids.Add($id)
      Assert-QA ($d.Acknowledge($id)) ("ACK falló #"+$i)
      if($i%7 -eq 0){Assert-QA ($d.Acknowledge($id)) "ACK repetido falló durante carga"}
      $total+=$a
    }
    $d.Stop()
    $d=New-TestDriver "stress180"
    $historyFile=Join-Path (Join-Path $testRoot "stress180") "virtual-bill-history-QA.json"
    $raw=Get-Content -LiteralPath $historyFile -Raw | ConvertFrom-Json
    $history=@($raw.history)
    Assert-QA ($history.Count -eq 180) "El archivo duradero no contiene los 180 billetes"
    Assert-QA (@($history | Where-Object {$_.acked -eq $true}).Count -eq 180) "ACKs no duraderos"
    $actual=0.0
    foreach($row in $history){$actual += [double]$row.amount}
    Assert-QA ([Math]::Abs($actual-$total) -lt 0.005) "Suma duradera incorrecta"
    Assert-QA (@($history|Select-Object -ExpandProperty id -Unique).Count -eq 180) "IDs no únicos en historial"
    $d.Stop()
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
    # End-to-end monetary contract, using the SAME pending $5 bill from the
    # pre-restart phase, not a newly fabricated identifier.
    function Qa-Http([string]$method,[string]$path,[hashtable]$payload=@{}){
      $req=[System.Net.HttpWebRequest][System.Net.WebRequest]::Create(("http://127.0.0.1:"+$Port+$path))
      $req.Proxy=$null; $req.KeepAlive=$false; $req.Timeout=10000; $req.Method=$method
      if($method -eq "POST"){
        $raw=[Text.Encoding]::UTF8.GetBytes(($payload|ConvertTo-Json -Compress -Depth 20))
        $req.ContentType="application/json";$req.ContentLength=$raw.Length
        $w=$req.GetRequestStream()
        try{$w.Write($raw,0,$raw.Length)}finally{$w.Dispose()}
      }
      $resp=$null
      try{$resp=[System.Net.HttpWebResponse]$req.GetResponse()}
      catch [System.Net.WebException]{$resp=$_.Exception.Response;if($null -eq $resp){throw}}
      try{
        $reader=New-Object IO.StreamReader($resp.GetResponseStream())
        try{$text=$reader.ReadToEnd()}finally{$reader.Dispose()}
        Assert-QA (-not [string]::IsNullOrWhiteSpace($text)) ("EMPTY_HTTP_RESPONSE "+$path)
        return @{http=[int]$resp.StatusCode;body=(ConvertFrom-Json -InputObject $text)}
      }finally{if($null -ne $resp){$resp.Dispose()}}
    }
    $billId=""
    $preBalance=0
    Add-Result "http_bill_in_credit_ack_exactly_once" {
      $evidence=Get-Content -LiteralPath (Join-Path $RootDir "QA-BILLETERO-ULTIMA-PRUEBA.json") -Raw|ConvertFrom-Json
      Assert-QA ($evidence.phase -eq "DESPUES_REINICIO_PASS") "Fase de reinicio pendiente"
      $script:billId=[string]$evidence.id
      Assert-QA (-not [string]::IsNullOrWhiteSpace($billId)) "ID del billete vacio"
      $s=(Qa-Http "GET" "/__local/billacceptor/status").body
      Assert-QA ($s.historyUnsafe -ne $true) "Historial inseguro"
      $rows=@($s.recentBills|Where-Object {$_.id -eq $billId})
      Assert-QA ($rows.Count -eq 1) "Billete del reinicio no aparece una sola vez"
      Assert-QA ($rows[0].acked -ne $true) "El billete ya tenia ACK antes del credito"
      $before=(Qa-Http "GET" "/__local/runtime/state").body.state
      $preBalance=[double]$before.balance
      Assert-QA ([Math]::Abs($preBalance) -lt 0.005) "El laboratorio no arranco sin saldo; bloquear prueba monetaria"
      $ids=@($before.processedBills|Where-Object {$_})
      Assert-QA ($ids -notcontains $billId) "Billete previamente acreditado; no se puede atribuir la prueba"
      $acct=(Qa-Http "GET" "/__local/accounting/state").body.state
      Assert-QA ([Math]::Abs(([double]$acct.lifetime.billIn)-5.0) -lt 0.005) "Bill-In no se registro exactamente una vez"
      $events=@($acct.events|Where-Object {$_.txId -eq $billId -and $_.event -eq "BILL_ACCEPTED"})
      Assert-QA ($events.Count -eq 1) "Evento de Bill-In duplicado o ausente"
      $early=Qa-Http "POST" "/__local/billacceptor/ack" @{id=$billId}
      Assert-QA ($early.http -ne 200 -and $early.body.acked -ne $true) "El servidor confirmo sin credito guardado"
      $rev=[long]$before.revision+1
      $newIds=@($ids)+@($billId)
      $snapshot=@{
        schema="EJGE_RUNTIME_STATE_V1";version=2;revision=$rev;reason="BILL_CREDIT";
        balance=5.0;currency="USD";processedBills=$newIds;spins=0;totalBet=0.2
      }
      $post=Qa-Http "POST" "/__local/runtime/state" $snapshot
      Assert-QA ($post.http -eq 200 -and $post.body.saved -eq $true) "Servidor rechazo credito por billete STACKED"
      $saved=(Qa-Http "GET" "/__local/runtime/state").body.state
      Assert-QA ([Math]::Abs(([double]$saved.balance)-5.0) -lt 0.005) "Saldo no persistio exactamente $5"
      Assert-QA (@($saved.processedBills|Where-Object {$_ -eq $billId}).Count -eq 1) "ID no quedo persistido exactamente una vez"
      $ack=Qa-Http "POST" "/__local/billacceptor/ack" @{id=$billId}
      Assert-QA ($ack.http -eq 200 -and $ack.body.acked -eq $true) "ACK despues de credito no fue confirmado"
      Assert-QA ($ack.body.accountingDurable -eq $true -and $ack.body.runtimeDurable -eq $true -and $ack.body.creditReceiptDurable -eq $true) "ACK carece de recibos duraderos"
      $repeated=Qa-Http "POST" "/__local/billacceptor/ack" @{id=$billId}
      Assert-QA ($repeated.http -eq 200 -and $repeated.body.acked -eq $true) "ACK repetido no fue idempotente"
      for($i=0;$i -lt 3;$i++){[void](Qa-Http "GET" "/__local/billacceptor/status")}
      $acct2=(Qa-Http "GET" "/__local/accounting/state").body.state
      Assert-QA ([Math]::Abs(([double]$acct2.lifetime.billIn)-5.0) -lt 0.005) "Se duplico Bill-In al consultar estado"
      Assert-QA (@($acct2.events|Where-Object {$_.txId -eq $billId -and $_.event -eq "BILL_ACCEPTED"}).Count -eq 1) "Se duplico el evento Bill-In"
    }
    if($failCount -eq 0){
      Add-Result "http_duplicate_credit_rejected_after_process_restart" {
        Stop-Server
        Start-Server
        $virtual=(Qa-Http "POST" "/__local/billacceptor/virtual/config" @{enabled=$true;protocol="EBDS"}).body
        Assert-QA ($virtual.virtualEnabled -eq $true) "No restauro modo virtual tras reiniciar servidor"
        $st=(Qa-Http "GET" "/__local/runtime/state").body.state
        Assert-QA ([Math]::Abs(([double]$st.balance)-5.0) -lt 0.005) "Se perdio o duplico saldo tras reiniciar"
        Assert-QA (@($st.processedBills|Where-Object {$_ -eq $billId}).Count -eq 1) "Se perdio ID tras reiniciar"
        $acct=(Qa-Http "GET" "/__local/accounting/state").body.state
        Assert-QA ([Math]::Abs(([double]$acct.lifetime.billIn)-5.0) -lt 0.005) "Bill-In cambio tras reiniciar"
        Assert-QA (@($acct.events|Where-Object {$_.txId -eq $billId -and $_.event -eq "BILL_ACCEPTED"}).Count -eq 1) "Evento duplicado tras reiniciar"
        $bad=@{
          schema="EJGE_RUNTIME_STATE_V1";version=2;revision=([long]$st.revision+1);reason="BILL_CREDIT";
          balance=10.0;currency="USD";processedBills=@($st.processedBills);spins=0;totalBet=0.2
        }
        $second=Qa-Http "POST" "/__local/runtime/state" $bad
        Assert-QA ($second.body.saved -ne $true) "DUPLICACION: acepto credito por el mismo ID"
        $after=(Qa-Http "GET" "/__local/runtime/state").body.state
        Assert-QA ([Math]::Abs(([double]$after.balance)-5.0) -lt 0.005) "DUPLICACION: cambio el saldo"
        $ack=Qa-Http "POST" "/__local/billacceptor/ack" @{id=$billId}
        Assert-QA ($ack.http -eq 200 -and $ack.body.acked -eq $true) "ACK no idempotente despues de reinicio del servidor"
      }
    }
    function Credit-VirtualViaHttp([double]$amount,[bool]$ackNow){
      [void](Qa-Http "POST" "/__local/billacceptor/desired" @{accept=$true;reason="QA_LAB_BASE_IDLE"})
      $insert=Qa-Http "POST" "/__local/billacceptor/virtual/insert" @{amount=$amount}
      Assert-QA ($insert.http -eq 200 -and $insert.body.ok -eq $true) ("No insertó denominación "+$amount)
      $id=[string]$insert.body.id
      Assert-QA (-not [string]::IsNullOrWhiteSpace($id)) "Falta ID de billete virtual"
      $status=(Qa-Http "GET" "/__local/billacceptor/status").body
      Assert-QA (@($status.recentBills|Where-Object {$_.id -eq $id}).Count -eq 1) "No aparece billete pendiente"
      $account=(Qa-Http "GET" "/__local/accounting/state").body.state
      Assert-QA (@($account.events|Where-Object {$_.txId -eq $id -and $_.event -eq "BILL_ACCEPTED"}).Count -eq 1) "Bill-In ausente o duplicado"
      $old=(Qa-Http "GET" "/__local/runtime/state").body.state
      $oldBal=[double]$old.balance
      $existing=@($old.processedBills|Where-Object {$_})
      Assert-QA ($existing -notcontains $id) "ID ya acreditado antes de enviar"
      $snap=@{}
      foreach($p in $old.PSObject.Properties){$snap[$p.Name]=$p.Value}
      $snap["schema"]="EJGE_RUNTIME_STATE_V1"
      $snap["version"]=2
      $snap["revision"]=[long]$old.revision+1
      $snap["reason"]="BILL_CREDIT"
      $snap["balance"]=[Math]::Round($oldBal+$amount,2)
      $snap["processedBills"]=@($existing)+@($id)
      $saved=Qa-Http "POST" "/__local/runtime/state" $snap
      Assert-QA ($saved.http -eq 200 -and $saved.body.saved -eq $true) "Servidor rechazó acreditación por ID único"
      if($ackNow){
        $ack=Qa-Http "POST" "/__local/billacceptor/ack" @{id=$id}
        Assert-QA ($ack.http -eq 200 -and $ack.body.acked -eq $true) "ACK no confirmado tras crédito"
      }
      return @{id=$id;amount=$amount;previous=$oldBal;expected=[Math]::Round($oldBal+$amount,2)}
    }
    if($failCount -eq 0){
      Add-Result "http_two_denominations_bill_in_balance_ack" {
        $initial=(Qa-Http "GET" "/__local/runtime/state").body.state
        Assert-QA ([Math]::Abs(([double]$initial.balance)-5.0) -lt 0.005) "Se esperaba saldo de $5 de la prueba previa"
        $notes=New-Object System.Collections.ArrayList
        foreach($amt in @(1.0,10.0)){
          $bill=Credit-VirtualViaHttp $amt $true
          [void]$notes.Add($bill)
          $rt=(Qa-Http "GET" "/__local/runtime/state").body.state
          Assert-QA ([Math]::Abs(([double]$rt.balance)-$bill.expected) -lt 0.005) "Saldo no coincide tras crédito"
          Assert-QA (@($rt.processedBills|Where-Object {$_ -eq $bill.id}).Count -eq 1) "ID ausente del saldo duradero"
        }
        $acct=(Qa-Http "GET" "/__local/accounting/state").body.state
        Assert-QA ([Math]::Abs(([double]$acct.lifetime.billIn)-16.0) -lt 0.005) "Bill-In acumulado distinto a $16"
        foreach($bill in $notes){
          Assert-QA (@($acct.events|Where-Object {$_.txId -eq $bill.id -and $_.event -eq "BILL_ACCEPTED"}).Count -eq 1) "Bill-In repetido"
        }
        for($q=0;$q -lt 3;$q++){[void](Qa-Http "GET" "/__local/billacceptor/status")}
        $final=(Qa-Http "GET" "/__local/accounting/state").body.state
        Assert-QA ([Math]::Abs(([double]$final.lifetime.billIn)-16.0) -lt 0.005) "Consulta de estado duplicó Bill-In"
      }
    }
    if($failCount -eq 0){
      Add-Result "http_lost_ack_response_restart_recovers_20" {
        $bill=Credit-VirtualViaHttp 20.0 $false
        $id=[string]$bill.id
        Assert-QA ([Math]::Abs($bill.expected-36.0) -lt 0.005) "Saldo base inesperado"
        # Crash point: runtime was persisted but native ACK has NOT been called.
        Stop-Server
        Start-Server
        $v=(Qa-Http "POST" "/__local/billacceptor/virtual/config" @{enabled=$true;protocol="EBDS"}).body
        Assert-QA ($v.virtualEnabled -eq $true) "No abrió emulador después de reiniciar"
        $status=(Qa-Http "GET" "/__local/billacceptor/status").body
        $rows=@($status.recentBills|Where-Object {$_.id -eq $id})
        Assert-QA ($rows.Count -eq 1) "ID perdido tras caída antes del ACK"
        Assert-QA ($rows[0].acked -eq $true) "Servidor no reconstruyó ACK desde saldos y Bill-In duraderos"
        $runtime=(Qa-Http "GET" "/__local/runtime/state").body.state
        Assert-QA ([Math]::Abs(([double]$runtime.balance)-36.0) -lt 0.005) "Saldo cambiado durante reinicio"
        Assert-QA (@($runtime.processedBills|Where-Object {$_ -eq $id}).Count -eq 1) "ID no se conserva exactamente una vez"
        $acct=(Qa-Http "GET" "/__local/accounting/state").body.state
        Assert-QA ([Math]::Abs(([double]$acct.lifetime.billIn)-36.0) -lt 0.005) "Bill-In acumulado duplicado"
        Assert-QA (@($acct.events|Where-Object {$_.txId -eq $id -and $_.event -eq "BILL_ACCEPTED"}).Count -eq 1) "Bill-In de $20 duplicado"
        $ack=Qa-Http "POST" "/__local/billacceptor/ack" @{id=$id}
        Assert-QA ($ack.http -eq 200 -and $ack.body.acked -eq $true) "ACK después de recuperación no es idempotente"
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
