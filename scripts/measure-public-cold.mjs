import {chromium} from '@playwright/test';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
for(let i=0;i<3;i++){
 const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();const session=await context.newCDPSession(page);await session.send('Network.enable');await session.send('Network.setCacheDisabled',{cacheDisabled:true});
 await page.goto(process.argv[2],{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Bem-vindo ao Escritório JN'}).waitFor();
 await page.bringToFront();await page.waitForFunction(()=>performance.getEntriesByName('first-contentful-paint').length>0);
 results.push(await page.evaluate(()=>({fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,requests:performance.getEntriesByType('resource').length,bytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.transferSize,0),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,bytes:r.transferSize}))})));await context.close();
}
await browser.close();fs.writeFileSync(process.argv[3],JSON.stringify({url:process.argv[2],cacheDisabled:true,runs:results},null,2));console.log(results.map(({resources,...rest})=>rest));
