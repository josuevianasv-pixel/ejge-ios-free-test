# Area 2: C# native server integration QA, virtual credits only.
# Private source is extracted on ephemeral GitHub Actions Windows runner.
param([Parameter(Mandatory=$true)][string]$RootDir,[Parameter(Mandatory=$true)][string]$ReportDir,[int]$Port=18992)
$ErrorActionPreference="Stop"
$RootDir=(Resolve-Path -LiteralPath $RootDir).Path
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$ReportDir=(Resolve-Path -LiteralPath $ReportDir).Path
$results=New-Object System.Collections.ArrayList
$script:fail=0
$script:server=$null
$work=Join-Path $env:RUNNER_TEMP ("mme5-area2-"+[Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $work | Out-Null
$serverFile=Join-Path $RootDir "server-local.ps1"
function Ensure([bool]$value,[string]$message){if(-not $value){throw $message}}
function Test([string]$name,[scriptblock]$action){
  try{ & $action;[void]$script:results.Add([pscustomobject]@{name=$name;status="PASS"});Write-Host "PASS $name" }
  catch {
    $script:fail++
    $detail=[string]$_.Exception.Message
    $detail=$detail.Replace($RootDir,"<PRIVATE_SOURCE>").Replace($work,"<QA_TEMP>")
    [void]$script:results.Add([pscustomobject]@{name=$name;status="FAIL";detail=$detail})
    Write-Host "FAIL $name : $detail"
  }
}
function Http([string]$method,[string]$path,[hashtable]$payload=@{}){
  $request=[System.Net.HttpWebRequest][System.Net.WebRequest]::Create(("http://127.0.0.1:"+$Port+$path))
  $request.Method=$method;$request.Timeout=10000;$request.KeepAlive=$false;$request.Proxy=$null
  if($method -eq "POST"){
    $bytes=[Text.Encoding]::UTF8.GetBytes(($payload|ConvertTo-Json -Depth 24 -Compress))
    $request.ContentType="application/json";$request.ContentLength=$bytes.Length
    $write=$request.GetRequestStream()
    try{$write.Write($bytes,0,$bytes.Length)}finally{$write.Dispose()}
  }
  $response=$null
  try{$response=[System.Net.HttpWebResponse]$request.GetResponse()}
  catch [System.Net.WebException]{$response=$_.Exception.Response;if($null -eq $response){throw}}
  try{
    $reader=New-Object IO.StreamReader($response.GetResponseStream())
    try{$data=$reader.ReadToEnd()}finally{$reader.Dispose()}
    Ensure (-not [string]::IsNullOrWhiteSpace($data)) ("HTTP response empty at "+$path)
    $obj=ConvertFrom-Json -InputObject $data
    return @{status=[int]$response.StatusCode;body=$obj}
  }finally{if($response){$response.Dispose()}}
}
function Stop-Server(){
  if($script:server){
    try{Stop-Process -Id $script:server.Id -Force -ErrorAction SilentlyContinue}catch{}
    $script:server=$null
    Start-Sleep -Seconds 2
  }
}
function Start-Server(){
  $exe=Join-Path $PSHOME "powershell.exe"
  $args='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$serverFile+'" -RootDir "'+$RootDir+'" -Port '+$Port
  $script:server=Start-Process -FilePath $exe -ArgumentList $args -PassThru -RedirectStandardOutput (Join-Path $work "server.out.txt") -RedirectStandardError (Join-Path $work "server.err.txt")
  for($i=0;$i -lt 40;$i++){
    Start-Sleep -Seconds 2
    if($script:server.HasExited){throw "Servidor C# salió sin completar arranque"}
    try{
      $response=Http "GET" "/__local/runtime/state"
      if($response.status -eq 200 -and $response.body.ok -eq $true){return}
    }catch{}
  }
  throw "El servidor C# no respondió en 80 segundos"
}
function Clone-State($obj){
  $d=@{}
  if($obj){foreach($p in $obj.PSObject.Properties){$d[$p.Name]=$p.Value}}
  return $d
}
function Read-Runtime(){return (Http "GET" "/__local/runtime/state").body.state}
function Read-Accounting(){return (Http "GET" "/__local/accounting/state").body.state}
function Read-Handpay(){return (Http "GET" "/__local/handpay/state").body.state}
function Post-Runtime([hashtable]$s){return Http "POST" "/__local/runtime/state" $s}
function Post-Handpay([hashtable]$s){return Http "POST" "/__local/handpay/state" $s}
function Near([double]$a,[double]$b){return [Math]::Abs($a-$b) -lt 0.005}
$tx="QA2-HP-"+[Guid]::NewGuid().ToString("N")
$stamp=(Get-Date).ToUniversalTime().ToString("o")
try{
  Test "native_csharp_server_compiles_in_windows" {
    $validator=Join-Path $RootDir "VALIDAR-COMPILACION-QA7.ps1"
    Ensure (Test-Path $validator) "Validador C# original ausente"
    $ps=Join-Path $PSHOME "powershell.exe"
    $out=& $ps -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $validator -RootDir $RootDir 2>&1
    Ensure ($LASTEXITCODE -eq 0) ("No compila el servidor C#")
  }
  if($script:fail -eq 0){
    Test "server_boot_and_clean_money_state" {
      Start-Server
      $rt=Read-Runtime;$hp=Read-Handpay;$ac=Read-Accounting
      Ensure (-not $rt.balance -or (Near ([double]$rt.balance) 0)) "Runner no inició con saldo cero"
      Ensure ($hp.pending -ne $true) "Runner arranca con handpay de otra máquina"
      Ensure (-not $ac.lifetime.cashOut -or (Near ([double]$ac.lifetime.cashOut) 0)) "Runner tiene cashout previo"
    }
  }
  if($script:fail -eq 0){
    Test "pending_win_saved_without_credit" {
      $seed=@{schema="EJGE_RUNTIME_STATE_V1";version=2;revision=1;reason="QA2_PENDING_WIN_SEED";
        balance=30.0;currency="USD";spins=1;totalBet=0.2;processedBills=@();transactions=@();
        pendingWinCredit=@{amount=2.5;source="QA2_TEST";queuedAt=123456}}
      $post=Post-Runtime $seed
      Ensure ($post.body.saved -eq $true) "No se pudo preparar saldo y WIN pendiente"
      $r=Read-Runtime
      Ensure (Near ([double]$r.balance) 30) "WIN pendiente ya fue acreditado"
      Ensure (Near ([double]$r.pendingWinCredit.amount) 2.5) "WIN pendiente no persistió"
    }
    Test "pending_win_survives_server_restart" {
      Stop-Server
      Start-Server
      $r=Read-Runtime
      Ensure (Near ([double]$r.balance) 30) "El reinicio cambió saldo con WIN pendiente"
      Ensure (Near ([double]$r.pendingWinCredit.amount) 2.5) "Se perdió WIN pendiente"
    }
    Test "win_settled_once_with_revision_fence" {
      $before=Read-Runtime
      $new=Clone-State $before
      $new["revision"]=[long]$before.revision+1
      $new["reason"]="WIN_SETTLED_VISUAL_IDLE"
      $new["balance"]=32.5
      $new["pendingWinCredit"]=$null
      $first=Post-Runtime $new
      Ensure ($first.body.saved -eq $true) "No permitió el primer cobro WIN"
      $same=Post-Runtime $new
      Ensure ($same.body.saved -ne $true) "Aceptó revisión idéntica dos veces"
      $after=Read-Runtime
      Ensure (Near ([double]$after.balance) 32.5) "Se duplicó WIN o perdió saldo"
      Ensure ($null -eq $after.pendingWinCredit) "WIN sigue pendiente después de abonarlo"
    }
  }
  if($script:fail -eq 0){
    Test "handpay_requires_durable_cashier_authorization" {
      $pending=@{version="EJGE_HANDPAY_V1";revision=1;status="PENDING";pending=$true;
        id=$tx;amount=32.5;requestedAt=$stamp;clearAuthorizedAt=$null;clearedAt=$null;machineId="QA2-LAB";
        source="CABINET_KEY";clearSource="";lastPaid=$null}
      $r=Post-Handpay $pending
      Ensure ($r.body.saved -eq $true) "No se guardó la solicitud de pago"
      $denied=Http "POST" "/__local/handpay/commit-clear" @{txId=$tx;amount=32.5}
      Ensure ($denied.body.ok -ne $true) "CASHOUT sin autorización fue aceptado"
      Ensure ($denied.body.error -eq "HANDPAY_AUTHORIZATION_REQUIRED") "Motivo de rechazo inesperado"
      $runtime=Read-Runtime
      Ensure (Near ([double]$runtime.balance) 32.5) "CASHOUT sin autorización cambió saldo"
      $hp=Read-Handpay
      Ensure ($hp.status -eq "PENDING" -and $hp.id -eq $tx) "La solicitud pendiente se perdió"
    }
    Test "authorized_handpay_cashout_exactly_once" {
      $hp=Read-Handpay
      $authorized=Clone-State $hp
      $authorized["revision"]=[long]$hp.revision+1
      $authorized["status"]="CLEAR_AUTHORIZED";$authorized["pending"]=$true
      $authorized["clearSource"]="CASHIER_CLEAR";$authorized["clearAuthorizedAt"]=(Get-Date).ToUniversalTime().ToString("o")
      $put=Post-Handpay $authorized
      Ensure ($put.body.saved -eq $true) "Autorización no duradera"
      $runtime=Read-Runtime
      $runtimePart=Clone-State $runtime
      $runtimePart["balance"]=0.0;$runtimePart["reason"]="HANDPAY_SERVER_COMMIT_R36"
      $body=@{txId=$tx;amount=32.5;requestedAt=$stamp;clearAuthorizedAt=$authorized.clearAuthorizedAt;
        machineId="QA2-LAB";source="CABINET_KEY";clearSource="CASHIER_CLEAR";
        accountingRevision=0;runtime=$runtimePart;handpay=$authorized}
      $script:cashoutRequest=$body
      $committed=Http "POST" "/__local/handpay/commit-clear" $body
      Ensure ($committed.body.ok -eq $true -and $committed.body.status -eq "CLEARED") ("Servidor no completó CASHOUT: "+$committed.body.error)
      $rt=Read-Runtime;$hpFinal=Read-Handpay;$acct=Read-Accounting
      Ensure (Near ([double]$rt.balance) 0) "Saldo no quedó cero después de pagar"
      Ensure ($rt.lastCashout.handpayId -eq $tx) "Falta referencia al cobro"
      Ensure ($hpFinal.status -eq "CLEARED" -and $hpFinal.lastPaid.id -eq $tx) "Handpay no quedó finalizado"
      Ensure (Near ([double]$acct.lifetime.cashOut) 32.5) "CashOut no coincide con el pago"
      Ensure (Near ([double]$acct.lifetime.handpay) 32.5) "Contador HANDPAY no coincide"
      Ensure ([int]$acct.lifetime.handpayCount -eq 1) "Contador HANDPAY debe ser 1"
      Ensure (@($acct.cashoutTransactions|Where-Object {$_ -eq $tx}).Count -eq 1) "ID de cobro duplicado"
      $status=Http "GET" ("/__local/accounting/cashout-status?txId="+$tx)
      Ensure ($status.body.found -eq $true) "Estado compacto no confirmó cobro"
    }
    if($script:fail -eq 0){
      Test "same_cashout_request_is_idempotent" {
        $twice=Http "POST" "/__local/handpay/commit-clear" $script:cashoutRequest
        Ensure ($twice.body.ok -eq $true -and $twice.body.duplicate -eq $true) "Reintento de CASHOUT no fue idempotente"
        $rt=Read-Runtime;$acct=Read-Accounting
        Ensure (Near ([double]$rt.balance) 0) "Reintento alteró saldo"
        Ensure (Near ([double]$acct.lifetime.cashOut) 32.5) "Reintento duplicó CASHOUT"
        Ensure ([int]$acct.lifetime.handpayCount -eq 1) "Reintento duplicó handpayCount"
      }
      Test "cashout_replay_after_server_restart_is_idempotent" {
        Stop-Server
        Start-Server
        $again=Http "POST" "/__local/handpay/commit-clear" $script:cashoutRequest
        Ensure ($again.body.ok -eq $true -and $again.body.duplicate -eq $true) "CASHOUT antiguo no es seguro tras reiniciar"
        $rt=Read-Runtime;$acct=Read-Accounting
        Ensure (Near ([double]$rt.balance) 0) "Reinicio alteró saldo"
        Ensure (Near ([double]$acct.lifetime.cashOut) 32.5) "Reinicio duplicó caja"
      }
      Test "old_cashout_cannot_clear_new_credit" {
        $r=Read-Runtime
        $new=Clone-State $r
        $new["revision"]=[long]$r.revision+1;$new["reason"]="MANUAL_CREDIT";$new["balance"]=1.0
        $credited=Post-Runtime $new
        Ensure ($credited.body.saved -eq $true) "No pudo crear crédito sintético de laboratorio"
        $old=Http "POST" "/__local/handpay/commit-clear" $script:cashoutRequest
        Ensure ($old.body.ok -ne $true -and $old.body.error -eq "CASHOUT_ALREADY_CLEARED_STATE_CHANGED") "El viejo CASHOUT no rechazó nuevo saldo"
        $after=Read-Runtime
        Ensure (Near ([double]$after.balance) 1) "CASHOUT antiguo borró crédito nuevo"
        $acct=Read-Accounting
        Ensure (Near ([double]$acct.lifetime.cashOut) 32.5) "CASHOUT viejo cambió contabilidad"
      }
    }
  }
  # Negative security test: same WIN cannot be applied again with a higher revision.
  # Run it LAST, because a vulnerable implementation may actually mutate the
  # virtual balance, and we must never interpret that as a passing test.
  if($script:fail -eq 0){
    Test "win_settlement_with_new_revision_must_not_double_credit" {
      $r=Read-Runtime
      Ensure ($null -eq $r.pendingWinCredit) "Prueba inicial no dejó WIN asentado"
      $candidate=Clone-State $r
      $candidate["revision"]=[long]$r.revision+1
      $candidate["reason"]="WIN_SETTLED_VISUAL_IDLE"
      $candidate["balance"]=[Math]::Round(([double]$r.balance)+2.5,2)
      $attempt=Post-Runtime $candidate
      Ensure ($attempt.body.saved -ne $true) "CRITICAL: WIN anterior volvió a acreditarse con una revisión nueva"
      $final=Read-Runtime
      Ensure (Near ([double]$final.balance) ([double]$r.balance)) "CRITICAL: saldo cambió al reejecutar un WIN ya consumido"
    }
  }
}finally{
  Stop-Server
  $report=[ordered]@{
    schema="MME5_AREA2_WINDOWS_QA_V1";source="PRIVATE_RELEASE";physicalDevicesValidated=$false;
    testedAt=(Get-Date).ToUniversalTime().ToString("o");total=$results.Count;
    passed=@($results|Where-Object {$_.status -eq "PASS"}).Count;failed=$script:fail;tests=@($results)}
  $report|ConvertTo-Json -Depth 8|Set-Content (Join-Path $ReportDir "area2-qa-summary.json") -Encoding UTF8
  Write-Host "AREA2_REPORT PASS=$($report.passed) FAIL=$($report.failed)"
}
if($script:fail -gt 0){exit 1}
exit 0
