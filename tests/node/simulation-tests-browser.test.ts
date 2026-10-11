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
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
const executable=process.env.CHROME_BIN??'/usr/bin/chromium';
test('dashboard launches honest fixtures, assesses saved evidence and preserves infrastructure failure separately', {skip:!existsSync(executable),timeout:90000},async()=>{
  class UnavailableReasoning extends MockReasoning { override async constructed():Promise<never>{throw new Error('Browser fixture provider unavailable');} }
  const store=new SqliteStore(':memory:');const app=new Application(store,{reasoning:new UnavailableReasoning(),decisions:new MockDecisions(),embeddings:new MockEmbeddings()});const source=app.createAgent('Simulation source');
  const server=createResearchServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');const browser=await chromium.launch({executablePath:executable,headless:true});
  try {const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${(server.address()as AddressInfo).port}`);await page.getByRole('button',{name:'Simulator',exact:true}).click();const panel=page.locator('.research-dashboard');await panel.getByLabel('Experiment',{exact:true}).selectOption('prediction-contradiction');
    await panel.getByRole('heading',{name:'No observations yet',exact:true}).waitFor();await panel.getByRole('button',{name:'New simulation run',exact:true}).click();await page.getByRole('dialog').getByLabel('Simulation inference mode').selectOption('fixture');await page.getByRole('dialog').getByRole('button',{name:'Run simulation test',exact:true}).click();
    await panel.locator('[data-simulation-run]').first().waitFor();for(let i=0;i<1000&&listSimulationRuns(app)[0]?.status!=='completed';i++)await new Promise(r=>setTimeout(r,10));assert.equal(listSimulationRuns(app)[0]!.status,'completed');await panel.getByRole('button',{name:'Refresh',exact:true}).click();
    const run=listSimulationRuns(app)[0]!;await panel.getByLabel('Run',{exact:true}).selectOption(run.id);assert.notEqual(run.agentId,source.id);assert.ok((await panel.innerText()).includes('Fixture and mixed-provider evidence'));
    app.simulationEvaluatorProvider=()=>({label:'test/browser-evaluator',author:async schema=>schema.parse({measures:[{criterionId:'criterion-3',outcome:'inconclusive',evidenceReferences:['/stages/0/predictions'],explanation:'No specific prediction in fixture.',counterevidence:'Fixture abstains.',limitations:'Not psychology validation.'}]})});
    await panel.getByRole('button',{name:'Assess saved run',exact:true}).click();await page.getByRole('dialog').getByLabel('Evaluator model').selectOption('gpt-4.1-mini');await page.getByRole('dialog').getByRole('button',{name:'Start model assessment',exact:true}).click();
    for(let i=0;i<1000&&listSimulationRuns(app)[0]!.assessments?.[0]?.status!=='completed';i++)await new Promise(r=>setTimeout(r,10));await panel.getByRole('button',{name:'Refresh',exact:true}).click();await panel.getByRole('navigation',{name:'Analytics views'}).getByRole('button',{name:'Conclusions',exact:true}).click();await panel.getByRole('heading',{name:'test/browser-evaluator · assessment v1',exact:true}).waitFor();assert.equal(listSimulationRuns(app)[0]!.assessments![0]!.evidenceBasis,'fixture');
    await page.reload();await page.getByRole('button',{name:'Simulator',exact:true}).click();await panel.getByLabel('Experiment',{exact:true}).selectOption('prediction-contradiction');await panel.locator('[data-simulation-run]').first().waitFor();assert.equal(listSimulationRuns(app).length,1);
    await panel.getByLabel('Experiment',{exact:true}).selectOption('general-attention');await panel.getByRole('button',{name:'New simulation run',exact:true}).click();await page.getByRole('dialog').getByLabel('Simulation inference mode').selectOption('configured');await page.getByRole('dialog').getByRole('button',{name:'Run simulation test',exact:true}).click();await panel.getByRole('heading',{name:'Infrastructure failures',exact:true}).waitFor();assert.ok((await panel.innerText()).includes('Browser fixture provider unavailable'));assert.equal(listSimulationRuns(app).find(r=>r.status==='failed')!.measures.length,0);assert.equal(store.cycles(source.id).length,0);assert.deepEqual(errors,[]);
  }finally{await browser.close();server.closeAllConnections();await app.close();await new Promise<void>(r=>server.close(()=>r()));store.close();}
});
