import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockReasoning, MockDecisions, MockEmbeddings } from '../../packages/providers/src/mock.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { ExecutionSchema, type SelfContext, type WorldState, type ActionBid } from '../../packages/core/src/domain.js';
import { validateActionSpace } from '../../packages/core/src/embodied-action.js';
import { compileExecutionContract, ExecutionContractSchema } from '../../packages/core/src/execution-contract.js';
import { operationalProposalSchema } from '../../packages/providers/src/operational-proposal-schema.js';
import { renderTaskPrompt } from '../../packages/providers/src/prompts.js';
import { enableExecutive } from './executive-fixture.js';

const natural = { kind: 'act' as const, text: 'Eat the apple', constraints: ['Leave the other fruit alone'], successCriteria: 'I have eaten the apple' };
const operation = { kind: 'operate' as const, text: 'Eat the apple', operation: { successCriteria: 'A check', constraints: [], steps: [], verification: null } };
class Reasoning extends MockReasoning {
  mechanical = false;
  chat?: 'say' | 'ask' | 'wait';
  inputs: ConstructedInput[] = [];
  override async constructed(input: ConstructedInput) {
    this.inputs.push(input);
    const result = await super.constructed(input);
    if (input.task !== 'part_cognition') return result;
    const generated = PartGenerationSchema.parse(result);
    generated.cognition.proposal = { action: this.chat ? { kind: this.chat, text: 'Chat-only fixture' } : this.mechanical ? operation : natural, argument: 'Prescribed intention fixture', identityFit: [], executionOrder: ['Approach the apple', 'Eat it'] };
    return generated;
  }
}
class Decisions extends MockDecisions {
  override async choose(context: SelfContext) {
    assert.ok(!('world' in context));
    const bid = context.contributions.find(contribution => contribution.bid?.action)?.bid; assert.ok(bid);
    return { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Fixture', identityConflict: '' };
  }
}

async function fresh() {
  const store = new SqliteStore(':memory:'); const seed = new Application(store); const agent = seed.createAgent('Embodied fixture'); await seed.close();
  return { store, agent };
}

test('embodied schemas, runtime validation and rendered factory prompts exclude mechanical proposals', () => {
  const world = { embodied: true } as WorldState;
  const proposal = { action: natural, argument: 'I am hungry', identityFit: [], executionOrder: [] };
  assert.equal(operationalProposalSchema(world).safeParse(proposal).success, true);
  assert.equal(operationalProposalSchema(world).safeParse({ ...proposal, action: operation }).success, false);
  for (const kind of ['say', 'ask', 'wait'] as const) {
    const chat = { ...proposal, action: { kind, text: 'Hello, or stay here briefly' } };
    assert.equal(operationalProposalSchema(world).safeParse(chat).success, false);
    assert.throws(() => validateActionSpace(world, chat), /bypass the body/);
    assert.equal(operationalProposalSchema({} as WorldState).safeParse(chat).success, true);
    assert.doesNotThrow(() => validateActionSpace({} as WorldState, chat));
  }
  assert.throws(() => validateActionSpace(world, { ...proposal, action: operation }), /Executive-only/);
  assert.throws(() => validateActionSpace({} as WorldState, proposal), /host-bound/);
  const input = { task: 'part_cognition', agentId: 'agent', world: { id: 'w', cycleId: 'c', embodied: true, facts: [] },
    dispositions: [], workingParts: [], memories: [], predictions: [], dispositionBindings: [] };
  const prompt = renderTaskPrompt('agent', 'part_cognition', input);
  assert.match(prompt, /kind act/);
  assert.match(prompt, /validWhile is optional/);
  assert.match(prompt, /absence would make my particular recommendation inappropriate/);
  assert.match(prompt, /I may also abstain/);
  assert.match(prompt, /including speaking, asking an external person a question and waiting/);
  assert.doesNotMatch(prompt, /serverId|toolName|argumentsJson|skillInvocation|operation\.intervention/);
  assert.match(renderTaskPrompt('agent', 'part_cognition', { ...input, world: { id: 'w', cycleId: 'c', facts: [] } }), /serverId/);
});

test('natural contracts preserve selected constraints and delegate no framework MCP tools', () => {
  const bid: ActionBid = { id: 'bid', partId: 'part', action: natural, argument: 'I am hungry', identityFit: [], executionOrder: ['Approach', 'Eat'] };
  const contract = compileExecutionContract({ agentId: 'agent', cycleId: 'cycle', bids: [bid], predictions: [] });
  assert.deepEqual(contract.commands[0]?.action, natural);
  assert.deepEqual(contract.commands[0]?.executionOrder, ['Approach', 'Eat']);
  assert.deepEqual(contract.authority, { capabilities: ['external_action'], tools: [], allowEquivalentMethods: true });
  assert.equal(ExecutionSchema.safeParse({ id: 'execution', agentId: 'agent', cycleId: 'cycle', action: natural,
    status: 'completed', facts: [] }).success, false);
  assert.equal(ExecutionContractSchema.safeParse({ ...contract, authority: { ...contract.authority, tools: [{ serverId: 'game', toolName: 'move' }] } }).success, false);
});

test('ordinary embodied cognition cannot emit chat-only speech, questions or waiting', async () => {
  for (const kind of ['say', 'ask', 'wait'] as const) {
    const { store, agent } = await fresh();
    const reasoning = new Reasoning(); reasoning.chat = kind;
    const app = new Application(store, { reasoning, decisions: new Decisions(), embeddings: new MockEmbeddings() }, undefined, undefined, undefined,
      { [agent.id]: 'http://127.0.0.1:1/intent' });
    try {
      enableExecutive(app, agent.id);
      await assert.rejects(app.message(agent.id, 'Someone is nearby.'), /bypass the body/);
      assert.equal(store.executions(agent.id).length, 0);
      assert.equal(store.eventsByType(agent.id, ['execution.intent_dispatch']).length, 0);
    } finally { await app.close(); store.close(); }
  }
});

test('the actual runtime sends only recorded selected intention and retains uncertain dispatch without replay', async t => {
  const requests: any[] = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.destroy(); // The external effect could have happened; never guess or retry.
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const { store, agent } = await fresh();
  const reasoning = new Reasoning();
  const app = new Application(store, { reasoning, decisions: new Decisions(), embeddings: new MockEmbeddings() }, undefined, undefined, undefined,
    { [agent.id]: `http://127.0.0.1:${(server.address() as { port: number }).port}/intent` });
  t.after(async () => { await app.close(); store.close(); });
  enableExecutive(app, agent.id);
  store.saveMcpRegistry({ revision: 1, servers: [{ id: 'private_game', transport: 'http', url: 'http://127.0.0.1:1/mcp', timeoutMs: 1000 }] }, 0);
  store.saveMcpPermissions(agent.id, { revision: 1, tools: [{ serverId: 'private_game', toolName: 'private_command' }] }, 0);
  const result = await app.message(agent.id, 'There is an apple beside you.');
  assert.equal(result.execution?.status, 'unverified');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].contract.commands[0].action, natural);
  assert.ok(reasoning.inputs.filter(input => input.world).every(input => input.world?.embodied && !input.world.externalCapabilities));
  const event = store.eventsByType(agent.id, ['execution.contract']).find(event => event.type === 'execution.contract');
  assert.ok(event?.type === 'execution.contract');
  const handoff = store.eventsByType(agent.id, ['execution.handoff']).find(event => event.type === 'execution.handoff');
  assert.ok(handoff?.type === 'execution.handoff');
  const replay = await app.embodiedExecutives.execute({ agentId: agent.id, cycleId: event.cycleId!, bid: handoff.payload.bid, contract: event.payload });
  assert.equal(replay.status, 'blocked'); assert.equal(requests.length, 1);
});

