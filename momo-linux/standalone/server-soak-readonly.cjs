#!/usr/bin/env node
'use strict';
// Read-only server test on GitHub ephemeral Windows runner. No money operations.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn,spawnSync}=require('node:child_process');
const root=process.argv[2];
if(!root||!fs.existsSync(path.join(root,'server-local.ps1'))){console.error('SOURCE_REQUIRED');process.exit(2)}
const port=18994,base='http://127.0.0.1:'+port;
const agent=new http.Agent({keepAlive:true,maxSockets:48});
const file=path.join(root,'server-local.ps1');
const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
const resultFile=path.join(process.env.RUNNER_TEMP||process.cwd(),'mme5-server-soak-summary.json');
let server,exited=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function req(endpoint,timeout=3500,abortEarly=false){
 return new Promise(resolve=>{
  const t0=Date.now();let done=false;
  const finish=v=>{if(!done){done=true;resolve(v)}};
  const r=http.request(base+endpoint,{method:'GET',agent,headers:{'Cache-Control':'no-store'}},res=>{
   let body='',overflow=false;
   res.setEncoding('utf8');
   res.on('data',chunk=>{body+=chunk;if(body.length>100000){overflow=true;r.destroy()}});
   res.on('end',()=>{let data=null;try{data=JSON.parse(body)}catch{}
    finish({http:res.statusCode,ms:Date.now()-t0,data,error:overflow?'RESPONSE_TOO_BIG':null})});
   res.on('error',err=>finish({error:err.code||'RESPONSE_ERROR',ms:Date.now()-t0}));
  });
  r.setTimeout(timeout,()=>r.destroy(new Error('TIMEOUT')));
  r.on('error',err=>finish({error:err.message==='TIMEOUT'?'TIMEOUT':err.code||'HTTP_ERROR',ms:Date.now()-t0}));
  r.end();
  if(abortEarly)setTimeout(()=>r.destroy(),2);
 });
}
function mem(pid){
 const cmd='(Get-Process -Id '+Number(pid)+' -ErrorAction SilentlyContinue).WorkingSet64';
 const p=spawnSync(exe,['-NoProfile','-NonInteractive','-Command',cmd],{encoding:'utf8',timeout:10000});
 const x=Number((p.stdout||'').trim());return Number.isFinite(x)&&x>0?Math.round(x/1048576):null;
}
function check(x,s){if(!x)throw new Error(s)}
async function ready(maxMs=100000){
 const started=Date.now();
 while(Date.now()-started<maxMs){
  if(exited)throw new Error('SERVER_EARLY_EXIT');
  const r=await req('/__local/liveness',1800);
  if(r.http===200&&r.data?.ok===true&&r.data?.status==='ALIVE')return;
  await sleep(750);
 }
 throw new Error('SERVER_START_TIMEOUT');
}
async function burst(count,parallelism,paths){
 let cursor=0;const all=[];
 const worker=async()=>{while(true){const i=cursor++;if(i>=count)return;
  const endpoint=paths[i%paths.length];const r=await req(endpoint,4000);all.push({endpoint,...r});
 }};
 await Promise.all(Array.from({length:parallelism},worker));return all;
}
function summarize(rows){
 const statuses={};let networkErrors=0,jsonFailures=0,unexpected=0,maxMs=0;
 const waits=[];
 for(const r of rows){const key=String(r.http||r.error||'UNKNOWN');statuses[key]=(statuses[key]||0)+1;
  if(r.error)networkErrors++;
  else if(!r.data||typeof r.data.ok!=='boolean')jsonFailures++;
  else if(![200,503].includes(r.http))unexpected++;
  waits.push(r.ms);maxMs=Math.max(maxMs,r.ms);
 }
 waits.sort((a,b)=>a-b);
 return {count:rows.length,statuses,networkErrors,jsonFailures,unexpected,maxMs,p95Ms:waits[Math.floor(waits.length*0.95)]||0};
}
(async()=>{
 const report={environment:'ephemeral Windows Server 2022 runner',source:'private release',scope:'read-only HTTP, no wagers/payments',approvedForProduction:false,started:false,completed:false,tests:[],error:null};
 try{
  server=spawn(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,'-RootDir',root,'-Port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
  server.on('exit',()=>{exited=true});
  server.stdout.on('data',()=>{});server.stderr.on('data',()=>{});
  await ready();report.started=true;report.pid=server.pid;report.workingSetStartMiB=mem(server.pid);
  const endpoints=['/__local/liveness','/__local/health','/__local/queue-status','/__local/monetary-readiness'];
  for(const endpoint of endpoints){const r=await req(endpoint);
   check(r.http===200&&r.data?.ok===true,'BASELINE_'+endpoint.replaceAll('/','_')+'_FAILED_'+String(r.http||r.error));
   report.tests.push({name:'baseline_'+endpoint,pass:true});
  }
  const normal=await burst(1500,24,endpoints),summary=summarize(normal);
  report.mixedReadOnly1500=summary;
  check(summary.networkErrors===0,'LOAD_NETWORK_FAILURE');
  check(summary.jsonFailures===0,'LOAD_INVALID_JSON');
  check(summary.unexpected===0,'LOAD_BAD_HTTP_STATUS');
  report.tests.push({name:'1500_mixed_GET_at_24_clients',pass:true});
  let aborted=0;
  for(let i=0;i<50;i++){const r=await req('/__local/health',500,true);if(r.error)aborted++}
  report.injectedAbortedReads=50;report.observedClientAborts=aborted;
  await sleep(800);
  for(const endpoint of endpoints){const r=await req(endpoint,4000);
   check(r.http===200&&r.data?.ok===true,'POST_ABORT_RECOVERY_FAIL_'+endpoint+'_'+String(r.http||r.error));
  }
  report.tests.push({name:'recover_after_50_client_side_disconnections',pass:true});
  const alive=await req('/__local/liveness',4000),q=await req('/__local/queue-status',4000);
  check(alive.http===200&&q.http===200,'FINAL_SERVER_UNHEALTHY');
  check(alive.data.activeRequests<=32,'UNBOUNDED_HANDLER_COUNT');
  check(q.data.stalledRequests===0,'STALLED_REQUESTS_REMAIN');
  report.queueAfter={activeRequests:q.data.activeRequests,rejectedRequests:q.data.rejectedRequests,oldestRequestMs:q.data.oldestRequestMs,stalledRequests:q.data.stalledRequests};
  report.tests.push({name:'queue_drained_without_stalled_handlers',pass:true});
  report.workingSetEndMiB=mem(server.pid);
  report.workingSetDeltaMiB=report.workingSetStartMiB===null||report.workingSetEndMiB===null?null:report.workingSetEndMiB-report.workingSetStartMiB;
  check(!exited,'SERVER_EXITED_DURING_QA');
  report.completed=true;
  console.log('MME5_SERVER_SOAK_PASS: 1500 read-only requests, 50 aborted clients, recovery and health OK');
 }catch(e){report.error=String(e.message).slice(0,150);console.error('MME5_SERVER_SOAK_FAIL:',report.error)}
 finally{
  report.serverExitedBeforeCleanup=exited;
  fs.writeFileSync(resultFile,JSON.stringify(report,null,2)+'\n');
  if(server&&!exited){try{server.kill()}catch{}}
  agent.destroy();
  console.log('SANITIZED_REPORT='+resultFile);
 }
 process.exit(report.completed?0:1);
})();