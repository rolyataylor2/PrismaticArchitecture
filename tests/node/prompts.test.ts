import { demoParts } from '../../packages/sdk/src/seed.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';
import { api } from '../../packages/sdk/src/api.js';
import { promptCatalog, prompts, renderPartPrompt, renderPrompt, renderTaskPrompt, resolvePrompt } from '../../packages/providers/src/prompts.js';
import { freeze } from '../../packages/core/src/domain.js';
import { promptResolver } from '../../packages/sdk/src/prompt-settings.js';

test('task prompt edits replace per-Agent or global overrides and resets remove them', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const first = app.createAgent('Prompt Agent'); const second = app.createAgent('Another Agent');
    const initial = await api(app, 'GET', `/api/agents/${first.id}/prompts`) as { task: string; original: string; effective: string }[];
    assert.equal(initial.length, promptCatalog.length);
    const original = prompts.part_cognition.text;
    assert.equal(initial.find(item => item.task === 'part_cognition')?.effective, original);
    await api(app, 'PATCH', `/api/agents/${first.id}/prompts/part_cognition`, { scope: 'global', text: 'Global custom part_cognition.' });
    await api(app, 'PATCH', `/api/agents/${first.id}/prompts/part_cognition`, { scope: 'agent', text: 'Agent-specific part_cognition.' });
    const resolve = promptResolver(store);
    assert.equal(resolve(first.id, 'part_cognition'), 'Agent-specific part_cognition.');
    assert.equal(resolve(second.id, 'part_cognition'), 'Global custom part_cognition.');
    assert.equal(store.promptOverrides({ scope: 'agent', agentId: first.id, task: 'part_cognition' })[0]?.text, 'Agent-specific part_cognition.');
    assert.equal(store.promptOverrides({ scope: 'global', task: 'part_cognition' })[0]?.text, 'Global custom part_cognition.');
    await api(app, 'POST', `/api/agents/${first.id}/prompts/part_cognition/reset`, { scope: 'agent' });
    assert.equal(resolve(first.id, 'part_cognition'), 'Global custom part_cognition.');
    assert.deepEqual(store.promptOverrides({ scope: 'agent', agentId: first.id, task: 'part_cognition' }), []);
    await api(app, 'POST', `/api/agents/${first.id}/prompts/part_cognition/reset`, { scope: 'global' });
    assert.equal(resolve(first.id, 'part_cognition'), undefined);
    assert.equal(resolve(second.id, 'part_cognition'), undefined);
    assert.deepEqual(store.promptOverrides({ task: 'part_cognition' }), []);

    await api(app, 'PATCH', `/api/agents/${first.id}/prompts/part_cognition`, { scope: 'global', text: 'Saved global default.' });
    await api(app, 'PATCH', `/api/agents/${first.id}/prompts/part_cognition`, { scope: 'agent', text: 'Saved agent override.' });
    const reset = await api(app, 'POST', `/api/agents/${first.id}/prompts/reset-all`, {}) as { promptCount: number; agentCount: number };
    assert.equal(reset.promptCount, promptCatalog.length); assert.equal(reset.agentCount, 2);
    assert.deepEqual(store.promptOverrides(), []);
    assert.equal(resolve(first.id, 'part_cognition'), undefined);
    assert.equal(resolve(second.id, 'part_cognition'), undefined);
    assert.equal(resolve(first.id, 'activation'), undefined);
    const afterReset = await api(app, 'GET', `/api/agents/${first.id}/prompts`) as { task: string; effective: string; original: string }[];
    for (const row of afterReset) assert.equal(row.effective, row.original);
    await assert.rejects(api(app, 'PATCH', `/api/agents/${first.id}/prompts/part_cognition`, { scope: 'global', text: '  ' }));
    await assert.rejects(api(app, 'PATCH', `/api/agents/${first.id}/prompts/not-a-task`, { scope: 'global', text: 'valid text' }));
  } finally { store.close(); }
});

test('prompt fallback and task resolution are explicit, stable factory defaults', () => {
  assert.equal(resolvePrompt('agent', 'activation'), prompts.activation.text);
  assert.equal(resolvePrompt('agent', 'evaluation', () => 'edited evaluation'), 'edited evaluation');
});

