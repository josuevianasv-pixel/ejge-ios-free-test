import fs from 'node:fs';
import { webkit, devices } from 'playwright';

const base = process.env.EJGE_TEST_URL || 'https://goalmania-d1-engine-test.josuevianasv.workers.dev/login';
const username = process.env.EJGE_USERNAME || '';
const password = process.env.EJGE_PASSWORD || '';
const outDir = 'artifacts/ejge-auth-all-games';
fs.mkdirSync(outDir,{recursive:true});

if(!username || !password){
  console.error('Missing EJGE_USERNAME/EJGE_PASSWORD Actions secrets.');
  process.exit(2);
}

const origin = new URL(base).origin;
const games=['GOALMANIA','MULTIBINGO','TRIPLEBONUS','BURNINGHOT'];
const report={startedAt:new Date().toISOString(),origin,results:{},login:null};

function delta(rows,key){
  const vals=rows.map(r=>r[key]).filter(Number.isFinite);
  return vals.length ? Math.max(...vals)-Math.min(...vals) : 0;
}

async function sample(page,ms=5000,step=250){
  const rows=[];
  const until=Date.now()+ms;
  while(Date.now()<until){
    rows.push(await page.evaluate(()=>({
      t:Date.now(),
      href:location.href,
      iw:innerWidth, ih:innerHeight,
      dpr:devicePixelRatio,
      vvw:visualViewport?.width ?? null,
      vvh:visualViewport?.height ?? null,
      cw:document.documentElement.clientWidth,
      ch:document.documentElement.clientHeight,
      sw:document.documentElement.scrollWidth,
      sh:document.documentElement.scrollHeight,
      bodyW:document.body?.scrollWidth ?? null,
      bodyH:document.body?.scrollHeight ?? null,
      canvases:[...document.querySelectorAll('canvas')].map(c=>({
        width:c.width,height:c.height,
        cssW:c.getBoundingClientRect().width,
        cssH:c.getBoundingClientRect().height
      })).slice(0,10)
    })));
    await page.waitForTimeout(step);
  }
  return rows;
}

function stability(rows){
  return {
    iw:delta(rows,'iw'),
    ih:delta(rows,'ih'),
    vvw:delta(rows,'vvw'),
    vvh:delta(rows,'vvh')
  };
}

async function launch(page,game){
  return await page.evaluate(async ({game})=>{
    const r=await fetch('/player/api/launch-game',{
      method:'POST',
      credentials:'include',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({game})
    });
    let data={};
    try{data=await r.json();}catch{}
    return {status:r.status,ok:r.ok,data};
  },{game});
}

const browser=await webkit.launch({headless:true});
try{
  const iphone=devices['iPhone 13'];
  const context=await browser.newContext({...iphone});
  const page=await context.newPage();

  const loginErrors=[];
  page.on('pageerror',e=>loginErrors.push(String(e?.stack||e)));

  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});

  const login=await page.evaluate(async ({username,password})=>{
    const r=await fetch('/player/api/login',{
      method:'POST',
      credentials:'include',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({username,password,forceTakeover:true})
    });
    let data={};
    try{data=await r.json();}catch{}
    return {status:r.status,ok:r.ok,data};
  },{username,password});

  report.login={status:login.status,ok:login.ok,usernameReturned:login.data?.username||null,pageErrors:loginErrors};
  if(!login.ok) throw new Error('Login failed HTTP '+login.status+': '+(login.data?.error||'unknown'));

  const wallet=await page.evaluate(async ()=>{
    const r=await fetch('/player/api/multigame-status',{credentials:'include'});
    let data={};
    try{data=await r.json();}catch{}
    return {status:r.status,ok:r.ok,data};
  });
  report.wallet={status:wallet.status,ok:wallet.ok,linked:wallet.data?.wallet?.linked??null,migrated:wallet.data?.wallet?.migrated??null};
  if(!wallet.ok) throw new Error('Wallet status failed HTTP '+wallet.status);

  for(const game of games){
    const errors=[];
    const consoleErrors=[];
    const handler=e=>errors.push(String(e?.stack||e));
    const cHandler=m=>{ if(m.type()==='error') consoleErrors.push(m.text()); };
    page.on('pageerror',handler);
    page.on('console',cHandler);

    const l=await launch(page,game);
    const entry={launchStatus:l.status,launchOk:l.ok,launchError:l.data?.error||null};
    if(!l.ok || !l.data?.url){
      entry.ok=false;
      report.results[game]=entry;
      page.off('pageerror',handler);
      page.off('console',cHandler);
      continue;
    }

    entry.launchUrl=new URL(l.data.url).pathname;
    await page.goto(l.data.url,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForTimeout(5000);

    const portraitRows=await sample(page,5000);
    entry.portrait=stability(portraitRows);
    entry.portraitFinal=portraitRows.at(-1);
    await page.screenshot({path:outDir+'/'+game.toLowerCase()+'-portrait.png',fullPage:true}).catch(()=>{});

    await page.setViewportSize({width:844,height:390});
    await page.waitForTimeout(1200);
    const landscapeRows=await sample(page,5000);
    entry.landscape=stability(landscapeRows);
    entry.landscapeFinal=landscapeRows.at(-1);
    await page.screenshot({path:outDir+'/'+game.toLowerCase()+'-landscape.png',fullPage:true}).catch(()=>{});

    entry.pageErrors=errors;
    entry.consoleErrors=consoleErrors;
    entry.ok=
      Math.max(...Object.values(entry.portrait))<=3 &&
      Math.max(...Object.values(entry.landscape))<=3 &&
      errors.length===0;

    report.results[game]=entry;

    page.off('pageerror',handler);
    page.off('console',cHandler);

    await page.setViewportSize({width:390,height:664});
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(700);
  }

  report.finishedAt=new Date().toISOString();
  report.ok=games.every(g=>report.results[g]?.ok===true);
  fs.writeFileSync(outDir+'/report.json',JSON.stringify(report,null,2));

  console.log('EJGE AUTH ALL-GAMES RESULT:',report.ok?'PASS':'FAIL');
  for(const game of games){
    const r=report.results[game]||{};
    console.log(game,JSON.stringify({
      launchStatus:r.launchStatus,
      ok:r.ok,
      portrait:r.portrait,
      landscape:r.landscape,
      pageErrors:(r.pageErrors||[]).length,
      consoleErrors:(r.consoleErrors||[]).length,
      launchError:r.launchError
    }));
  }

  if(!report.ok) process.exitCode=1;
}catch(err){
  report.ok=false;
  report.error=String(err?.stack||err);
  report.finishedAt=new Date().toISOString();
  fs.writeFileSync(outDir+'/report.json',JSON.stringify(report,null,2));
  console.error(report.error);
  process.exitCode=1;
}finally{
  await browser.close();
}
