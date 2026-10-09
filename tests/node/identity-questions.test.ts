import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { identityAnswerGuidance, identityQuestionLibrary } from '../../packages/sdk/src/identity-questions.js';
import { api } from '../../packages/sdk/src/api.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';
import { Application } from './persistent-fixture.js';

test('Identity question catalog captures every source file and every listed prompt with first-person wording and verbatim provenance', () => {
  const directory = 'examples/Example Identity Questions';
  const sources = readdirSync(directory).filter(name => name.endsWith('.txt')).sort();
  assert.deepEqual(identityQuestionLibrary.map(group => basename(group.source)).sort(), sources);
  const ids = identityQuestionLibrary.flatMap(group => group.questions.map(question => question.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const group of identityQuestionLibrary) {
    const source = readFileSync(group.source, 'utf8');
    const [guidance, questions] = source.split('Here are the questions to answer');
    if (questions !== undefined) {
      const expected = questions.split('\n').filter(line => line.trim().startsWith('- ')).map(line => line.trim().slice(2).trim());
      assert.deepEqual(group.questions.map(example => example.sourceQuestion), expected, group.source);
      assert.ok(group.answerGuidance.startsWith(guidance!.trim()));
    } else {
      assert.equal(group.category, 'Reactions');
      assert.equal(group.questions.length, 1);
      assert.equal(group.answerGuidance, source.trim());
      assert.match(group.answerGuidance, /20 examples of situation and reaction/);
    }
    assert.ok(group.questions.every(example => example.keywords.length && example.keywords.every(keyword => keyword.trim())));
    for (const example of group.questions) {
      assert.match(example.question, /\b(?:I|my|me)\b/, example.id);
      assert.doesNotMatch(example.question, /\b(?:the character|the persona|you|your|he|his)\b/i, example.id);
      assert.doesNotMatch(example.question, /\b(?:do|does|how|are|have) they\b/i, example.id);
    }
  }
});

test('question catalog API is independent of Agent state and requires no inference', async () => {
  const store = new SqliteStore(':memory:');
  try {
    const app = new Application(store); const agent = app.createAgent();
    const before = store.get('identity', agent.id);
    assert.deepEqual(await api(app, 'GET', '/api/identity-questions'), identityQuestionLibrary);
    assert.deepEqual(await api(app, 'GET', '/api/identity-guidance'), { guidance: identityAnswerGuidance });
    assert.deepEqual(store.get('identity', agent.id), before);
    assert.equal(store.versions('identity', agent.id).length, 1);
    assert.equal(store.cycles(agent.id).length, 0);
  } finally { store.close(); }
});


test('shared answer guidance uses the researcher-provided general instructions', () => {
  assert.match(identityAnswerGuidance, /^These answers describe the characters cognitive process, environment and life as THEY view them/);
  assert.equal(identityAnswerGuidance.split('\n').filter(line => line.startsWith('- ')).length, 12);
  assert.match(identityAnswerGuidance, /The answers should reflect the written dialog of the character vs spoken dialog/);
  assert.doesNotMatch(identityAnswerGuidance, /Formatting instructions|Reaction exercise instructions/);
});

test('every preset has an explicit cognitive role and mixed biography questions stay outside Self', () => {
  const questions = identityQuestionLibrary.flatMap(group => group.questions);
  assert.ok(questions.every(question => ['self_definition', 'autobiographical'].includes(question.role)));
  const role = (id: string) => questions.find(question => question.id === id)!.role;
  for (const id of ['life-01', 'life-02', 'life-03', 'life-04', 'life-19', 'life-20', 'life-21', 'life-22', 'cognition-07', 'cognition-25', 'reactions-01', 'speech-23']) assert.equal(role(id), 'autobiographical', id);
  for (const id of ['cognition-04', 'cognition-12', 'life-08', 'life-18', 'responsiveness-24']) assert.equal(role(id), 'self_definition', id);
});

test('generated Identity copies preset roles independently of model answers', async () => {
  const { OpenAIProvider } = await import('../../packages/providers/src/openai.js');
  const store = new SqliteStore(':memory:'); const app = new Application(store);
  try {
    const provider = new OpenAIProvider('unused-test-key');
    provider.author = async (schema, prompt) => {
      const ids = [...prompt.matchAll(/^ID: (.+)$/gm)].map(match => match[1]!);
      assert.equal([...prompt.matchAll(/^Role: (self_definition|autobiographical)$/gm)].length, ids.length);
      return schema.parse({ answers: ids.map(questionId => ({ questionId, answer: `My answer for ${questionId}.` })) });
    };
    app.identityAuthoringProvider = () => provider;
    const agent = app.createAgent(); const initial = store.get('identity', agent.id);
    await api(app, 'POST', `/api/agents/${agent.id}/identity-authoring/generate`, {
      name: 'Example', version: 'A fictional example', details: '', expectedVersion: initial.version,
    });
    const result = store.get('identity', agent.id);
    const questions = identityQuestionLibrary.flatMap(group => group.questions);
    assert.deepEqual(result.traits.map(trait => [trait.question, trait.role]), questions.map(question => [question.question, question.role]));
    assert.equal(result.version, initial.version + 1);
    const input = { name: 'Example', version: 'A fictional example', details: '', expectedVersion: result.version };
    for (const questionIds of [[], ['unknown'], ['life-01', 'life-01']]) {
      await assert.rejects(api(app, 'POST', `/api/agents/${agent.id}/identity-authoring/generate`, { ...input, questionIds }));
      assert.deepEqual(store.get('identity', agent.id), result);
    }
    const requested: string[] = [];
    provider.author = async (schema, prompt) => {
      const ids = [...prompt.matchAll(/^ID: (.+)$/gm)].map(match => match[1]!); requested.push(...ids);
      return schema.parse({ answers: ids.map(questionId => ({ questionId, answer: 'My selected answer.' })) });
    };
    await api(app, 'POST', `/api/agents/${agent.id}/identity-authoring/generate`, { ...input, questionIds: ['life-01', 'cognition-04'] });
    assert.deepEqual(requested, ['cognition-04', 'life-01']);
    assert.deepEqual(store.get('identity', agent.id).traits.map(trait => trait.role), ['self_definition', 'autobiographical']);
    assert.equal(store.get('identity', agent.id).traits.length, 2);
    const existing = store.get('identity', agent.id);
    await api(app, 'POST', `/api/agents/${agent.id}/identity-authoring/generate`, { ...input, expectedVersion: existing.version, questionIds: ['speech-01'], deleteExistingTraits: false });
    const appended = store.get('identity', agent.id);
    assert.deepEqual(appended.traits.slice(0, 2), existing.traits);
    assert.equal(appended.traits.length, 3);
  } finally { store.close(); }
});
