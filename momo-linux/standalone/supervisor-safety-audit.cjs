#!/usr/bin/env node
/* MME5 supervisor safety audit. Source stays private. No state writes. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
function audit(files){
 const s=files.span, l=files.launcher, c=files.cleanup, server=files.server;
 const checks=[
  {
   id:'KIOSK_CLEANUP_KILLS_PROCESSES',
   severity:'HIGH',
   found: /Stop-Process\s+-Id\s+\$id\s+-Force/i.test(c) && /server-local\.ps1/i.test(c),
   why:'Startup cleaner can force-stop server-local.ps1 without a documented monetary drain handshake'
  },
  {
   id:'SUPERVISOR_CLEANUP_CALLED_ON_RELAUNCH',
   severity:'HIGH',
   found: /CERRAR-JUEGOS-ANTERIORES\.ps1/i.test(l) && /Start-Span-NoConsole/i.test(l),
   why:'Kiosk launcher invokes prior-game cleanup before every new span startup'
  },
  {
   id:'SPAN_CLOSE_FORCE_STOPS_SERVER',
   severity:'HIGH',
   found: /\/__local\/stop/i.test(s)&&/Start-Sleep\s+-Milliseconds\s+250[\s\S]{0,200}Stop-Process\s+-Id\s+\$server\.Id\s+-Force/i.test(s),
   why:'Browser close can initiate server shutdown then force termination after 250 ms'
  },
  {
   id:'BROWSER_DISAPPEARANCE_THREE_SECONDS',
   severity:'MEDIUM',
   found: /\$missingSince[\s\S]{0,350}\.TotalSeconds\s+-ge\s+3/.test(s),
   why:'Transient Edge process disappearance can end span supervision after only three seconds'
  },
  {
   id:'SERVER_STOP_ENDPOINT_NO_DRAIN',
   severity:'HIGH',
   found: /if\s*\(\s*path\s*==\s*"\/__local\/stop"\s*\)[\s\S]{0,260}Task\.Delay\(100\)[\s\S]{0,100}Stop\(\)/.test(server),
   why:'Stop endpoint stops server after 100 ms without proving that monetary work is complete'
  },
  {
   id:'SERVER_LOGS_RESET_ON_START',
   severity:'MEDIUM',
   found: /Remove-Item\s+\$stdout,\$stderr\s+-Force/i.test(s),
   why:'Server output and error files are deleted at startup, reducing historical fault evidence'
  }
 ];
 const protectedWatchdog=/if\s*\(\s*\$server\s+-and\s+-not\s+\$server\.HasExited\s*\)/.test(s) &&
 /NO reiniciarlo|NO\s+reiniciar/i.test(s);
 const durableReceipt=/EnsureBillAccountingReceipt|cashoutReceiptsDir/.test(server);
 const missing=checks.filter(x=>x.found).map(x=>x.id);
 return {
  auditType:'STATIC_SOURCE_AUDIT_ONLY',
  source:'PRIVATE_GITHUB_RELEASE_TEMPORARY_WINDOWS_RUNNER',
  installedMachineAnalyzed:false,
  productionChangesMade:false,
  findings:checks.map(({id,severity,found,why})=>({id,severity,present:found,why})),
  confirmedHighRiskPatterns:checks.filter(x=>x.found && x.severity==='HIGH').length,
  confirmedMediumRiskPatterns:checks.filter(x=>x.found && x.severity==='MEDIUM').length,
  watchdogAvoidsKillingLiveServer:protectedWatchdog,
  serverHasDurableReceiptLogic:durableReceipt,
  action:'Review supervisor and shutdown contract before deployment; no automatic restart during uncertain monetary transactions',
  status:missing.length?'REVIEW_REQUIRED':'NO_TARGETED_PATTERN_FOUND'
 };
}
function check(cond,msg){if(!cond)throw new Error(msg)}
if(process.argv[2]==='--selftest'){
 const f={
  span:'if($missingSince -and ((Get-Date)-$missingSince).TotalSeconds -ge 3){break}\nRemove-Item $stdout,$stderr -Force\nInvoke-WebRequest -Method POST -Uri "http://127.0.0.1:91/__local/stop"\nStart-Sleep -Milliseconds 250\nif(-not $server.HasExited) { Stop-Process -Id $server.Id -Force }\nif($server -and -not $server.HasExited){ Write-Host "NO reiniciarlo" }',
  launcher:'& "CERRAR-JUEGOS-ANTERIORES.ps1"\nStart-Span-NoConsole',
  cleanup:'server-local.ps1\nStop-Process -Id $id -Force',
  server:'if (path == "/__local/stop") { await Task.Delay(100); Stop(); }\nEnsureBillAccountingReceipt()'
 };
 const r=audit(f);
 check(r.confirmedHighRiskPatterns>=4,'Audit synthetic pattern coverage insufficient');
 check(r.watchdogAvoidsKillingLiveServer,'Positive control missing');
 check(r.serverHasDurableReceiptLogic,'Receipt control missing');
 for(const k of Object.keys(f)){
  const missing=Object.assign({},f);missing[k]='';
  const t=audit(missing);
  check(t.confirmedHighRiskPatterns<r.confirmedHighRiskPatterns || t.confirmedMediumRiskPatterns<r.confirmedMediumRiskPatterns ||
    (k==='span' && !t.watchdogAvoidsKillingLiveServer),'Expected absent pattern not detected: '+k);
 }
 console.log('SUPERVISOR_PUBLIC_SELFTEST_PASS');
 process.exit(0);
}
const root=process.argv[2];
if(!root){console.error('Usage: node supervisor-safety-audit.cjs <private_extracted_root>');process.exit(2)}
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const files={span:read('span.ps1'),launcher:read('PRODUCTION-LAUNCHER.ps1'),
 cleanup:read('CERRAR-JUEGOS-ANTERIORES.ps1'),server:read('server-local.ps1')};
const r=audit(files);
const output=path.join(process.env.RUNNER_TEMP||process.cwd(),'mme5-supervisor-audit.json');
fs.writeFileSync(output,JSON.stringify(r,null,2)+'\n');
console.log('SUPERVISOR_AUDIT_FINISHED: high-risk patterns='+r.confirmedHighRiskPatterns+
 ' medium='+r.confirmedMediumRiskPatterns+' watchdog-safe='+r.watchdogAvoidsKillingLiveServer+
 ' receipt-logic='+r.serverHasDurableReceiptLogic+' status='+r.status);
for(const x of r.findings){if(x.present)console.log('FINDING '+x.severity+' '+x.id)}
if(!r.watchdogAvoidsKillingLiveServer)console.log('FINDING HIGH WATCHDOG_SAFE_CHECK_NOT_DETECTED');
if(!r.serverHasDurableReceiptLogic)console.log('FINDING HIGH RECEIPT_LOGIC_NOT_DETECTED');
process.exit(r.watchdogAvoidsKillingLiveServer && r.serverHasDurableReceiptLogic?0:1);
