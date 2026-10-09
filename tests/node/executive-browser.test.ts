import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from '../../packages/sdk/src/application.js';
import { createResearchServer } from '../../apps/server/src/server.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import type { ProcedureConsolidationInput } from '../../packages/core/src/procedure-consolidation.js';

const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('Executive panels persist operational configuration and discover/grant real MCP without cognition', { skip: !existsSync(executable) }, async () => {
  let operate = false;
  let knownMethod: { skillId: string; version: number } | undefined;
  let missingStrategy = false; let guidanceRequestId: string | undefined;
  class Reasoning extends MockReasoning {
    override async consolidateProcedures(input: ProcedureConsolidationInput): Promise<unknown> {
      const source = input.episodes.find(episode => episode.evidence === 'passed')!;
      return { candidates: [{ name: 'Conditional browser method', conditions: ['Exact browser fixture'], reason: 'Prescribed consolidation reason, not psychological validation',
        escalate: ['Unexpected input'], branches: [{ sourceContractId: source.contractId, when: ['The current fixture calls for value 42'], reason: 'The recorded instruction used and verified this input' }] }], reason: 'Prescribed browser consolidation fixture' };
    }
    override async constructed(input: ConstructedInput): Promise<unknown> {
      const output = await super.constructed(input);
      if (!operate || input.task !== 'part_cognition') return output;
      const generated = PartGenerationSchema.parse(output);
      generated.cognition.thought = 'Prescribed fixture thought: keep exact inputs and check the result independently.';
      const tool = { serverId: 'local', toolName: 'echo', argumentsJson: '{"value":42}' };
      generated.cognition.proposal = { action: { kind: 'operate', text: missingStrategy || guidanceRequestId ? 'Guided browser fixture' : 'Browser tool fixture', operation: {
        successCriteria: 'The separate check returns 42', constraints: [], steps: missingStrategy || knownMethod ? [] : [tool],
        verification: missingStrategy || knownMethod ? null : { ...tool, path: ['value'], expectedJson: '42' },
        ...(knownMethod ? { skillInvocation: knownMethod } : {}),
        ...(guidanceRequestId ? { guidanceResponse: { requestId: guidanceRequestId, newInformation: 'I now supply the explicit browser fixture strategy.' } } : {}),
      } }, argument: 'Prescribed plumbing fixture, not psychological validation', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      const bid = context.contributions.find(contribution => contribution.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Plumbing selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(':memory:'); const app = new Application(store, {
    reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings(),
  }); const agent = app.createAgent();
  const profileSource = app.createAgent('Profile copy source');
  const sourceSettings = store.executiveProfile(profileSource.id);
  store.saveExecutiveProfile(profileSource.id, { ...sourceSettings, revision: 1, limits: { ...sourceSettings.limits, maxSteps: 9 } }, 0);
  const importRoot = mkdtempSync(join(tmpdir(), 'executive-folder-import-'));
  const importFolder = join(importRoot, 'folder-example'); mkdirSync(importFolder);
  writeFileSync(join(importFolder, 'SKILL.md'), '---\nname: folder-example\ndescription: Folder import fixture\n---\n\nKeep ambiguous files for review.\n');
  const imported = await app.agentSkillImports.propose(agent.id, { name: 'browser-import', source: 'Browser fixture source', reason: 'Inspect imported knowledge',
    files: { 'SKILL.md': '---\nname: browser-import\ndescription: Imported browser instructions\n---\n\nPreserve ambiguous results.\n' } });
  const revisedImport = await app.agentSkillImports.propose(agent.id, { name: 'browser-import', source: 'Browser fixture source', reason: 'Add a warning', previousId: imported.id,
    files: { 'SKILL.md': '---\nname: browser-import\ndescription: Imported browser instructions\n---\n\nPreserve ambiguous results and verify.\n' } });
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Executive', exact: true }).click();
    await page.getByRole('tab', { name: 'Feedback & Diagnostics', exact: true }).waitFor();
    assert.deepEqual(await page.locator('.executive-panel > h3').allTextContents(),
      ['Runtime', 'MCP Connections', 'Autonomy & Recovery', 'Environmental Sensitivity', 'Skills & Learning', 'Feedback & Diagnostics']);
    await page.getByLabel('Execution mode', { exact: true }).selectOption('background');
    assert.equal(await page.getByRole('tabpanel').count(), 1, 'Only the selected section is visible');
    await page.getByRole('tab', { name: 'Autonomy & Recovery', exact: true }).click();
    await page.getByLabel('Step budget', { exact: true }).fill('3');
    await page.getByRole('tab', { name: 'Environmental Sensitivity', exact: true }).click();
    await page.getByLabel('Enable checkpoint monitoring', { exact: true }).check();
    await page.getByLabel('Review interested checkpoints through Parts and Self', { exact: true }).check();
    await page.getByLabel('Wait for checkpoint review before the next tool call', { exact: true }).check();
    await page.locator('fieldset').filter({ has: page.getByText('novelty', { exact: true }) }).getByLabel('Response threshold', { exact: true }).fill('0.6');
    await page.getByRole('tab', { name: 'Skills & Learning', exact: true }).click();
    await page.getByLabel('Skill consolidation mode', { exact: true }).selectOption('after_repeated_success');
    await page.getByLabel('Verified successes before repeated consolidation', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Save Executive profile', exact: true }).click();
    await page.getByText('Saved profile revision 1', { exact: true }).waitFor();
    assert.equal(store.executiveProfile(agent.id).executionMode, 'background');
    assert.equal(store.executiveProfile(agent.id).limits.maxSteps, 3);
    assert.equal(store.executiveProfile(agent.id).sensitivity.novelty.threshold, 0.6);
    assert.equal(store.executiveProfile(agent.id).attention.enabled, true);
    assert.equal(store.executiveProfile(agent.id).attention.reviewInterested, true);
    assert.equal(store.executiveProfile(agent.id).attention.awaitCheckpointReview, true);
    assert.deepEqual(store.executiveProfile(agent.id).consolidation, { mode: 'after_repeated_success', requiredSuccesses: 3 });
    await page.getByRole('tab', { name: 'MCP Connections', exact: true }).click();
    await page.getByLabel('Server name', { exact: true }).fill('local');
    await page.getByLabel('Transport', { exact: true }).selectOption('stdio');
    await page.getByLabel('Local command', { exact: true }).fill(process.execPath);
    await page.getByLabel('Arguments (one per line)', { exact: true }).fill(fileURLToPath(new URL('../fixtures/executive-mcp-server.mjs', import.meta.url)));
    await page.getByLabel('Environment secret references (JSON object, optional)', { exact: true }).fill('{"MCP_TEST_PATH":"env:PATH"}');
    await page.getByRole('button', { name: 'Register MCP server', exact: true }).click();
    await page.getByRole('heading', { name: 'local (stdio)', exact: true }).waitFor();
    const registered = store.mcpRegistry().servers.find(server => server.id === 'local')!;
    assert.ok(registered.transport === 'stdio');
    assert.deepEqual(registered.envSecretRefs, { MCP_TEST_PATH: 'env:PATH' });
    await page.getByRole('button', { name: 'Discover tools', exact: true }).click();
    await page.getByText('Connection status: connected', { exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'local / echo', exact: true }).check();
    await page.getByRole('button', { name: 'Save tool grants', exact: true }).click();
    await page.getByRole('button', { name: 'Save tool grants', exact: true }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.executive-page button')].find(button => button.textContent === 'Save tool grants')?.disabled === false);
    assert.deepEqual(store.mcpPermissions(agent.id).tools, [{ serverId: 'local', toolName: 'echo' }]);
    assert.equal(store.cycles(agent.id).length, 0, 'Researcher configuration never invokes cognition');
    operate = true;
    const result = await app.message(agent.id, 'Run the browser fixture.', 'user', 'origin');
    await app.executiveWorkers.wait(agent.id, result.execution!.id);
    await app.waitForInference(agent.id);
    const boundaries = store.eventsByType(agent.id, ['execution.checkpoint_boundary'], [result.cycle.id]);
    assert.equal(boundaries.length, 1);
    const boundary = boundaries[0]!;
    if (boundary.type === 'execution.checkpoint_boundary') {
      assert.equal(boundary.payload.completedSteps, 1); assert.equal(boundary.payload.traceRefs.length, 1);
    }
    await page.getByRole('tab', { name: 'Feedback & Diagnostics', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh executions', exact: true }).click();
    await page.getByRole('heading', { name: 'Browser tool fixture', exact: true }).waitFor();
    await page.getByText('Status: completed', { exact: true }).waitFor();
    await page.getByText('Cognitive attention: background', { exact: true }).last().waitFor();
    await page.getByText('Cognitive attention: background', { exact: true }).last().click();
    const checkpointRead = page.waitForResponse(response => response.request().method() === 'GET'
      && /\/cycles\/[^/]+$/.test(new URL(response.url()).pathname));
    await page.getByRole('button', { name: 'Inspect attention checkpoint', exact: true }).last().click();
    assert.equal((await (await checkpointRead).json()).cycle.kind, 'attention_monitor');
    await page.getByText('This checkpoint records read-only relevance monitoring. No Part generation, Self selection or intervention occurred.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
    assert.ok((await page.locator('.executive-panel').last().textContent())?.includes('Submitted calls: 2'));
    const calls = page.locator('.executive-panel').last().locator('details').filter({ has: page.getByText('Tool calls and results', { exact: true }) });
    await calls.locator('summary').first().click();
    assert.equal(await calls.locator('tbody tr').count(), 2);
    assert.equal(await calls.getByText('Independent verification', { exact: true }).count(), 1);
    const procedure = page.locator('.executive-panel').last().locator('details').filter({ has: page.getByText('Selected tool procedure', { exact: true }) });
    await procedure.locator('summary').first().click();
    assert.equal(await procedure.locator('li').count(), 2);
    assert.equal(await calls.getByText('succeeded', { exact: true }).count(), 2);
    const response = calls.locator('pre').first();
    assert.equal(await response.isVisible(), false, 'Recorded response stays collapsed until requested');
    await calls.getByText('Arguments and recorded response', { exact: true }).first().click();
    assert.equal(await response.isVisible(), true);
    assert.ok((await response.textContent())?.includes('structuredContent'));
    assert.equal(await page.getByRole('button', { name: 'Inspect execution and cognition', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Refresh executions', exact: true }).click();
    await response.waitFor({ state: 'visible' });
    assert.equal(await calls.locator('tbody tr').count(), 2);
    let cyclesBeforeAdministration = store.cycles(agent.id).length;
    await page.getByRole('tab', { name: 'Skills & Learning', exact: true }).click();
    const importRevision = page.locator(`#skill-import-${revisedImport.id}`);
    await importRevision.locator('summary').first().click();
    await importRevision.getByText('Reason: Add a warning', { exact: true }).waitFor();
    await importRevision.getByRole('link', { name: 'Inspect previous proposal', exact: true }).click();
    const originalImport = page.locator(`#skill-import-${imported.id}`);
    assert.equal(await originalImport.evaluate(element => (element as HTMLDetailsElement).open), true);
    await originalImport.getByText('Source: Browser fixture source', { exact: true }).waitFor();
    const importEvents = store.events(agent.id).length; const importGrants = store.mcpPermissions(agent.id);
    await page.getByLabel('Skill package folder', { exact: true }).setInputFiles(importFolder);
    await page.getByLabel('Package source', { exact: true }).fill('Folder selected through the browser');
    await page.getByLabel('Reason for importing', { exact: true }).fill('Inspect folder instructions');
    await page.getByLabel('Earlier proposal', { exact: true }).selectOption(imported.id);
    await page.getByRole('button', { name: 'Import skill proposal', exact: true }).click();
    const folderProposal = page.locator('details').filter({ has: page.locator('summary', { hasText: 'folder-example · Proposed' }) }).first();
    await folderProposal.locator('summary').first().click();
    await folderProposal.getByText('Reason: Inspect folder instructions', { exact: true }).waitFor();
    const storedFolder = (await app.agentSkillImports.list(agent.id)).find(record => record.name === 'folder-example')!;
    assert.equal(storedFolder.previousId, imported.id);
    assert.equal(storedFolder.status, 'proposed'); assert.match(storedFolder.package.instructions, /ambiguous files/);
    assert.equal(store.events(agent.id).length, importEvents); assert.deepEqual(store.mcpPermissions(agent.id), importGrants);
    await folderProposal.getByLabel('Review reason', { exact: true }).fill('Browser researcher review of knowledge');
    await folderProposal.getByRole('button', { name: 'Mark knowledge reviewed', exact: true }).click();
    await folderProposal.getByText('Knowledge review: reviewed', { exact: true }).waitFor();
    const reviewedFolder = await app.agentSkillImports.load(agent.id, storedFolder.id);
    assert.equal(reviewedFolder.reviews[0]!.reason, 'Browser researcher review of knowledge');
    assert.equal(reviewedFolder.status, 'proposed'); assert.deepEqual(reviewedFolder.package.files, storedFolder.package.files);
    assert.equal(store.events(agent.id).length, importEvents); assert.deepEqual(store.mcpPermissions(agent.id), importGrants);
    await page.getByRole('button', { name: 'Refresh skills', exact: true }).click();
    await page.getByLabel('Procedure name', { exact: true }).fill('Recorded browser procedure');
    await page.getByLabel('Applicable conditions (one per line)', { exact: true }).fill('Exact recorded input and verification criterion');
    await page.getByLabel('Procedure scope', { exact: true }).selectOption('thread');
    await page.getByRole('button', { name: 'Propose skill', exact: true }).click();
    await page.getByRole('heading', { name: 'Recorded browser procedure', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Approve skill', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Validate skill', exact: true }).click();
    await page.getByText('Version 2; proposed; scope: thread', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Approve skill', exact: true }).click();
    await page.getByText('Version 3; active; scope: thread', { exact: true }).waitFor();
    assert.equal(store.cycles(agent.id).length, cyclesBeforeAdministration);
    const activeMethod = store.executiveSkills(agent.id)[0]!; knownMethod = { skillId: activeMethod.id, version: activeMethod.version };
    const knownUse = await app.message(agent.id, 'Explicitly apply the approved browser method.', 'user', 'origin');
    await app.executiveWorkers.wait(agent.id, knownUse.execution!.id); await app.waitForInference(agent.id); knownMethod = undefined;
    cyclesBeforeAdministration = store.cycles(agent.id).length;
    await page.getByText('Skill version history', { exact: true }).click();
    await page.getByRole('button', { name: 'Load skill history', exact: true }).click();
    await page.getByRole('button', { name: 'Restore skill version 1', exact: true }).click();
    await page.getByText('Version 4; proposed; scope: thread', { exact: true }).waitFor();
    const skill = store.executiveSkills(agent.id)[0]!;
    assert.equal(skill.change.kind, 'rollback');
    assert.equal(skill.threadId, 'origin');
    assert.equal(store.executiveSkillHistory(agent.id, skill.id).length, 4);
    await page.getByText('Copy package to another Agent', { exact: true }).click();
    await page.getByLabel('Target Agent for Recorded browser procedure', { exact: true }).selectOption(profileSource.id);
    await page.getByLabel('Version to copy for Recorded browser procedure', { exact: true }).fill('3');
    await page.getByLabel('Copy reason for Recorded browser procedure', { exact: true }).fill('Inspect historical portable method without inheriting approval');
    const copiedResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/executive-skill-imports/copy'));
    await page.getByRole('button', { name: 'Copy skill package', exact: true }).click();
    const copiedPackage = await (await copiedResponse).json();
    assert.equal(copiedPackage.status, 'proposed'); assert.equal(copiedPackage.reviews.length, 0);
    assert.ok(copiedPackage.source.includes('version 3'));
    assert.deepEqual(store.executiveSkills(profileSource.id), []); assert.deepEqual(store.mcpPermissions(profileSource.id).tools, []);
    assert.equal(store.cycles(profileSource.id).length, 0);
    await page.getByRole('button', { name: 'Inspect skill', exact: true }).click();
    const inspector = page.getByRole('dialog', { name: 'Skill development', exact: true });
    await inspector.getByRole('heading', { name: 'Skill development: Recorded browser procedure', exact: true }).waitFor();
    assert.equal(await inspector.getByRole('tabpanel').count(), 1);
    await inspector.getByRole('tab', { name: 'Development', exact: true }).click();
    await inspector.getByRole('heading', { name: 'How this skill developed', exact: true }).waitFor();
    await inspector.getByRole('heading', { name: 'Recorded application evidence across versions', exact: true }).waitFor();
    await inspector.getByRole('columnheader', { name: 'Verified successes', exact: true }).waitFor();
    await inspector.getByRole('button', { name: 'View version 3', exact: true }).click();
    assert.equal(await inspector.getByLabel('Development version', { exact: true }).inputValue(), '3');
    await inspector.getByRole('tab', { name: 'Bids & Thoughts', exact: true }).click();
    const sourceEpisode = inspector.locator(`#skill-episode-${result.execution!.contractId}`);
    await sourceEpisode.getByText('Prescribed fixture thought: keep exact inputs and check the result independently.', { exact: true }).waitFor();
    await sourceEpisode.getByText('Reason: Prescribed plumbing fixture, not psychological validation', { exact: true }).waitFor();
    assert.ok((await inspector.innerText()).includes('Execution: completed'));
    const packageEpisode = inspector.locator(`#skill-episode-${knownUse.execution!.contractId}`);
    await packageEpisode.locator('summary').first().click();
    await packageEpisode.getByText('Stored package provenance', { exact: true }).click();
    await packageEpisode.getByRole('button', { name: 'Inspect method package', exact: true }).click();
    await packageEpisode.getByText('SKILL.md', { exact: true }).click();
    await packageEpisode.getByText('Apply current preferences, constraints and host permissions before selecting this method.', { exact: false }).waitFor();
    await inspector.screenshot({ path: '/tmp/executive-skill-inspector.png' });
    const variant = app.executiveSkills.proposeSkill(agent.id, { name: 'Alternative recorded method', conditions: ['A separately declared fixture condition'],
      scope: 'thread', sourceContractId: result.execution!.contractId! });
    await inspector.getByRole('button', { name: 'Refresh skill inspection', exact: true }).click();
    await inspector.getByRole('tab', { name: 'Related Variants', exact: true }).click();
    await inspector.getByRole('heading', { name: variant.name, exact: true }).waitFor();
    assert.ok((await inspector.innerText()).includes('not a proven parent/child relationship'));
    await inspector.getByRole('button', { name: 'Inspect related method', exact: true }).click();
    await inspector.getByRole('heading', { name: `Skill development: ${variant.name}`, exact: true }).waitFor();
    await inspector.getByRole('button', { name: 'Close dialog', exact: true }).click();
    assert.equal(store.cycles(agent.id).length, cyclesBeforeAdministration, 'Reading skill lineage and variants cannot invoke cognition');
    assert.equal(store.cycles(agent.id).length, cyclesBeforeAdministration, 'Procedural administration never invokes cognition');
    await page.getByRole('button', { name: 'Consolidate procedural experience', exact: true }).click();
    await page.getByRole('heading', { name: 'Conditional browser method', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Conditional browser method', exact: true }).locator('..').getByRole('button', { name: 'Inspect skill', exact: true }).click();
    await inspector.getByRole('heading', { name: 'Conditional branches', exact: true }).waitFor();
    await inspector.getByText('The current fixture calls for value 42', { exact: true }).waitFor();
    await inspector.getByText('The recorded instruction used and verified this input', { exact: true }).waitFor();
    await inspector.screenshot({ path: '/tmp/executive-conditional-inspector.png' });
    await inspector.getByRole('button', { name: 'Inspect branch method', exact: true }).click();
    await inspector.getByRole('tab', { name: 'Bids & Thoughts', exact: true }).click();
    await inspector.getByText('Prescribed fixture thought: keep exact inputs and check the result independently.', { exact: true }).waitFor();
    await inspector.getByRole('button', { name: 'Close dialog', exact: true }).click();
    assert.equal(store.cycles(agent.id).length, cyclesBeforeAdministration, 'External procedural inference and inspection cannot run Agent cognition');
    missingStrategy = true;
    const guided = await app.message(agent.id, 'Consider the incomplete browser fixture.', 'user', 'origin');
    await app.executiveWorkers.wait(agent.id, guided.execution!.id);
    const parent = store.executions(agent.id).find(item => item.id === guided.execution!.id)!;
    assert.equal(parent.status, 'needs_guidance');
    await page.getByRole('tab', { name: 'Feedback & Diagnostics', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh executions', exact: true }).click();
    await page.getByText('Status: needs_guidance', { exact: true }).waitFor();
    await page.getByText(`Guidance requested: ${parent.guidance!.requestedInstruction}`, { exact: true }).waitFor();
    missingStrategy = false; guidanceRequestId = parent.guidance!.id;
    const resumed = await app.message(agent.id, 'Select the supplied browser instruction.', 'user', 'origin');
    await app.executiveWorkers.wait(agent.id, resumed.execution!.id);
    await page.getByRole('button', { name: 'Refresh executions', exact: true }).click();
    await page.getByText('Status: continued', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Inspect preceding execution', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Inspect continuation', exact: true }).count(), 1);
    await page.getByText(`Continued under supplemental contract: ${resumed.execution!.contractId}`, { exact: true }).waitFor();
    await page.getByText(`Responds to guidance request: ${guidanceRequestId}`, { exact: true }).waitFor();
    operate = false; guidanceRequestId = undefined;
    await page.getByRole('tab', { name: 'Skills & Learning', exact: true }).click();
    const attachedProposal = page.locator(`#skill-import-${storedFolder.id}`);
    if (!await attachedProposal.evaluate(element => (element as HTMLDetailsElement).open)) await attachedProposal.locator('summary').first().click();
    await attachedProposal.getByLabel('Message with this skill', { exact: true }).fill('Consider this reviewed procedure for my next task.');
    const attachedMessage = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/message'));
    await attachedProposal.getByRole('button', { name: 'Ask Agent to consider this skill', exact: true }).click();
    const sentMessage = await attachedMessage;
    assert.deepEqual(sentMessage.request().postDataJSON().skillDocumentIds, [storedFolder.id]);
    assert.equal(sentMessage.status(), 200);
    const attachedResult = await sentMessage.json();
    assert.equal(store.world(attachedResult.cycle.worldId).externalSkillDocuments![0]!.digest, storedFolder.digest);
    operate = true; missingStrategy = true; knownMethod = undefined;
    for (let index = 0; index < 21; index++) {
      const history = await app.message(agent.id, `Authored incomplete-method history ${index}`, 'user', 'origin');
      await app.executiveWorkers.wait(agent.id, history.execution!.id);
    }
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Executive', exact: true }).click();
    await page.getByRole('tab', { name: 'Feedback & Diagnostics', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh executions', exact: true }).click();
    const total = store.executions(agent.id).filter(item => item.action.kind === 'operate').length;
    await page.getByText(`Showing 20 of ${total} operational executions, newest first.`, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Show older executions', exact: true }).click();
    await page.getByText(`Showing ${total} of ${total} operational executions, newest first.`, { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Show older executions', exact: true }).isVisible(), false);
    await page.getByRole('heading', { name: 'Browser tool fixture', exact: true }).first().waitFor();
    await page.getByRole('tab', { name: 'Runtime', exact: true }).click();
    await page.getByLabel('Source Agent', { exact: true }).selectOption(profileSource.id);
    await page.waitForFunction(() => document.querySelector('.executive-page pre')?.textContent?.includes('"maxSteps": 9'));
    await page.getByLabel('Reason for copying configuration', { exact: true }).fill('Browser configuration portability fixture');
    await page.getByRole('button', { name: 'Copy configuration', exact: true }).click();
    await page.getByRole('tab', { name: 'Autonomy & Recovery', exact: true }).click();
    await page.getByLabel('Step budget', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Step budget', { exact: true }).inputValue(), '9');
    assert.equal(store.eventsByType(agent.id, ['executive.profile_copied']).length, 1);
    assert.deepEqual(store.mcpPermissions(agent.id).tools, [{ serverId: 'local', toolName: 'echo' }]);
    assert.equal(store.cycles(profileSource.id).length, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await app.close(); store.close(); rmSync(importRoot, { recursive: true, force: true }); }
});

test('browser consultation preserves a draft through refresh and records attributed ordinary cognition', { skip: !existsSync(executable), timeout: 60000 }, async () => {
  class Reasoning extends MockReasoning {
    override async constructed(input: ConstructedInput) {
      const output = await super.constructed(input);
      if (input.task !== 'part_cognition') return output;
      const generated = PartGenerationSchema.parse(output);
      if (input.world?.selectedActivity) {
        generated.cognition.thought = 'Prescribed observation considered without advocating interruption.';
        generated.cognition.proposal = null;
      } else generated.cognition.proposal = { action: { kind: 'operate', text: 'Held external browser fixture', operation: {
        successCriteria: 'External fixture later reports an outcome', constraints: [], steps: [], verification: null,
      } }, argument: 'Prescribed UI plumbing fixture', identityFit: [], executionOrder: [] };
      return generated;
    }
  }
  class Decisions extends MockDecisions {
    override async choose(context: SelfContext) {
      const bid = context.contributions.find(item => item.bid?.action)?.bid; assert.ok(bid);
      return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Prescribed fixture selection', identityConflict: '' };
    }
  }
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new Reasoning(), decisions: new Decisions(), embeddings: new MockEmbeddings() }, {
    async execute({ agentId, cycleId, bid, contract }) {
      return { id: `held_${cycleId}`, agentId, cycleId, action: bid.action, contractId: contract!.id,
        status: 'running', facts: [], operational: { attempts: 0, verified: false, traceRefs: [], reason: 'Held replacement-executor fixture; no tools submitted' } };
    },
  });
  const agent = app.createAgent();
  const started = await app.message(agent.id, 'Start the held UI fixture.', 'user', 'origin');
  const server = createResearchServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: executable, headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await page.getByRole('button', { name: 'Agent Components', exact: true }).click();
    await page.getByRole('button', { name: 'Executive', exact: true }).click();
    await page.getByRole('tab', { name: 'Feedback & Diagnostics', exact: true }).click();
    await page.getByRole('button', { name: 'Consult cognition', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Consult cognition', exact: true });
    await dialog.getByLabel('Reason for consulting cognition', { exact: true }).fill('Prescribed consultation reason');
    await dialog.getByLabel('Current observation', { exact: true }).fill('Researcher reports a possible ambiguity.');
    const refresh = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/agents/${agent.id}/executions`));
    await page.getByRole('button', { name: 'Refresh executions', exact: true }).evaluate(element => (element as HTMLButtonElement).click());
    await refresh;
    assert.equal(await dialog.getByLabel('Current observation', { exact: true }).inputValue(), 'Researcher reports a possible ambiguity.');
    await dialog.getByRole('button', { name: 'Request cognitive review', exact: true }).click();
    await dialog.getByText('Cognitive review recorded.', { exact: true }).waitFor();
    const request = store.eventsByType(agent.id, ['execution.consultation_requested'])[0]!;
    assert.ok(request.type === 'execution.consultation_requested');
    const world = store.world(store.cycle(request.cycleId!).worldId);
    assert.ok(world.facts.some(fact => fact.text === 'Researcher reports a possible ambiguity.' && fact.source === 'Researcher execution observation'));
    assert.equal(store.executions(agent.id).length, 1);
    assert.equal(store.executions(agent.id)[0]!.id, started.execution!.id);
    await dialog.getByRole('button', { name: 'Inspect consultation', exact: true }).click();
    await page.getByText('Prescribed consultation reason', { exact: true }).waitFor();
    await page.getByText('Parts expressed thoughts without a bid; activity continued without mandatory arbitration.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); await app.close(); store.close(); }
});