test('Self factory prompts render frozen context without changing Identity or exposing WorldState', () => {
  const context = freeze({
    identity: {
      id: 'identity', agentId: 'agent', version: 1, schemaVersion: 2,
      traits: [{ id: 'trait', question: 'What do I value?', answer: 'Curiosity; Honesty', keywords: ['values'], createdAt: '2026-09-30T00:00:00.000Z' }], mask: null,
    },
    contributions: [], deliberation: [], choices: ['DELIBERATE'],
  });
  const before = structuredClone(context);
  for (const task of ['arbitration', 'deliberation'] as const) {
    const rendered = renderTaskPrompt('agent', task, context);
    assert.match(rendered, /Curiosity; Honesty/);
    assert.deepEqual(context, before);
  }
  assert.equal(renderPrompt('{% set identity = "local" %}{{ identity }}', context), 'local');
  assert.deepEqual(context, before);
  assert.throws(() => renderPrompt('{{ world.id }}', context), /Invalid Twig prompt template/);
});


test('Settings exposes the full Part cognition factory template and its guides render private Part context', () => {
  const template = prompts.cognition.text;
  assert.ok(template.startsWith('# Part cognition'));
  assert.match(template, /Independent temporary perspective/);
  assert.ok(!template.includes('PersonaGPT'));
  assert.match(template, /Preserve my biased meaning/);
  assert.match(template, /Reason independently from this model/);
  assert.ok(!template.includes('{{ PART_INFORMATION }}'));
  const part = { ...demoParts[0]!, id: 'part', agentId: 'agent', version: 1, schemaVersion: 1 };
  const rendered = renderPartPrompt('agent', 'cognition', {
    part, world: { id: 'world', agentId: 'agent', cycleId: 'cycle', sequence: 1, capturedAt: 'now', facts: [] },
    memories: [], prediction: null,
    activation: { partId: 'part', score: 3, similarity: 1, reasons: [], previous: 0, delta: 3, active: true, distribution: [] },
  });
  assert.match(rendered, /Independent temporary perspective/);
  assert.ok(rendered.includes('My mission is ' + part.mission));
  assert.ok(!rendered.includes('{{'));
});


test('all Part development templates expose the motivated relational authoring guidance', () => {
  for (const task of ['cognition', 'evaluation', 'consolidation', 'formation'] as const) {
    const template = prompts[task].text;
    assert.match(template, /fewer than six words/);
    assert.match(template, /My mission expresses what I believe best serves me as the Agent/);
    assert.match(template, /My strategy is how I pursue it/);
    assert.match(template, /For generalized Parts, refer to others/);
    assert.match(template, /Preserve specific private memories and provenance/);
  }
});


test('prompt saves reject invalid Twig and preserve the current override', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent('Twig validation');
    const valid = '# My prompt\n\n{% if part.name %}Hello {{ part.name }}{% endif %}';
    for (const scope of ['global', 'agent']) {
      await api(app, 'PATCH', `/api/agents/${agent.id}/prompts/part_cognition`, { scope, text: valid });
      const overrides = store.promptOverrides();
      for (const text of ['{% if part.name %}missing end', '{{ part.name ', '{% unknown_tag %}', '{% for item in %}x{% endfor %}', '{% include "external.twig" %}']) {
        await assert.rejects(api(app, 'PATCH', `/api/agents/${agent.id}/prompts/part_cognition`, { scope, text }), /Invalid Twig prompt template: .+/);
        assert.deepEqual(store.promptOverrides(), overrides);
        assert.equal(promptResolver(store)(agent.id, 'part_cognition'), valid);
      }
    }
  } finally { store.close(); }
});

test('the complete Part factory can be saved and cloned within the existing 32768-character prompt bound', async () => {
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const agent = app.createAgent('Factory clone');
    assert.ok(prompts.part_cognition.text.length > 16000 && prompts.part_cognition.text.length <= 32768);
    await api(app, 'PATCH', `/api/agents/${agent.id}/prompts/part_cognition`, { scope: 'agent', text: prompts.part_cognition.text });
    assert.equal(promptResolver(store)(agent.id, 'part_cognition'), prompts.part_cognition.text);
    await assert.rejects(api(app, 'PATCH', `/api/agents/${agent.id}/prompts/part_cognition`, { scope: 'agent', text: 'x'.repeat(32769) }));
    assert.equal(promptResolver(store)(agent.id, 'part_cognition'), prompts.part_cognition.text);
  } finally { store.close(); }
});
