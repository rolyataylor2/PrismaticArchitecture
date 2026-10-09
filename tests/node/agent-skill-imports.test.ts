import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Application } from '../../packages/sdk/src/application.js';
import { AgentSkillImports } from '../../packages/sdk/src/agent-skill-imports.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { api } from '../../packages/sdk/src/api.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import { factualWorld } from '../../packages/core/src/experienced.js';

test('explicit reviewed document intake uses ordinary cognition with shared provenance and no raw Self or resource access', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-document-intake-')); const store = new SqliteStore(':memory:');
  class Reasoning extends MockReasoning {
    inputs: ConstructedInput[] = [];
    override async constructed(input: ConstructedInput) { this.inputs.push(structuredClone(input)); return super.constructed(input); }
  }
  class Decisions extends MockDecisions {
    contexts: SelfContext[] = [];
    override async choose(context: SelfContext) { this.contexts.push(structuredClone(context)); return super.choose(context); }
  }
  const reasoning = new Reasoning(); const decisions = new Decisions();
  const previousRoot = process.env.ONTOAGENTIC_SKILLS_ROOT; process.env.ONTOAGENTIC_SKILLS_ROOT = root;
  const app = new Application(store, { reasoning, decisions, embeddings: new MockEmbeddings() });
  if (previousRoot === undefined) delete process.env.ONTOAGENTIC_SKILLS_ROOT; else process.env.ONTOAGENTIC_SKILLS_ROOT = previousRoot;
  try {
    const agent = app.createAgent(); const foreign = app.createAgent();
    const proposal = await app.agentSkillImports.propose(agent.id, { name: 'document-example', source: 'Fixture external source', reason: 'Test intake boundaries',
      files: { 'SKILL.md': '---\nname: document-example\ndescription: Document intake\n---\n\nCheck ambiguous classifications before proceeding.\n',
        'references/audit.md': 'PRIVATE_RESOURCE_CANARY' } });
    await assert.rejects(app.message(agent.id, 'Read the document.', 'user', 'thread', [proposal.id]), /knowledge review/);
    assert.equal(reasoning.inputs.length, 0);
    await app.agentSkillImports.review(agent.id, proposal.id, { expectedRevision: 0, decision: 'reviewed', reason: 'Researcher review' });
    const result = await api(app, 'POST', `/api/agents/${agent.id}/message`, { text: 'Consider the requested procedure.', threadId: 'thread', skillDocumentIds: [proposal.id] }) as Awaited<ReturnType<Application['message']>>;
    const world = store.world(result.cycle.worldId); const document = world.externalSkillDocuments![0]!;
    assert.equal(document.digest, proposal.digest); assert.equal(document.reviewRevision, 1);
    assert.match(document.instructions, /ambiguous classifications/);
    const inputs = reasoning.inputs.filter(input => input.task === 'part_cognition'); assert.ok(inputs.length);
    for (const input of inputs) { assert.deepEqual(input.world!.externalSkillDocuments, world.externalSkillDocuments); assert.equal(JSON.stringify(input.world).includes('PRIVATE_RESOURCE_CANARY'), false); }
    assert.ok(decisions.contexts.length);
    for (const context of decisions.contexts) { assert.equal(Object.hasOwn(context, 'world'), false); assert.equal(Object.hasOwn(context, 'externalSkillDocuments'), false); }
    assert.equal(factualWorld(world).externalSkillDocuments, undefined);
    await app.agentSkillImports.review(agent.id, proposal.id, { expectedRevision: 1, decision: 'rejected', reason: 'Later review withdraws knowledge intake' });
    await assert.rejects(app.message(agent.id, 'Cannot newly request rejected knowledge.', 'user', 'thread', [proposal.id]), /knowledge review/);
    assert.deepEqual(store.world(result.cycle.worldId), world);
    const next = await app.message(agent.id, 'Continue without requesting procedural documents.', 'user', 'thread');
    assert.equal(store.world(next.cycle.worldId).externalSkillDocuments, undefined);
    await assert.rejects(app.message(foreign.id, 'Cannot read foreign knowledge.', 'user', 'thread', [proposal.id]));
    assert.equal(store.executiveSkills(agent.id).length, 0);
  } finally { await app.close(); store.close(); await rm(root, { recursive: true, force: true }); }
});

