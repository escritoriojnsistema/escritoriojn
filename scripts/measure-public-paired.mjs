import {chromium} from '@playwright/test';
import fs from 'node:fs';
const output=process.argv[2]??'/tmp/jn-public-paired.json';
const width=Number(process.env.JN_COLD_WIDTH??1440),height=Number(process.env.JN_COLD_HEIGHT??900);
const download=Number(process.env.JN_COLD_DOWNLOAD_BPS??0),latency=Number(process.env.JN_COLD_LATENCY_MS??0);
const runs=[];
for(let pair=0;pair<12;pair++)for(const variant of pair%2===0?['before','after']:['after','before']){
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
 await context.addInitScript(()=>{
  window.__jnPerf={longtasks:[],headingAt:null,lcp:[]};
  new PerformanceObserver(list=>window.__jnPerf.longtasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
  new PerformanceObserver(list=>window.__jnPerf.lcp.push(...list.getEntries().map(e=>({start:e.startTime,renderTime:e.renderTime,loadTime:e.loadTime,size:e.size,url:e.url})))).observe({type:'largest-contentful-paint',buffered:true});
  new MutationObserver(()=>{if(window.__jnPerf.headingAt===null&&document.querySelector('h1'))window.__jnPerf.headingAt=performance.now();}).observe(document,{subtree:true,childList:true});
 });
 const page=await context.newPage();await page.bringToFront();const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.clearBrowserCache');if(download>0)await cdp.send('Network.emulateNetworkConditions',{offline:false,latency,downloadThroughput:download,uploadThroughput:download,connectionType:'cellular4g'});
 await page.goto(`http://127.0.0.1:${variant==='before'?4189:4190}/`,{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Bem-vindo ao Escritório JN'}).waitFor();await page.waitForFunction(()=>performance.getEntriesByName('first-contentful-paint').length>0);
 const data=await page.evaluate(()=>({fcp:performance.getEntriesByName('first-contentful-paint')[0].startTime,fp:performance.getEntriesByName('first-paint')[0]?.startTime,navigation:performance.getEntriesByType('navigation')[0].toJSON(),requests:performance.getEntriesByType('resource').length,bytes:performance.getEntriesByType('resource').reduce((s,e)=>s+e.transferSize,0),resources:performance.getEntriesByType('resource').map(e=>({name:new URL(e.name).pathname,type:e.initiatorType,start:e.startTime,end:e.responseEnd,duration:e.duration,bytes:e.transferSize})),...window.__jnPerf}));
 runs.push({pair,variant,...data});console.log(pair,variant,data.fcp,data.bytes);
 }finally{await browser.close();}
 fs.writeFileSync(output,JSON.stringify({date:new Date().toISOString(),viewport:{width,height},network:{download_bytes_per_second:download||null,latency_ms:latency},method:'12 alternating pairs, AB/BA order, new browser+context each run, cache disabled+cleared, same Node server process on two ports, no compression; optional controlled network profile recorded separately; local static production builds, viewport recorded separately',runs},null,2));
}
for(const variant of ['before','after']){const x=runs.filter(r=>r.variant===variant).map(r=>r.fcp).sort((a,b)=>a-b);console.log(variant,{median:(x[5]+x[6])/2,min:x[0],max:x[11]});}
