# Applies a narrowly scoped, reversible LAB-only C# candidate to the
# extracted PRIVATE MME5 server. Does not modify any GitHub Release.
param([Parameter(Mandatory=$true)][string]$RootDir)
$ErrorActionPreference="Stop"
$server=Join-Path $RootDir "server-local.ps1"
if(!(Test-Path $server)){throw "Area2 source missing"}
$s=Get-Content -LiteralPath $server -Encoding UTF8 -Raw
$old=@'
            // Older installations may have an accounting entry without a new
            // QA-5 receipt: never blindly reapply an already-known cashout id.
            Dictionary<string,object> accounting=LoadCriticalStateOrThrow(accountingStateFile);
            if(ListHasString(ObjectList(accounting.ContainsKey("cashoutTransactions")?accounting["cashoutTransactions"]:null),txId))
                return new Dictionary<string,object>{{"ok",false},{"error","LEGACY_CASHOUT_ALREADY_ACCOUNTED_REVIEW_REQUIRED"}};
            // Never accept a new cashier settlement without the durable
            // authorization recorded by /__local/handpay/state.
            Dictionary<string,object> authorized=LoadCriticalStateOrThrow(handpayStateFile);
            if (!String.Equals(GetString(authorized,"status",""),"CLEAR_AUTHORIZED",StringComparison.Ordinal) ||
                !String.Equals(GetString(authorized,"id",""),txId,StringComparison.Ordinal) ||
                Math.Abs(Money2(GetDouble(authorized,"amount",0))-amount)>.005)
                return new Dictionary<string,object>{{"ok",false},{"error","HANDPAY_AUTHORIZATION_REQUIRED"}};
'@
$new=@'
            // QA Area 2 candidate: recognize a cashout counted when its PENDING
            // screen opened. Do not reject an authorized cashout as a legacy
            // payment solely because that pre-counted ID already exists.
            Dictionary<string,object> accounting=LoadCriticalStateOrThrow(accountingStateFile);
            Dictionary<string,object> authorized=LoadCriticalStateOrThrow(handpayStateFile);
            if (!String.Equals(GetString(authorized,"status",""),"CLEAR_AUTHORIZED",StringComparison.Ordinal) ||
                !String.Equals(GetString(authorized,"id",""),txId,StringComparison.Ordinal) ||
                Math.Abs(Money2(GetDouble(authorized,"amount",0))-amount)>.005)
                return new Dictionary<string,object>{{"ok",false},{"error","HANDPAY_AUTHORIZATION_REQUIRED"}};
            if(ListHasString(ObjectList(accounting.ContainsKey("cashoutTransactions")?accounting["cashoutTransactions"]:null),txId))
            {
                // Existing id must be traceable to the same amount on the
                // present authorized PENDING transaction, not an old payout.
                Dictionary<string,object> rtNow=LoadCriticalStateOrThrow(runtimeStateFile);
                Dictionary<string,object> last=GetDict(rtNow,"lastCashout");
                if(String.Equals(GetString(last,"handpayId",""),txId,StringComparison.Ordinal) ||
                   Math.Abs(Money2(GetDouble(rtNow,"balance",0))-amount)>.005)
                    return new Dictionary<string,object>{{"ok",false},{"error","LEGACY_CASHOUT_ALREADY_ACCOUNTED_REVIEW_REQUIRED"}};
                bool pendingAmountProved=false;
                foreach(object obj in ObjectList(accounting.ContainsKey("events")?accounting["events"]:null))
                {
                    Dictionary<string,object> ev=obj as Dictionary<string,object>;
                    if(ev!=null && String.Equals(GetString(ev,"txId",""),txId,StringComparison.Ordinal) &&
                       String.Equals(GetString(ev,"event",""),"CASH_OUT",StringComparison.Ordinal) &&
                       Math.Abs(Money2(GetDouble(ev,"amount",0))-amount)<.005)
                    { pendingAmountProved=true; break; }
                }
                if(!pendingAmountProved)
                    return new Dictionary<string,object>{{"ok",false},{"error","CASHOUT_PRECOUNT_PROOF_MISSING"}};
            }
'@
$startMarker="            // Older installations may have an accounting entry without a new"
$endMarker='                return new Dictionary<string,object>{{"ok",false},{"error","HANDPAY_AUTHORIZATION_REQUIRED"}};'
$start=$s.IndexOf($startMarker,[StringComparison]::Ordinal)
$end=if($start -ge 0){$s.IndexOf($endMarker,$start,[StringComparison]::Ordinal)}else{-1}
if($start -lt 0 -or $end -lt 0){throw "Baseline candidate anchors not found: refusing patch"}
if($s.LastIndexOf($startMarker,[StringComparison]::Ordinal) -ne $start){throw "Multiple anchors: refusing patch"}
$s=$s.Substring(0,$start)+$new+$s.Substring($end+$endMarker.Length)
# The server accepted a second WIN_SETTLED_* with an arbitrarily higher
# revision even after the pending win was already consumed. Gate settlement
# to the EXACT durable pending amount and clear it once, fail-closed.
$methodStart=$s.IndexOf('    static bool SaveRuntimeIfNewer(Dictionary<string,object> incoming)')
if($methodStart -lt 0){throw "WIN settlement guard: SaveRuntimeIfNewer missing"}
$writeAnchor='            SaveJsonDictFileCore(runtimeStateFile, incoming);'
$writeAt=$s.IndexOf($writeAnchor,$methodStart,[StringComparison]::Ordinal)
$nextMethod=$s.IndexOf('    static bool SaveAccountingIfNewer(', $methodStart,[StringComparison]::Ordinal)
if($writeAt -lt 0 -or $nextMethod -lt 0 -or $writeAt -gt $nextMethod){throw "WIN settlement guard: write location not found"}
$gate=@'
            if(reason.StartsWith("WIN_SETTLED_",StringComparison.Ordinal))
            {
                Dictionary<string,object> pending=GetDict(current,"pendingWinCredit");
                double owed=Money2(GetDouble(pending,"amount",0));
                double beforeBalance=Money2(GetDouble(current,"balance",0)),
                       afterBalance=Money2(GetDouble(incoming,"balance",0));
                bool valid=owed>0 && Math.Abs(afterBalance-Money2(beforeBalance+owed))<.005 &&
                    GetDict(incoming,"pendingWinCredit").Count==0 &&
                    GetLong(current,"spins",0)==GetLong(incoming,"spins",0) &&
                    RuntimeProcessedBillIds(current).SetEquals(RuntimeProcessedBillIds(incoming));
                if(!valid)
                {
                    try{WriteAudit("RUNTIME_REJECT","WIN_SETTLEMENT_NOT_PENDING_OR_ALREADY_PAID");}catch{}
                    return false;
                }
            }
'@
$s=$s.Substring(0,$writeAt)+$gate+[Environment]::NewLine+$s.Substring($writeAt)
Set-Content -LiteralPath $server -Value $s -Encoding UTF8
Write-Host "AREA2_LAB_CANDIDATE_APPLIED: pre-counted handpay id matches authorized pending transaction"