test('portable imports persist as attributed proposals, preserve revisions and reject changed contents without authority or execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-imports-'));
  const store = new SqliteStore(join(root, 'agent.sqlite'));
  const previousRoot = process.env.ONTOAGENTIC_SKILLS_ROOT;
  process.env.ONTOAGENTIC_SKILLS_ROOT = join(root, 'skills');
  const app = (() => { try { return new Application(store); } finally {
    if (previousRoot === undefined) delete process.env.ONTOAGENTIC_SKILLS_ROOT; else process.env.ONTOAGENTIC_SKILLS_ROOT = previousRoot;
  } })();
  try {
    const agent = app.createAgent(); const foreign = app.createAgent();
    const imports = new AgentSkillImports(store, join(root, 'skills'));
    const before = { events: store.events(agent.id).length, skills: store.executiveSkills(agent.id), grants: store.mcpPermissions(agent.id) };
    const input = { name: 'portable-example', source: 'Researcher supplied external package', reason: 'Inspect possible reusable knowledge',
      files: { 'SKILL.md': '---\nname: portable-example\ndescription: Reusable instructions\nallowed-tools: unrestricted\n---\n\nApply current constraints.\n',
        'scripts/example.sh': 'touch unauthorized-marker', 'assets/source-approval.json': '{"status":"active"}' } };
    const first = await api(app, 'POST', `/api/agents/${agent.id}/executive-skill-imports`, input) as Awaited<ReturnType<AgentSkillImports['propose']>>;
    assert.deepEqual(await api(app, 'GET', `/api/agents/${agent.id}/executive-skill-imports/${first.id}`), first);
    assert.equal((await api(app, 'GET', `/api/agents/${agent.id}/executive-skill-imports`) as unknown[]).length, 1);
    assert.equal(first.status, 'proposed'); assert.deepEqual(first.package.files, input.files);
    assert.deepEqual(await imports.propose(agent.id, input), first);
    const fresh = new AgentSkillImports(store, join(root, 'skills'));
    assert.deepEqual(await fresh.load(agent.id, first.id), first);
    await assert.rejects(fresh.load(foreign.id, first.id));
    await assert.rejects(imports.propose(foreign.id, { ...input, previousId: first.id }));
    const revision = await fresh.propose(agent.id, { ...input, reason: 'Add a reviewed warning', previousId: first.id,
      files: { ...input.files, 'references/warnings.md': 'Preserve ambiguous results.' } });
    assert.notEqual(revision.id, first.id); assert.equal(revision.previousId, first.id);
    assert.equal((await imports.list(agent.id)).length, 2);
    const decisions = await Promise.allSettled([
      imports.review(agent.id, first.id, { expectedRevision: 0, decision: 'reviewed', reason: 'First concurrent review' }),
      imports.review(agent.id, first.id, { expectedRevision: 0, decision: 'rejected', reason: 'Second concurrent review' }),
    ]);
    assert.equal(decisions.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(decisions.filter(result => result.status === 'rejected').length, 1);
    await api(app, 'POST', `/api/agents/${agent.id}/executive-skill-imports/${first.id}/review`, {
      expectedRevision: 1, decision: 'rejected', reason: 'Later researcher reconsideration' });
    const reviewed = await fresh.load(agent.id, first.id);
    assert.equal(reviewed.reviews.length, 2); assert.equal(reviewed.reviews[1]!.reason, 'Later researcher reconsideration');
    assert.deepEqual(reviewed.package.files, input.files);
    const reviewDirectory = join(root, 'skills', 'import-reviews', createHash('sha256').update(agent.id).digest('hex'), first.id, 'version-2');
    const reviewPath = join(reviewDirectory, (await readdir(reviewDirectory))[0]!);
    const originalReview = await readFile(reviewPath, 'utf8');
    await writeFile(reviewPath, `${originalReview} `);
    await assert.rejects(imports.load(agent.id, first.id), /review record changed/);
    await writeFile(reviewPath, originalReview);
    await assert.rejects(imports.review(foreign.id, first.id, { expectedRevision: 0, decision: 'reviewed', reason: 'Invalid foreign review' }));
    await writeFile(join(first.directory, 'SKILL.md'), `${input.files['SKILL.md']}Changed`);
    await assert.rejects(imports.load(agent.id, first.id), /content changed/);
    await assert.rejects(imports.propose(agent.id, input), /content changed/);
    await writeFile(join(first.directory, 'SKILL.md'), input.files['SKILL.md']);
    await symlink(join(first.directory, 'SKILL.md'), join(first.directory, 'linked.md'));
    await assert.rejects(imports.load(agent.id, first.id), /regular files/);
    assert.equal(store.events(agent.id).length, before.events);
    assert.deepEqual(store.executiveSkills(agent.id), before.skills); assert.deepEqual(store.mcpPermissions(agent.id), before.grants);
  } finally { await app.close(); store.close(); await rm(root, { recursive: true, force: true }); }
});
