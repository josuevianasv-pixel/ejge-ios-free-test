'use strict';
// PUBLIC synthetic benchmark: no MME5 game assets/code, no money or licenses.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

const sourceFile=path.join(__dirname,'topper-smoke.html');
const fixture=fs.readFileSync(sourceFile,'utf8');
const oldLine='timer=setInterval(()=>{if(!state.fallback)state.maintenanceChecks++;},250);';
assert.equal(fixture.split(oldLine).length,2,'Source synthetic fixture has changed unexpectedly');
const legacyLine=oldLine.replace('},250);','},17);');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mme5-topper-benchmark-'));
const legacyPath=path.join(temp,'legacy.html');
const candidatePath=path.join(temp,'candidate.html');
fs.writeFileSync(legacyPath,fixture.replace(oldLine,legacyLine));
fs.writeFileSync(candidatePath,fixture);

function median(arr){
  const xs=arr.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!xs.length)return null;
  const mid=xs.length>>1;
  return xs.length%2 ? xs[mid]:(xs[mid-1]+xs[mid])/2;
}
function round(x,digits=2){return x===null ? null:Number(x.toFixed(digits))}
function metric(metrics,name){return metrics.find(x=>x.name===name)?.value ?? null}

async function main(){
  const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const samples=[];
  const order=['legacy','candidate','candidate','legacy','candidate','legacy','legacy','candidate'];
  try{
    for(const variant of order){
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      const page=await context.newPage();
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const session=await context.newCDPSession(page);
      await session.send('Performance.enable');
      const first=(await session.send('Performance.getMetrics')).metrics;
      const file=variant==='legacy'?legacyPath:candidatePath;
      await page.goto(pathToFileURL(file).href,{waitUntil:'load'});
      await page.waitForFunction(()=>!!window.__topperLabResult,null,{timeout:25000});
      const data=await page.evaluate(()=>window.__topperLabResult);
      const last=(await session.send('Performance.getMetrics')).metrics;
      const taskStart=metric(first,'TaskDuration'),taskEnd=metric(last,'TaskDuration');
      const taskMs=taskStart!==null&&taskEnd!==null?(taskEnd-taskStart)*1000:null;
      const elapsedSec=data.elapsedMs/1000;
      const result={
        variant,pass:data.videoReady===true&&data.bottomContinued===true&&data.fallback===true&&data.maintenanceChecks>=2&&errors.length===0,
        elapsedMs:data.elapsedMs,
        lowerFps:round(data.bottomFrames/elapsedSec),
        topperVideoFps:round(data.upperFrames/elapsedSec),
        maintenancePerSec:round(data.maintenanceChecks/elapsedSec),
        maintenanceChecks:data.maintenanceChecks,
        mainThreadTaskMsPerSec:taskMs===null?null:round(taskMs/elapsedSec),
        videoReady:data.videoReady===true,
        fallback:data.fallback===true,
        lowerContinued:data.bottomContinued===true,
        browserErrors:errors
      };
      console.log('TOPPER_BENCH_SAMPLE',JSON.stringify(result));
      samples.push(result);
      await context.close();
    }
  }finally{
    await browser.close();
    fs.rmSync(temp,{recursive:true,force:true});
  }
  const summary={};
  for(const variant of ['legacy','candidate']){
    const group=samples.filter(x=>x.variant===variant);
    summary[variant]={
      runs:group.length,passed:group.every(x=>x.pass),
      lowerFps:round(median(group.map(x=>x.lowerFps))),
      topperVideoFps:round(median(group.map(x=>x.topperVideoFps))),
      maintenancePerSec:round(median(group.map(x=>x.maintenancePerSec))),
      mainThreadTaskMsPerSec:round(median(group.map(x=>x.mainThreadTaskMsPerSec)))
    };
  }
  const a=summary.legacy,b=summary.candidate;
  const improvement=(before,after)=>before>0?round((before-after)*100/before):null;
  const changes={
    maintenanceReductionPct:improvement(a.maintenancePerSec,b.maintenancePerSec),
    mainThreadTaskReductionPct:improvement(a.mainThreadTaskMsPerSec,b.mainThreadTaskMsPerSec),
    lowerFpsChangePct:a.lowerFps>0?round((b.lowerFps-a.lowerFps)*100/a.lowerFps):null,
    topperVideoFpsChangePct:a.topperVideoFps>0?round((b.topperVideoFps-a.topperVideoFps)*100/a.topperVideoFps):null
  };
  const report={environment:'GitHub hosted Ubuntu 24.04; single job, single Chromium browser; sequential fresh contexts; graphics SIMULATED',
    method:'4 measurements per variant interleaved; median; legacy maintenance interval 17ms; candidate 250ms; same fixture and captureStream(18)',
    limitations:'Synthetic contract only; not original Mo Mo Mummy, not physical 2-screen, not Windows Edge and not Intel HD 4600; no production or real-money certification',
    samples,summary,changes};
  fs.mkdirSync('reports',{recursive:true});
  fs.writeFileSync('reports/topper-benchmark.json',JSON.stringify(report,null,2));
  const md=[
    '# MME5 Topper — public synthetic A/B on the SAME GitHub runner',
    '',
    'Four samples each; all run inside one workflow job and one Chromium process.',
    '',
    '| Measure (median) | Baseline 17 ms | Optimized 250 ms | Change |',
    '|---|---:|---:|---:|',
    '| Maintenance calls/s | '+a.maintenancePerSec+' | '+b.maintenancePerSec+' | '+changes.maintenanceReductionPct+'% fewer |',
    '| Main-thread task ms/s | '+a.mainThreadTaskMsPerSec+' | '+b.mainThreadTaskMsPerSec+' | '+changes.mainThreadTaskReductionPct+'% fewer (noisy) |',
    '| Lower simulated FPS | '+a.lowerFps+' | '+b.lowerFps+' | '+changes.lowerFpsChangePct+'% |',
    '| Upper simulated video FPS | '+a.topperVideoFps+' | '+b.topperVideoFps+' | '+changes.topperVideoFpsChangePct+'% |',
    '',
    '**All runs passed:** '+(a.passed&&b.passed)+'.',
    '',
    '**IMPORTANT:** This is an A/B of the public synthetic topper fixture, NOT the complete game. It cannot establish FPS improvements on Intel HD 4600, or a real-money production approval. A lower main-thread number is not proof of statistically significant improvement with four samples.'
  ].join('\n');
  fs.writeFileSync('reports/topper-benchmark.md',md);
  console.log('TOPPER_BENCH_SUMMARY',JSON.stringify({summary,changes,allPassed:a.passed&&b.passed}));
  assert.ok(a.passed&&b.passed,'Synthetic A/B failed one or more runs');
  assert.ok(b.maintenancePerSec<a.maintenancePerSec,'Optimized mode should run fewer checks');
}
main().catch(e=>{console.error(e);process.exitCode=1;});