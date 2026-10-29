'use strict';
/*
 * PUBLIC SYNTHETIC TEST ONLY.
 * Compares source-rectangle clipping of Canvas2D fallback with the old
 * whole-source drawImage on the SAME Chromium process and runner.
 * Does NOT run or distribute Mo Mo Mummy.
 */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

function med(values){
  const a=values.slice().sort((x,y)=>x-y);
  return a.length%2?(a[(a.length-1)/2]):(a[a.length/2-1]+a[a.length/2])/2;
}
const rnd=n=>Math.round(n*1000)/1000;
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  let result;
  try {
    const page=await browser.newPage({viewport:{width:1350,height:900}});
    await page.goto('about:blank');
    result=await page.evaluate(()=>{
      // The browser evaluation runs in an isolated JS world: keep helpers here.
      const med=values=>{
        const a=values.slice().sort((x,y)=>x-y);
        return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;
      };
      const rnd=n=>Math.round(n*1000)/1000;
      const SW=2048,SH=1536,W=840,H=525;
      const source=document.createElement('canvas');source.width=SW;source.height=SH;
      const src=source.getContext('2d',{alpha:false});
      src.fillStyle='#242424';src.fillRect(0,0,SW,SH);
      for(let i=0;i<420;i++){
        src.fillStyle='hsl('+((i*29)%360)+',80%,'+(27+i%6*11)+'%)';
        src.fillRect((i*137)%2000,(i*79)%1490,50+i%131,40+i%101);
      }
      src.fillStyle='#ffffff';src.font='64px sans-serif';
      src.fillText('SYNTHETIC PUBLIC RENDER BENCH',80,650);
      const specs=[
        {name:'zoomed-topper',dx:-920,dy:-670,dw:4200,dh:3100},
        {name:'partial-overlap',dx:-200,dy:-180,dw:1250,dh:900},
        {name:'fully-inside',dx:120,dy:75,dw:600,dh:370},
        {name:'simple-fit',dx:0,dy:0,dw:840,dh:525}
      ];
      const output=[];
      for(const spec of specs){
        const make=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;
          const g=c.getContext('2d',{alpha:false});
          g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
          return g;};
        const older=make(),newer=make();
        function draw(ctx,optimized){
          ctx.setTransform(1,0,0,1,0,0);
          ctx.fillStyle='#000000';ctx.fillRect(0,0,W,H);
          const {dx,dy,dw,dh}=spec;
          if(!optimized){ctx.drawImage(source,0,0,SW,SH,dx,dy,dw,dh);return;}
          const x0=Math.max(0,dx),y0=Math.max(0,dy);
          const x1=Math.min(W,dx+dw),y1=Math.min(H,dy+dh);
          if(x1>x0&&y1>y0&&dw>0&&dh>0&&SW>0&&SH>0){
            const sx=(x0-dx)*SW/dw,sy=(y0-dy)*SH/dh;
            const sw=(x1-x0)*SW/dw,sh=(y1-y0)*SH/dh;
            ctx.drawImage(source,sx,sy,sw,sh,x0,y0,x1-x0,y1-y0);
          }
        }
        draw(older,false);draw(newer,true);
        const aa=older.getImageData(0,0,W,H).data;
        const bb=newer.getImageData(0,0,W,H).data;
        let different=0,totalDelta=0,maximum=0;
        for(let j=0;j<aa.length;j++){
          const delta=Math.abs(aa[j]-bb[j]);
          if(delta)different++;
          maximum=Math.max(maximum,delta);totalDelta+=delta;
        }
        const samples={baseline:[],optimized:[]};
        // Paired, alternating order, identical canvases and workload.
        for(let i=0;i<12;i++){
          for(const optimized of (i%2===0?[false,true]:[true,false])){
            const ctx=optimized?newer:older;
            for(let w=0;w<3;w++)draw(ctx,optimized);
            const start=performance.now();
            for(let j=0;j<20;j++)draw(ctx,optimized);
            ctx.getImageData(0,0,1,1); // force a read-back
            samples[optimized?'optimized':'baseline'].push(performance.now()-start);
          }
        }
        const base=med(samples.baseline),opt=med(samples.optimized);
        output.push({
          scenario:spec.name,
          pixelByteMismatch:different,
          comparedPixelBytes:aa.length,
          maximumByteDifference:maximum,
          meanByteDifference:rnd(totalDelta/aa.length),
          baselineMsPer20Draws:rnd(base),
          optimizedMsPer20Draws:rnd(opt),
          renderTimeChangePct:base>0?rnd((opt-base)*100/base):null,
          samplesPerVariant:12
        });
      }
      return output;
    });
  } finally {
    await browser.close();
  }
  const report={
    environment:'Single GitHub Ubuntu runner and single Playwright Chromium process (synthetic Canvas2D)',
    scope:'R2 fallback drawImage source clipping ONLY; the normal captureStream VIDEO_GPU path is unchanged',
    methodology:'4 synthetic camera geometries, 12 paired alternating benchmarks per variant, 20 draws per sample; median times and pixel-byte comparison',
    results:result,
    warning:'Not an MME5 game benchmark, not HD4600, not Windows 10 LTSC, not Edge, not two physical monitors or live-money validation'
  };
  fs.mkdirSync('reports',{recursive:true});
  fs.writeFileSync('reports/topper-render-r2.json',JSON.stringify(report,null,2)+'\n');
  let md='# MME5 Topper R2 — synthetic Canvas2D A/B on the SAME GitHub runner\n\n';
  md+='**Scope:** fallback Canvas2D only; main video capture and game graphics are not tested.\n\n';
  md+='| Geometry | Original ms / 20 draws | R2 ms / 20 draws | R2 time change | Pixel bytes different |\n';
  md+='|---|---:|---:|---:|---:|\n';
  for(const x of result)
    md+='| '+x.scenario+' | '+x.baselineMsPer20Draws+' | '+x.optimizedMsPer20Draws+' | '+x.renderTimeChangePct+'% | '+x.pixelByteMismatch+' / '+x.comparedPixelBytes+' |\n';
  md+='\n**Interpretation:** A negative time change means the candidate was faster. A positive result means slower. Browser headless timings are subject to noise and must not be extrapolated to an Intel HD 4600.\n';
  fs.writeFileSync('reports/topper-render-r2.md',md);
  console.log('TOPPER_RENDER_R2_SUMMARY',JSON.stringify(result));
  assert.equal(result.length,4);
  assert.ok(result.every(x=>x.maximumByteDifference<=1),'Visible pixels changed beyond ±1 byte');
  assert.ok(result.every(x=>x.meanByteDifference<=0.01),'Overall pixel difference too high');
})().catch(err=>{console.error('TOPPER_RENDER_R2_ERROR',err.stack||err);process.exitCode=1;});