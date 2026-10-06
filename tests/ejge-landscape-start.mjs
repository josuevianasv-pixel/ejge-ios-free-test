import fs from 'node:fs';
import { webkit, devices } from 'playwright';

const base=process.env.EJGE_TEST_URL||'https://goalmania-d1-engine-test.josuevianasv.workers.dev/login';
const username=process.env.EJGE_USERNAME||'';
const password=process.env.EJGE_PASSWORD||'';
const outDir='artifacts/ejge-landscape-start';
fs.mkdirSync(outDir,{recursive:true});
if(!username||!password){ console.error('Missing secrets'); process.exit(2); }
const games=['GOALMANIA','MULTIBINGO','TRIPLEBONUS','BURNINGHOT'];
const iphone=devices['iPhone 13'];
const browser=await webkit.launch({headless:true});
const report={results:{},startedAt:new Date().toISOString()};

async function login(page){
  return await page.evaluate(async ({username,password})=>{
    const r=await fetch('/player/api/login',{
      method:'POST',credentials:'include',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({username,password,forceTakeover:true})
    });
    let data={}; try{data=await r.json();}catch{}
    return {ok:r.ok,status:r.status,data};
  },{username,password});
}
async function launch(page,game){
  return await page.evaluate(async game=>{
    const r=await fetch('/player/api/launch-game',{
      method:'POST',credentials:'include',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({game})
    });
    let data={}; try{data=await r.json();}catch{}
    return {ok:r.ok,status:r.status,data};
  },game);
}
try{
  for(const game of games){
    const context=await browser.newContext({
      ...iphone,
      viewport:{width:844,height:390},
      screen:{width:844,height:390}
    });
    const page=await context.newPage();
    const errors=[]; const consoleErrors=[];
    page.on('pageerror',e=>errors.push(String(e?.stack||e)));
    page.on('console',m=>{if(m.type()==='error') consoleErrors.push(m.text())});

    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
    const l=await login(page);
    if(!l.ok){
      report.results[game]={ok:false,stage:'login',status:l.status,error:l.data?.error||null};
      await context.close(); continue;
    }
    const x=await launch(page,game);
    if(!x.ok||!x.data?.url){
      report.results[game]={ok:false,stage:'launch',status:x.status,error:x.data?.error||null};
      await context.close(); continue;
    }
    await page.goto(x.data.url,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForTimeout(12000);
    await page.evaluate(()=>{window.dispatchEvent(new Event('orientationchange'));window.dispatchEvent(new Event('resize'));});
    await page.waitForTimeout(2500);

    const samples=[];
    for(let i=0;i<20;i++){
      samples.push(await page.evaluate(()=>({
        iw:innerWidth,ih:innerHeight,dpr:devicePixelRatio,
        vvw:visualViewport?.width??null,vvh:visualViewport?.height??null,
        sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,
        orientation:screen.orientation?.type||null,
        canvas:[...document.querySelectorAll('canvas')].map(c=>({
          w:c.width,h:c.height,cw:c.getBoundingClientRect().width,ch:c.getBoundingClientRect().height
        })).slice(0,5)
      })));
      await page.waitForTimeout(250);
    }
    const d=(key)=>{const v=samples.map(s=>s[key]).filter(Number.isFinite);return v.length?Math.max(...v)-Math.min(...v):0};
    const stab={iw:d('iw'),ih:d('ih'),vvw:d('vvw'),vvh:d('vvh')};
    await page.screenshot({path:outDir+'/'+game.toLowerCase()+'.png',fullPage:true});
    report.results[game]={
      ok:Math.max(...Object.values(stab))<=3 && errors.length===0,
      launchStatus:x.status,
      url:new URL(x.data.url).pathname,
      stability:stab,
      final:samples.at(-1),
      pageErrors:errors,
      consoleErrors
    };
    await context.close();
  }
  report.finishedAt=new Date().toISOString();
  report.ok=games.every(g=>report.results[g]?.ok);
  fs.writeFileSync(outDir+'/report.json',JSON.stringify(report,null,2));
  console.log('LANDSCAPE-START',report.ok?'PASS':'FAIL');
  for(const g of games){
    const r=report.results[g];
    console.log(g,JSON.stringify({
      ok:r?.ok,stability:r?.stability,pageErrors:r?.pageErrors?.length,
      consoleErrors:r?.consoleErrors?.length,orientation:r?.final?.orientation,
      viewport:r?.final?[r.final.iw,r.final.ih]:null
    }));
  }
  if(!report.ok) process.exitCode=1;
}catch(e){
  report.error=String(e?.stack||e);
  fs.writeFileSync(outDir+'/report.json',JSON.stringify(report,null,2));
  console.error(report.error);process.exitCode=1;
}finally{await browser.close();}
