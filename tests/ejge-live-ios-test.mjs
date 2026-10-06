// trigger public GitHub Actions runner
import fs from 'node:fs';
import { webkit, devices } from 'playwright';

const base = process.env.EJGE_TEST_URL || 'https://goalmania-d1-engine-test.josuevianasv.workers.dev/login';
const outDir = process.env.EJGE_ARTIFACT_DIR || 'artifacts/ejge-live-ios';
fs.mkdirSync(outDir, { recursive: true });

function withParam(input, key, value) {
  const u = new URL(input);
  u.searchParams.set(key, value);
  u.searchParams.set('_ejge_test', String(Date.now()));
  return u.toString();
}

async function sample(page, ms=3500, step=200) {
  const rows=[];
  const end=Date.now()+ms;
  while(Date.now()<end){
    rows.push(await page.evaluate(() => ({
      t:Date.now(), iw:innerWidth, ih:innerHeight, ow:outerWidth, oh:outerHeight,
      dpr:devicePixelRatio, vvw:visualViewport?.width ?? null, vvh:visualViewport?.height ?? null,
      cw:document.documentElement.clientWidth, ch:document.documentElement.clientHeight,
      sw:document.documentElement.scrollWidth, sh:document.documentElement.scrollHeight,
    })));
    await page.waitForTimeout(step);
  }
  return rows;
}
function delta(rows,key){
  const a=rows.map(r=>r[key]).filter(Number.isFinite);
  return a.length?Math.max(...a)-Math.min(...a):0;
}
function stable(rows,label){
  const d={iw:delta(rows,'iw'),ih:delta(rows,'ih'),vvw:delta(rows,'vvw'),vvh:delta(rows,'vvh')};
  console.log('STABILITY', label, d);
  if(Math.max(...Object.values(d))>3) throw new Error(\`\${label}: viewport oscillation \${JSON.stringify(d)}\`);
  return d;
}

const report={base,startedAt:new Date().toISOString(),tests:{},console:[],pageErrors:[]};
let browser;
try{
  browser=await webkit.launch({headless:true});
  const iphone=devices['iPhone 13'];
  if(!iphone) throw new Error('Playwright iPhone 13 profile missing');
  const context=await browser.newContext({...iphone, ignoreHTTPSErrors:false});
  const page=await context.newPage();
  page.on('console',m=>report.console.push({type:m.type(),text:m.text()}));
  page.on('pageerror',e=>report.pageErrors.push(String(e?.stack||e)));

  const sourceUrl=withParam(base,'sourcecheck','1');
  const sourceResp=await context.request.get(sourceUrl,{headers:{'cache-control':'no-cache'}});
  const html=await sourceResp.text();
  report.tests.deployedSource={status:sourceResp.status(),bytes:html.length,
    hasHomeKey:html.includes('ejge-pwa-home-screen-known-v2'),
    has100svh:html.includes('100svh'),
    has100dvh:html.includes('100dvh'),
    hasSourcePwa:html.includes("searchParams.get('source')==='pwa'")
  };
  if(sourceResp.status()!==200) throw new Error(\`login HTTP \${sourceResp.status()}\`);
  if(!report.tests.deployedSource.hasHomeKey) throw new Error('deployed login is missing home-screen marker');
  if(!report.tests.deployedSource.has100svh) throw new Error('deployed login is missing 100svh fix');
  if(report.tests.deployedSource.has100dvh) throw new Error('deployed login still contains 100dvh');
  if(!report.tests.deployedSource.hasSourcePwa) throw new Error('deployed login is missing source=pwa recognition');

  const origin=new URL(base).origin;
  const manifestResp=await context.request.get(origin+'/ejge/manifest.webmanifest?test='+Date.now());
  const manifestText=await manifestResp.text();
  let manifest=null; try{manifest=JSON.parse(manifestText)}catch{}
  report.tests.manifest={status:manifestResp.status(),manifest};
  if(manifestResp.status()!==200 || !manifest) throw new Error('manifest not available');
  if(!String(manifest.start_url||'').includes('source=pwa')) throw new Error('manifest start_url does not identify PWA launch');
  const swResp=await context.request.get(origin+'/ejge-sw.js?test='+Date.now());
  report.tests.serviceWorker={status:swResp.status(),contentType:swResp.headers()['content-type']||''};
  if(swResp.status()!==200) throw new Error('service worker not available');

  await page.goto(withParam(base,'fresh','1'),{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1300);
  const first=await page.evaluate(()=>({
    exists:!!document.getElementById('ejgePwaInstall'),
    hidden:document.getElementById('ejgePwaInstall')?.hidden ?? null,
    note:document.getElementById('ejgePwaNote')?.textContent ?? '',
    dpr:devicePixelRatio,
    ua:navigator.userAgent,
    htmlMinHeight:getComputedStyle(document.documentElement).minHeight,
    bodyMinHeight:getComputedStyle(document.body).minHeight,
  }));
  report.tests.firstVisit=first;
  if(!first.exists || first.hidden!==false) throw new Error('first iPhone visit did not show install instructions');
  await page.screenshot({path:outDir+'/01-first-visit.png',fullPage:true});
  report.tests.portraitStability=stable(await sample(page),'portrait');

  await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  await page.goto(withParam(base,'source','pwa'),{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1300);
  const pwa=await page.evaluate(()=>({
    marker:localStorage.getItem('ejge-pwa-home-screen-known-v2'),
    hidden:document.getElementById('ejgePwaInstall')?.hidden ?? null,
    dpr:devicePixelRatio,
  }));
  report.tests.pwaLaunch=pwa;
  if(pwa.marker!=='1') throw new Error('PWA launch did not persist marker');
  if(pwa.hidden!==true) throw new Error('PWA launch still shows install prompt');
  await page.screenshot({path:outDir+'/02-pwa-launch.png',fullPage:true});

  await page.goto(withParam(base,'reopen','1'),{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1300);
  const reopen=await page.evaluate(()=>({
    marker:localStorage.getItem('ejge-pwa-home-screen-known-v2'),
    hidden:document.getElementById('ejgePwaInstall')?.hidden ?? null,
  }));
  report.tests.reopen=reopen;
  if(reopen.marker!=='1' || reopen.hidden!==true) throw new Error('known device was prompted again');

  await page.setViewportSize({width:844,height:390});
  await page.waitForTimeout(800);
  report.tests.landscapeStability=stable(await sample(page),'landscape');
  await page.screenshot({path:outDir+'/03-landscape.png',fullPage:true});

  report.tests.pageErrorsCount=report.pageErrors.length;
  report.finishedAt=new Date().toISOString();
  report.ok=true;
  fs.writeFileSync(outDir+'/report.json',JSON.stringify(report,null,2));
  console.log('EJGE LIVE IOS TEST: PASS');
  console.log(JSON.stringify(report.tests,null,2));
}catch(err){
  report.ok=false; report.error=String(err?.stack||err); report.finishedAt=new Date().toISOString();
  fs.writeFileSync(outDir+'/report.json',JSON.stringify(report,null,2));
  console.error('EJGE LIVE IOS TEST: FAIL');
  console.error(report.error);
  process.exitCode=1;
}finally{
  if(browser) await browser.close();
}