import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { createResearchServer } from '../../apps/server/src/server.js';
import { listSimulationRuns } from '../../packages/sdk/src/simulation-tests.js';
const executable=process.env.CHROME_BIN??'/usr/bin/chromium';
test('affect research direction launches a sourced fixture and links categorical evidence to its source cycle', {skip:!existsSync(executable),timeout:60000},async()=>{
  const store=new SqliteStore(':memory:');const app=new Application(store);const source=app.createAgent('Affect experiment source');const server=createResearchServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');const browser=await chromium.launch({executablePath:executable,headless:true});
  try {const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${(server.address()as AddressInfo).port}`);await page.getByRole('button',{name:'Simulation Tests',exact:true}).click();const panel=page.locator('.research-dashboard');
    const options=await panel.getByLabel('Experiment',{exact:true}).locator('option').evaluateAll(v=>v.map(o=>(o as HTMLOptionElement).value));assert.ok(options.includes('affect-instrumental-unpleasant'));assert.ok(options.includes('affect-relational-plurality'));await panel.getByLabel('Experiment',{exact:true}).selectOption('affect-meaningful-retention');
    await panel.getByRole('button',{name:'New simulation run',exact:true}).click();await page.getByRole('dialog').getByLabel('Simulation inference mode').selectOption('fixture');await page.getByRole('dialog').getByRole('button',{name:'Run simulation test',exact:true}).click();await panel.locator('[data-simulation-run]').first().waitFor();
    for(let i=0;i<1000&&listSimulationRuns(app)[0]?.status==='running';i++)await new Promise(r=>setTimeout(r,10));const run=listSimulationRuns(app)[0]!;assert.equal(run.status,'completed');assert.notEqual(run.agentId,source.id);assert.equal(run.measures[0]!.outcome,'inconclusive');await panel.getByRole('button',{name:'Refresh',exact:true}).click();await panel.getByLabel('Run',{exact:true}).selectOption(run.id);
    await panel.getByRole('navigation',{name:'Analytics views'}).getByRole('button',{name:'Affect',exact:true}).click();await panel.getByRole('heading',{name:'Affect & world-blind Self',exact:true}).waitFor();assert.ok((await panel.innerText()).includes('not a numerical intensity scale'));assert.ok(await panel.locator('.rd-affect-stage').count()>0);await panel.getByRole('button',{name:'Inspect affect evidence',exact:true}).first().click();await page.getByRole('dialog').getByRole('button',{name:'Inspect source stage',exact:true}).click();await panel.getByRole('button',{name:'Inspect source cognitive cycle',exact:true}).click();await page.getByText('Experienced WorldState',{exact:true}).waitFor();await page.getByRole('button',{name:'Close inspector',exact:true}).click();assert.deepEqual(errors,[]);
  }finally{await browser.close();server.closeAllConnections();await app.close();await new Promise<void>(r=>server.close(()=>r()));store.close();}
});
