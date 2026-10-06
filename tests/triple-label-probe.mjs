import { webkit, devices } from 'playwright';

const base=process.env.EJGE_TEST_URL;
const username=process.env.EJGE_USERNAME||'';
const password=process.env.EJGE_PASSWORD||'';
const browser=await webkit.launch({headless:true});
try{
  const context=await browser.newContext({...devices['iPhone 13'],viewport:{width:844,height:390},screen:{width:844,height:390}});
  const page=await context.newPage();
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  const login=await page.evaluate(async ({username,password})=>{
    const r=await fetch('/player/api/login',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({username,password,forceTakeover:true})});
    return {ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))};
  },{username,password});
  if(!login.ok) throw new Error('login failed '+login.status);

  const launch=await page.evaluate(async ()=>{
    const r=await fetch('/player/api/launch-game',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({game:'TRIPLEBONUS'})});
    return {ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))};
  });
  if(!launch.ok||!launch.data?.url) throw new Error('launch failed '+launch.status);

  await page.goto(launch.data.url,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(8000);

  const result=await page.evaluate(()=>{
    const all=[...document.querySelectorAll('*')];
    const matches=all.filter(el=>{
      const own=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent||'').join(' ').trim();
      const txt=(own||el.textContent||'').replace(/\s+/g,' ').trim();
      return /EJGE.*Triple Bonus.*Cloudflare|Triple Bonus.*Cloudflare|Cloudflare.*V1\.3\.3/i.test(txt);
    }).slice(0,20).map(el=>({
      tag:el.tagName,
      id:el.id,
      className:typeof el.className==='string'?el.className:'',
      text:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,300),
      outerHTML:el.outerHTML.slice(0,1200),
      style:el.getAttribute('style')||'',
      rect:(()=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()
    }));
    return {
      title:document.title,
      bodyText:(document.body?.innerText||'').slice(0,1200),
      matches,
      bodyChildren:[...document.body.children].slice(0,20).map(el=>({tag:el.tagName,id:el.id,className:typeof el.className==='string'?el.className:'',text:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,160)}))
    };
  });
  console.log('TRIPLE_PROBE='+JSON.stringify(result));
} finally { await browser.close(); }
