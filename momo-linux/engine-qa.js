#!/usr/bin/env node
'use strict';
// Prueba motor original extraido del paquete proporcionado por el usuario.
// SOLO credito ficticio en memoria. No usar en produccion ni dinero real.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'momo-extracted/app/www');
const report=path.resolve(process.argv[3]||'momo-results/engine.json');
const spins=Math.max(1,Math.min(Number(process.env.MOMO_SPINS)||1000,50000));
const store=new Map();
global.window=global;global.top=global;global.location={origin:'http://localhost',search:'?mmSeed=MOMO-LINUX-R2'};
global.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
global.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true})});
const out={name:'MOMO-LINUX-ENGINE-R2',os:process.platform,spinsRequested:spins,ok:false,mode:'QA_FAKE_BALANCE_NO_REAL_MONEY'};
try {
  for(const filename of ['engine-config.js','engine-local.js'])
    vm.runInThisContext(fs.readFileSync(path.join(root,filename),'utf8'),{filename,timeout:10000});
  const Engine=global.EJGE_MO_ENGINE_API?.Engine;
  assert(Engine,'Original JS engine missing');
  const e=new Engine();e.reset('MOMO-R2-1000-SPINS');e.balance=10000000;
  let base=0,steps=0,a='SPIN',counts={};
  while(base<spins){
    assert(++steps<=spins*70,'BONUS_LOOP_TIMEOUT');
    counts[a]=(counts[a]||0)+1;
    let r;
    switch(a){
      case 'SPIN':base++;r=e.spin({coinSize:0.03});break;
      case 'FREE_SPIN':r=e.freeSpin();break;
      case 'CASH_COLLECT':r=e.cashCollect();break;
      case 'MIGHTY_CASH_SPIN':r=e.mightyCashSpin();break;
      case 'PICK':r=e.pick({pickIndex:steps%15});break;
      default:throw Error('Unexpected next action: '+a);
    }
    a=r?.NextActionInfo?.nextAction;
    assert(typeof a==='string','Engine response missing nextAction');
  }
  const f=new Engine();f.reset('MOMO-R2-FEATURES');f.balance=10000000;
  const trigger={grossWin:0,slotResult:[[3,6,12],[4,5,14],[6,8,8],[1,15,2],[9,4,3]],reelStopIndexes:[1,2,3,4,5]};
  assert(f.startCash(trigger,'BASE').collectedGreenGem.length===2);
  assert(f.cashCollect().NextActionInfo.nextAction==='MIGHTY_CASH_SPIN');
  let c=f.mightyCashSpin(),limit=0;
  while(c.NextActionInfo.nextAction==='MIGHTY_CASH_SPIN'&&limit++<100)c=f.mightyCashSpin();
  assert(limit<100,'Mighty Cash loop');
  assert(f.startFree(trigger,false).freeSpinsRemaining===6);
  assert(f.freeSpin().FreeSpinsInfo);
  f.free=null;f.startJackpot(trigger);
  let p=0,pr;
  do{pr=f.pick({pickIndex:p%15});p++;assert(p<=15,'Jackpot pick loop')}while(pr.NextActionInfo.nextAction==='PICK');
  assert(pr.JackpotPickResultInfo?.jackpotWinInfo);
  Object.assign(out,{ok:true,baseSpins:base,steps,actionCounts:counts,forcedBonuses:{cashCollect:true,mightyCash:true,freeGames:true,jackpotPick:true},nextAction:a});
} catch(err){out.error=String(err?.stack||err)}
fs.mkdirSync(path.dirname(report),{recursive:true});
fs.writeFileSync(report,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
process.exit(out.ok?0:1);