test('mechanical NPC bids fail admission and a missing restart binding does not reveal catalogs', async t => {
  const { store, agent } = await fresh();
  const reasoning = new Reasoning(); reasoning.mechanical = true;
  let app = new Application(store, { reasoning, decisions: new Decisions(), embeddings: new MockEmbeddings() }, undefined, undefined, undefined,
    { [agent.id]: 'http://127.0.0.1:1/intent' });
  enableExecutive(app, agent.id);
  await assert.rejects(app.message(agent.id, 'An apple is beside you.'), /mechanical operations/);
  assert.equal(store.eventsByType(agent.id, ['execution.intent_dispatch']).length, 0);
  await app.close();
  reasoning.mechanical = false;
  app = new Application(store, { reasoning, decisions: new Decisions(), embeddings: new MockEmbeddings() });
  t.after(async () => { await app.close(); store.close(); });
  const result = await app.message(agent.id, 'The apple is still beside you.');
  assert.equal(result.execution?.status, 'blocked');
  assert.equal(reasoning.inputs.findLast(input => input.world)?.world?.embodied, true);
});

test('an existing nonembodied experience cannot be made unaware by hiding a later catalog', async t => {
  const { store, agent } = await fresh(); const app = new Application(store);
  await app.message(agent.id, 'Hello'); await app.close();
  assert.throws(() => new Application(store, undefined, undefined, undefined, undefined,
    { [agent.id]: 'http://127.0.0.1:1/intent' }), /before the first experience/);
  t.after(() => store.close());
});

test('an owning-Part inquiry cannot replace a natural bid with mechanical execution', async t => {
  class Revised extends Reasoning {
    override async answer(context: Parameters<MockReasoning['answer']>[0], question: string) {
      const response = await super.answer(context, question);
      return { ...response, bid_disposition: 'replace' as const, new_bid: { action: operation,
        argument: 'Invalid mechanical revision fixture', identityFit: [], executionOrder: [] } };
    }
  }
  class Inquiring extends Decisions {
    override async choose(_context: SelfContext) { return { choice: 'DELIBERATE', selectedBidIds: [], explanation: 'Ask before choosing', identityConflict: '' }; }
  }
  const { store, agent } = await fresh();
  const app = new Application(store, { reasoning: new Revised(), decisions: new Inquiring(), embeddings: new MockEmbeddings() }, undefined, undefined, undefined,
    { [agent.id]: 'http://127.0.0.1:1/intent' });
  t.after(async () => { await app.close(); store.close(); });
  enableExecutive(app, agent.id);
  await assert.rejects(app.message(agent.id, 'An apple is beside you.'), /mechanical operations/);
  assert.equal(store.eventsByType(agent.id, ['execution.intent_dispatch']).length, 0);
});
