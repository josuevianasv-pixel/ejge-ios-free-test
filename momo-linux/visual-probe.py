#!/usr/bin/env python3
"""Prueba visual automatica NO monetaria. Registra capturas/errores sin falso PASS."""
import asyncio, json, os, pathlib, subprocess, time, sys
from playwright.async_api import async_playwright
root=pathlib.Path(sys.argv[1]).resolve()
out=pathlib.Path(sys.argv[2]).resolve()
out.mkdir(parents=True,exist_ok=True)
result={'test':'MOMO_R2_VISUAL','ok':False,'requiresCanvas':True,'errors':[],'failedRequests':[],'httpErrors':[]}
server=subprocess.Popen(['node',str(root/'servidor-linux.js')],cwd=root,stdout=(out/'server.log').open('w'),stderr=subprocess.STDOUT,env=dict(os.environ,MME5_PREVIEW_PORT='8891'))
async def test():
 async with async_playwright() as p:
  args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader']
  chrome=next((x for x in ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'] if pathlib.Path(x).exists()),None)
  browser=await p.chromium.launch(executable_path=chrome,headless=True,args=args)
  page=await browser.new_page(viewport={'width':1280,'height':1024},ignore_https_errors=True)
  page.on('pageerror',lambda e:result['errors'].append(str(e)[:400]))
  page.on('requestfailed',lambda r:result['failedRequests'].append(r.url[:250]))
  page.on('response',lambda r:result['httpErrors'].append([r.status,r.url[:200]]) if r.status>=400 else None)
  try:
   await page.goto('http://127.0.0.1:8891/?mmManual=1&mmDisplayMode=single&mmGfx=performance',wait_until='domcontentloaded',timeout=30000)
   await page.wait_for_timeout(12000)
   frames=[]
   for frame in page.frames:
    try:
     state=await frame.evaluate("""() => ({url:location.href, title:document.title,canvas:[...document.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height})),engine:!!window.__EJGE_MO_ENGINE_API})""")
     frames.append(state)
    except Exception as e:frames.append({'error':str(e)[:200]})
   result['frames']=frames
   result['ok']=any(any(c.get('w',0)>300 and c.get('h',0)>180 for c in f.get('canvas',[])) for f in frames)
   if not result['ok']:result['reason']='No visible game-sized canvas detected; screenshot alone is insufficient'
  except Exception as e:
   result['errors'].append(str(e)[:1200])
  finally:
   try:await page.screenshot(path=str(out/'game.png'),full_page=True,timeout=12000)
   except Exception as e:result['errors'].append('screenshot: '+str(e)[:200])
   await browser.close()
try:
 asyncio.run(test())
finally:
 server.terminate()
 try:server.wait(timeout=5)
 except subprocess.TimeoutExpired:server.kill()
 (out/'visual.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(result,indent=2,ensure_ascii=False))
sys.exit(0 if result['ok'] else 1)
