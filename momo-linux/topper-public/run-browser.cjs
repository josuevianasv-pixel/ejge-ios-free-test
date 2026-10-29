'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const { pathToFileURL }=require('node:url');
const { chromium }=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',e=>process.stderr.write('BROWSER_ERROR '+e.message+'\n'));
    await page.goto(pathToFileURL(path.join(__dirname,'topper-smoke.html')).href,{waitUntil:'load'});
    await page.waitForFunction(()=>Boolean(window.__topperLabResult),null,{timeout:20000});
    const report=await page.evaluate(()=>window.__topperLabResult);
    console.log('TOPPER_SYNTHETIC_TEST',JSON.stringify(report));
    assert.equal(report.pass,true,'Synthetic browser test failed: '+JSON.stringify(report));
    assert.equal(report.fallback,true);
    assert.equal(report.bottomContinued,true);
    console.log('PUBLIC_SYNTHETIC_QA_PASS; ORIGINAL_GAME_NOT_TESTED; INTEL_HD4600_NOT_TESTED');
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
