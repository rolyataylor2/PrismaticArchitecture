import { chromium } from '@playwright/test';
import fs from 'node:fs';
const root='workspace/gauntlet/2026-10-07';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3011');
 fs.writeFileSync(root+'/inspector-final-initial.txt',await page.locator('body').innerText());
 await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
 const button=page.getByRole('button',{name:'Inspect cognitive steps'}).last();
 if(await button.count()) { await button.click(); await page.getByText('Experienced WorldState',{exact:true}).waitFor(); }
 fs.writeFileSync(root+'/inspector-final-cycle.txt',await page.locator('body').innerText());
 await page.screenshot({path:root+'/reports/inspector-final-cycle.png',fullPage:true});
 fs.appendFileSync(root+'/inspector-observations.jsonl',JSON.stringify({timestamp:new Date().toISOString(),role:'observer',url:page.url(),errors,cycleInspectorOpened:await page.getByText('Experienced WorldState',{exact:true}).count()>0,textReference:'inspector-final-cycle.txt',screenshot:'reports/inspector-final-cycle.png'})+'\n');
 console.log('Inspector captured',errors);
} finally {await browser.close();}
