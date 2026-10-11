import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { createResearchServer } from '../../apps/server/src/server.js';
import { listSimulationRuns, startSimulationTest } from '../../packages/sdk/src/simulation-tests.js';
import { simulationResearch } from '../../packages/sdk/src/simulation-research.js';

const executable = process.env.CHROME_BIN ?? '/usr/bin/chromium';
test('research dashboard navigates real trials, plots, evidence, reviews, comparisons and replay across desktop/mobile', { skip: !existsSync(executable), timeout: 120000 }, async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store); const source = app.createAgent('Observatory source');
  for (const testId of ['conversation-starters', 'conversation-starters', 'conversation-fallback-control']) {
    const started = startSimulationTest(app, testId, 'fixture', source.id);
    for (let i=0;i<1000&&listSimulationRuns(app).find(r=>r.id===started.id)!.status==='running';i++) await new Promise(r=>setTimeout(r,10));
    assert.equal(listSimulationRuns(app).find(r=>r.id===started.id)!.status,'completed');
  }
  const sourceEvents=store.events(source.id).length;
  const server=createResearchServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
  const browser=await chromium.launch({executablePath:executable,headless:true});
  const screenshots=process.env.PRISM_DASHBOARD_SCREENSHOTS; if(screenshots)mkdirSync(screenshots,{recursive:true});
  try {
    const page=await browser.newPage({viewport:{width:1600,height:1100}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button',{name:'Simulator',exact:true}).click();
    const panel=page.locator('.research-dashboard');await panel.getByRole('heading',{name:'The Simulator',exact:true}).waitFor();
    await panel.getByLabel('Experiment',{exact:true}).selectOption('conversation-starters');
    await panel.getByRole('heading',{name:'What recurs, what wavers?',exact:true}).waitFor();
    assert.ok(await panel.locator('.rd-stacked').count()>0);assert.ok(await panel.locator('.rd-plot svg').count()>0);
    const run=listSimulationRuns(app).find(r=>r.testId==='conversation-starters')!;
    if(screenshots)await page.screenshot({path:`${screenshots}/experiment-desktop.png`,fullPage:true});
    await panel.locator('.rd-stacked').first().click();await page.getByRole('dialog').waitFor();assert.ok((await page.getByRole('dialog').innerText()).includes('fixture'));await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
    const sets=await panel.getByLabel('Run set',{exact:true}).locator('option').count();assert.equal(sets,2,'identical repetitions share one configuration set');
    await panel.getByLabel('Run set',{exact:true}).selectOption({index:1});await panel.getByLabel('Run',{exact:true}).selectOption(run.id);
    await panel.getByRole('navigation',{name:'Analytics views'}).getByRole('button',{name:'Activation',exact:true}).click();
    await panel.getByRole('heading',{name:'Activation heatmap',exact:true}).waitFor();
    if(screenshots)await page.screenshot({path:`${screenshots}/activation-desktop.png`,fullPage:true});
    const mark=panel.locator('.rd-plot circle[role=button]').first();await mark.focus();await panel.getByRole('tooltip').waitFor();await mark.press('Enter');
    await panel.getByRole('heading',{name:'1. Simple greeting',exact:true}).waitFor();
    if(screenshots)await page.screenshot({path:`${screenshots}/stage-investigation.png`,fullPage:true});
    await panel.getByRole('button',{name:'Original stage JSON',exact:true}).click();await page.getByRole('dialog').getByLabel('Search original JSON').fill('thought');
    assert.ok((await page.getByRole('dialog').getByRole('status').innerText()).includes('matching lines')); if(screenshots)await page.screenshot({path:`${screenshots}/evidence-dialog.png`});await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
    await panel.getByRole('button',{name:'← Back to run overview',exact:true}).click();
    for(const view of ['Predictions','Learning','Affect','Execution']as const){await panel.getByRole('navigation',{name:'Analytics views'}).getByRole('button',{name:view,exact:true}).click();await page.waitForTimeout(200);assert.ok(!(await panel.innerText()).includes('undefined'));}
    await panel.getByRole('navigation',{name:'Analytics views'}).getByRole('button',{name:'Records',exact:true}).click();
    await panel.getByLabel('Search recorded evidence').fill('calm');assert.ok((await panel.locator('.rd-records').innerText()).length>0);
    await panel.getByRole('navigation',{name:'Analytics views'}).getByRole('button',{name:'Conclusions',exact:true}).click();
    await panel.getByRole('heading',{name:'Researcher criterion reviews',exact:true}).waitFor();
    await panel.getByLabel('Reviewer',{exact:true}).fill('Dashboard researcher');await panel.getByLabel('Review rationale',{exact:true}).fill('Fixture contribution exists; no model theory validation is claimed.');await panel.getByLabel('Evidence references (one per line)',{exact:true}).fill('/stages/0/thoughts');
    await panel.getByRole('button',{name:'Save criterion review',exact:true}).click();await panel.getByText(/Dashboard researcher · v1/).waitFor();assert.equal(simulationResearch(store,run.id).reviews.length,1);
    await panel.getByLabel('Review rationale',{exact:true}).fill('Updated review retaining the same original evidence.');await panel.getByRole('button',{name:'Save criterion review',exact:true}).click();await panel.getByText(/Dashboard researcher · v2/).waitFor();
    await panel.getByLabel('Finding key',{exact:true}).fill('dashboard-evidence');await panel.getByLabel('Finding title',{exact:true}).fill('Preserved contribution');await panel.getByLabel('Finding claim',{exact:true}).fill('A recorded thought is available for investigation.');await panel.getByLabel('Alternative explanations',{exact:true}).fill('Bundled mock response.');await panel.getByLabel('Recommended follow-up',{exact:true}).fill('Repeat with configured models and controls.');await panel.getByLabel('Finding reviewer',{exact:true}).fill('Dashboard researcher');await panel.getByLabel('Finding evidence references',{exact:true}).fill('/stages/0/thoughts');await panel.getByRole('button',{name:'Save finding version',exact:true}).click();await panel.getByRole('button',{name:'Preserved contribution · unreviewed · v1',exact:true}).waitFor();assert.equal(simulationResearch(store,run.id).findings.some(f=>f.key==='dashboard-evidence'),true);
    await panel.getByLabel('Criterion evidence channel').selectOption('human'); await panel.locator('.rd-stacked').first().waitFor(); assert.ok((await panel.innerText()).includes('human review verdicts'));
    await panel.getByRole('navigation',{name:'Analytics views'}).getByRole('button',{name:'Compare',exact:true}).click();await panel.getByRole('button',{name:'Compare recorded runs',exact:true}).click();await panel.getByRole('heading',{name:'Active scopes · baseline vs comparison',exact:true}).waitFor();
    if(screenshots)await page.screenshot({path:`${screenshots}/comparison-desktop.png`,fullPage:true});
    await panel.getByLabel('Comparison mode').selectOption('stages'); await panel.getByLabel('Baseline stage').selectOption('0'); await panel.getByLabel('Follow-up stage').selectOption('2'); await panel.getByRole('button',{name:'Compare recorded runs',exact:true}).click(); await panel.getByText(/Baseline and follow-up stages are explicitly researcher-selected/).waitFor();
    await panel.getByRole('button',{name:'Run overview',exact:true}).click();await panel.getByRole('button',{name:'Repeat or fork saved starting conditions',exact:true}).click();await page.getByRole('dialog').getByLabel('Launch reason',{exact:true}).fill('Dashboard replay verification');await page.getByRole('dialog').getByRole('button',{name:'Rerun frozen configuration',exact:true}).click();await page.getByRole('dialog').getByRole('status').filter({hasText:/Started simulation/}).waitFor();
    await page.getByRole('dialog').getByLabel('Launch reason',{exact:true}).fill('Dashboard explicit fork');await page.getByRole('dialog').getByLabel('Fork activation setting').selectOption('memorySearchEnabled');await page.getByRole('dialog').getByLabel('Fork setting value').selectOption('false');await page.getByRole('dialog').getByRole('button',{name:'Launch configuration fork',exact:true}).click();
    for(let i=0;i<1000&&!listSimulationRuns(app).some(r=>r.lineage?.reason==='Dashboard explicit fork');i++)await new Promise(r=>setTimeout(r,10));const fork=listSimulationRuns(app).find(r=>r.lineage?.reason==='Dashboard explicit fork')!;assert.equal(fork.startingConfiguration!.activationSettings.memorySearchEnabled,false);await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
    assert.ok(listSimulationRuns(app).some(r=>r.lineage?.reason==='Dashboard replay verification'));
    await panel.getByRole('button',{name:'Experiment overview',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200); assert.equal(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'whole page fits mobile viewport');
    if(screenshots)await page.screenshot({path:`${screenshots}/experiment-mobile.png`,fullPage:true});
    assert.equal(await panel.locator('.rd-panel details').count(),0,'no record trees in analytical views');assert.equal(await panel.locator('.rd-panel pre:visible').count(),0);
    assert.equal(store.events(source.id).length,sourceEvents);assert.deepEqual(errors,[]);
    for(let i=0;i<1000&&listSimulationRuns(app).some(r=>r.status==='running');i++)await new Promise(r=>setTimeout(r,10));
  }finally{await browser.close();server.closeAllConnections();await app.close();await new Promise<void>(r=>server.close(()=>r()));store.close();}
});
