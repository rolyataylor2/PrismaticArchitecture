import test from 'node:test';
import assert from 'node:assert/strict';
import { sensorFacts } from '../../packages/sdk/src/sensor-input.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { MockDecisions, MockEmbeddings, MockReasoning } from '../../packages/providers/src/mock.js';

test('sensor input preserves collections, apostrophes, literal commands and escaped quotes', () => {
  const facts = sensorFacts(`/sensor audio "James says: Hello" "Bird Chirps" "Song at 'halfway there'" /sensor visual "A desk" /sensor temperature 21 C`);
  assert.deepEqual(facts.map(f => [f.source, f.kind, f.text]), [
    ['Sensor audio', 'observes', 'James says: Hello'], ['Sensor audio', 'observes', 'Bird Chirps'],
    ['Sensor audio', 'observes', "Song at 'halfway there'"], ['Sensor visual', 'observes', 'A desk'],
    ['Sensor temperature', 'observes', '21 C'],
  ]);
  assert.equal(sensorFacts('/sensor audio "Say /sensor visual next"')[0]!.text, 'Say /sensor visual next');
  assert.equal(sensorFacts('/sensor audio "He says \\"Hello\\""')[0]!.text, 'He says "Hello"');
  assert.equal(sensorFacts('Hello')[0]!.text, 'Someone says: Hello');
  assert.equal(sensorFacts('Hello', 'James')[0]!.text, 'James says: Hello');
  for (const text of ['/sensor', '/sensor audio', '/sensor audio ""', '/sensor audio "unfinished', '/sensor audio "ok" /sensor visual']) {
    assert.throws(() => sensorFacts(text), /Use \/sensor/);
  }
});

test('message sensor collections enter one normal cycle, persist in-thread and remain isolated', async () => {
  const store = new SqliteStore(':memory:');
  const app = new Application(store, { reasoning: new MockReasoning(), decisions: new MockDecisions(), embeddings: new MockEmbeddings() });
  try {
    const agent = app.createAgent('Sensor test');
    const first = await app.message(agent.id, '/sensor audio "Bird chirps" /sensor visual "A desk"', 'user', 'room');
    assert.deepEqual(store.world(first.cycle.worldId).facts.map(f => f.text), ['Bird chirps', 'A desk']);
    const second = await app.message(agent.id, 'Hello', 'user', 'room');
    assert.ok(store.world(second.cycle.worldId).facts.some(f => f.text === 'Bird chirps'));
    assert.equal(store.world(second.cycle.worldId).facts.at(-1)!.text, 'Someone says: Hello');
    const other = await app.message(agent.id, 'Elsewhere', 'user', 'other');
    assert.deepEqual(store.world(other.cycle.worldId).facts.map(f => f.text), ['Someone says: Elsewhere']);
    const count = store.cycles(agent.id).length;
    await assert.rejects(app.message(agent.id, '/sensor audio "unfinished'), /Use \/sensor/);
    assert.equal(store.cycles(agent.id).length, count);
  } finally { await app.close(); store.close(); }
});
