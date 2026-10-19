#!/usr/bin/env node
// Solo ejecutar contra ZIP de laboratorio confiable y extraido en runner efimero.
// Sin stdout/stderr de tests, datos monetarios ni archivos fuente en artifacts PUBLICOS.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const arg=n=>process.argv.find(x=>x.startsWith('--'+n+'='))?.slice(n.length+3)||((i=>i>=0?process.argv[i+1]:null)(process.argv.indexOf('--'+n)));
const root=path.resolve(arg('root')||'__NO_PRIVATE_SOURCE__');
const suite=arg('suite')||'selected';
const groups={
 bill:['area1-bill-history-safety-selftest.js','area1-virtual-durable-history-selftest.js','r24-billin-durable-failure-selftest.js','r31-bill-ack-reconcile-selftest.js','stability-area-bill-poll-reconnect-selftest.js','stability-qa7-durable-bill-cas-selftest.js','stability-qa8-lost-ack-selftest.js'],
 accounting:['area2-money-safety-contract-selftest.js','qa37-r7-profit-ledger-longrun-selftest.js','qa38-profit-settlement-idempotency-selftest.js','r36-cashout-server-journal-selftest.js','r36-handpay-cashcollect-atomic-selftest.js','r40-money-vault-ready-selftest.js','stability-qa5-cashout-replay-selftest.js','stability-qa6-accounting-conflict-selftest.js'],
 jackpots:['qa36-r6-jackpot-funding-pending-selftest.js'],
 server:['launcher-server-resilience-h65-selftest.js','server-watchdog-h73-selftest.js','stability-qa4-server-contract-selftest.js','stability-qa-20261016-selftest.js','r35-r6-server-local-csharp-scope-selftest.js'],
 kiosk_static:['r20-10-kiosk-persistence-selftest.js']
};
if(!['selected','historical'].includes(suite)){console.error('INVALID_SUITE');process.exit(2)}
const req=['www/engine-local.js','server-local.ps1','tests','config/runtime-integrity.json','CRITICAL_SHA256.txt'];
if(req.some(n=>!fs.existsSync(path.join(root,n)))){console.error('SOURCE_REQUIRED: MME5 source/manifest missing; ZERO tests validated');process.exit(2)}
const sha=b=>createHash('sha256').update(b).digest('hex');
function checkIntegrity(){
 let good=0, bad=0;let reason='';
 const verify=(p,hash,size)=>{const f=path.resolve(root,p.replaceAll('\\','/'));if(!f.startsWith(root+path.sep)){bad++;return;}
  try{const b=fs.readFileSync(f);if(sha(b)===hash.toLowerCase()&&(size===undefined||b.length===size))good++;else bad++}catch{bad++}};
 try{
  const obj=JSON.parse(fs.readFileSync(path.join(root,'config/runtime-integrity.json'),'utf8'));
  if(!Array.isArray(obj.files)||!obj.files.length)throw Error('empty-runtime-manifest');
  for(const f of obj.files){if(typeof f.path!=='string'||typeof f.sha256!=='string'||!/^[a-f\d]{64}$/i.test(f.sha256))throw Error('malformed-runtime-entry');verify(f.path,f.sha256,f.size)}
  const lines=fs.readFileSync(path.join(root,'CRITICAL_SHA256.txt'),'utf8').split(/\r?\n/).filter(x=>x.trim());
  if(!lines.length)throw Error('empty-critical-manifest');
  for(const line of lines){const m=line.match(/^([a-f\d]{64})\s+\*?(.+)$/i);if(!m)throw Error('malformed-critical-entry');verify(m[2].trim(),m[1])}
 }catch(e){bad++;reason=e.message}
 return {checked:good+bad,pass:good,fail:bad,reason};
}
const integrity=checkIntegrity();
console.log('INTEGRITY '+JSON.stringify(integrity));
const dir=path.join(root,'tests');
const items=suite==='historical'
 ?fs.readdirSync(dir).filter(x=>x.endsWith('-selftest.js')).sort().map(name=>({name,group:'historical'}))
 :Object.entries(groups).flatMap(([group,names])=>names.map(name=>({name,group})));
if(!items.length){console.error('NO_TESTS_FOUND');process.exit(2)}
const timeout=Math.max(5000,Math.min(120000,Number(process.env.MME5_QA_TIMEOUT_MS||35000)));
async function execute({name,group}){
 const f=path.join(dir,name);
 if(!fs.existsSync(f))return {name,group,status:'MISSING'};
 return await new Promise(resolve=>{
  const proc=spawn(process.execPath,[f],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true'},windowsHide:true});
  let hitLimit=false,closed=false;
  // Descartar TODA salida privada, incluso los errores. No publicar tokens/logs.
  proc.stdout.on('data',()=>{});proc.stderr.on('data',()=>{});
  const timer=setTimeout(()=>{hitLimit=true;proc.kill('SIGKILL')},timeout);
  const done=(status)=>{if(closed)return;closed=true;clearTimeout(timer);resolve({name,group,status})};
  proc.on('error',()=>done('ERROR'));
  proc.on('close',code=>done(hitLimit?'TIMEOUT':code===0?'PASS':'FAIL'));
 });
}
let cursor=0; const results=new Array(items.length);
async function worker(){while(cursor<items.length){const k=cursor++;results[k]=await execute(items[k]);console.log(results[k].group+' | '+results[k].name+' | '+results[k].status)}}
await Promise.all(Array.from({length:Math.min(2,items.length)},()=>worker()));
const counts=Object.fromEntries(['PASS','FAIL','MISSING','TIMEOUT','ERROR'].map(n=>[n,results.filter(r=>r.status===n).length]));
const verdict=integrity.fail===0&&counts.PASS===items.length;
const summary={scope:suite==='selected'?'22 SELECTED REGRESSIONS':'HISTORICAL EXPLORATORY',total:items.length,counts,integrity,verdict:verdict?'PASS':'FAIL',productionCertified:false};
console.log('SUMMARY '+JSON.stringify(summary));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n### MME5 '+summary.scope+'\n\n- Result: '+summary.verdict+'\n- Tests: '+JSON.stringify(counts)+'\n- Hashes: '+integrity.pass+'/'+integrity.checked+'\n- NO certifica billetero fisico, Windows LTSC, durabilidad 24/7 o dinero real.\n');
if(!verdict)process.exitCode=1;
