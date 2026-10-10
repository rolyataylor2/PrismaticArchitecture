import test from 'node:test';
import assert from 'node:assert/strict';
import { demoIdentity } from '../../packages/sdk/src/seed.js';
import { affectSelectionContext, activeAffect, decideAffect, affectFeedback } from '../../packages/core/src/affect.js';
import { AffectSelectionSchema, type AffectBid } from '../../packages/core/src/affect-domain.js';
import type { Contribution, Identity, Prediction } from '../../packages/core/src/domain.js';

const identity: Identity = { ...demoIdentity, id: 'identity', agentId: 'agent', version: 1, schemaVersion: 2 };
const proposals: AffectBid[] = ['grief', 'anger', 'curiosity'].map((orientation, index) => ({
  id: `proposal-${index}`, partId: `part-${index}`, name: orientation, orientation,
  motivation: 'Preserve what matters', reason: 'Consider a neglected concern',
  expectedValue: 'Understand and act meaningfully', supportingPredictionIds: [],
}));
const contributions: Contribution[] = proposals.map(proposal => ({ partId: proposal.partId, name: proposal.name,
  thought: 'Private expressed content outside first-pass projection', interpretation: 'Expressed appraisal',
  affect: 'Naturally occurring sadness', evidenceSummary: ['An expressed record'], prediction: null, bid: null }));
const context = () => affectSelectionContext({ identity, contributions, proposals });
const select = (ids = ['proposal-0']) => ({ mode: 'select', selectedProposalIds: ids,
  reason: 'Acknowledge a valued loss', explorationRequest: null });
const control = (mode: string) => ({ mode, selectedProposalIds: [], reason: 'Consider the prior orientation', explorationRequest: null });
const decide = (selection: unknown) => decideAffect({ context: context(), selection, cycleId: 'cycle-1', threadId: 'thread', sequence: 1, periodId: 'period-1' });

test('affect Self context excludes experienced affect, activation and wider runtime objects', () => {
  const value = affectSelectionContext({ identity,
    contributions: contributions.map(contribution => ({ ...contribution, world: { secret: 'raw-world' }, activation: 4 })),
    proposals: proposals.map(proposal => ({ ...proposal, affect: 'raw-affect', memories: ['private'] })),
  });
  assert.deepEqual(Object.keys(value).sort(), ['availableContributors', 'currentFocus', 'identity', 'previousPeriodFeedback', 'proposals']);
  const serialized = JSON.stringify(value);
  for (const forbidden of ['raw-world', 'raw-affect', 'Naturally occurring sadness', 'Private expressed content', 'activation', 'memories']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.proposals[0]), true);
  assert.equal(contributions[0]!.affect, 'Naturally occurring sadness');
});

test('affect selection accepts only participating proposals with distinct IDs', () => {
  assert.throws(() => affectSelectionContext({ identity, contributions: contributions.slice(1), proposals }));
  assert.throws(() => affectSelectionContext({ identity, contributions, proposals: [proposals[0]!, proposals[0]!] }));
  assert.throws(() => decide(select(['invented'])));
  assert.throws(() => decide(select(['proposal-0', 'proposal-0'])));
  assert.throws(() => decide(select(proposals.map(proposal => proposal.id))));
  assert.equal(decide(select(['proposal-0', 'proposal-1'])).resultingFocus!.proposals.length, 2);
});

test('focus expires after the next same-thread cycle unless explicitly maintained', () => {
  const started = decide(select());
  assert.equal(started.boundary, 'started');
  const focus = started.resultingFocus!;
  assert.equal(activeAffect(focus, 'agent', 'thread', 2)!.periodId, 'period-1');
  assert.equal(activeAffect(focus, 'agent', 'thread', 3), null);
  const input = { context: affectSelectionContext({ identity, contributions, proposals, currentFocus: focus }),
    cycleId: 'cycle-2', threadId: 'thread', sequence: 2 };
  const unchanged = decideAffect({ ...input, selection: control('no_change') });
  assert.equal(unchanged.resultingFocus!.expiresAfterSequence, 2);
  const renewed = decideAffect({ ...input, selection: control('maintain') });
  assert.equal(renewed.boundary, 'renewed');
  assert.equal(renewed.resultingFocus!.periodId, focus.periodId);
  assert.equal(renewed.resultingFocus!.reason, focus.reason);
  assert.equal(renewed.resultingFocus!.expiresAfterSequence, 3);
  assert.equal(focus.expiresAfterSequence, 2);
  const expired = decideAffect({ ...input, sequence: 3, selection: control('no_change') });
  assert.equal(expired.boundary, 'expired');
  assert.equal(expired.endedPeriodId, focus.periodId);
  assert.equal(expired.resultingFocus, null);
  assert.throws(() => decideAffect({ ...input, sequence: 3, selection: control('maintain') }));
  assert.throws(() => decide(control('maintain')));
  assert.throws(() => activeAffect(focus, 'agent', 'thread', 0));
  assert.throws(() => activeAffect(renewed.resultingFocus, 'agent', 'thread', 1));
});

test('switches preserve prior focus and reject Agent/thread scope changes', () => {
  const focus = decide(select()).resultingFocus!;
  const ctx = affectSelectionContext({ identity, contributions, proposals, currentFocus: focus });
  const switched = decideAffect({ context: ctx, selection: select(['proposal-1']), cycleId: 'cycle-2',
    threadId: 'thread', sequence: 2, periodId: 'period-2' });
  assert.equal(switched.boundary, 'switched');
  assert.equal(switched.endedPeriodId, 'period-1');
  assert.equal(switched.previousFocus!.proposals[0]!.orientation, 'grief');
  assert.equal(switched.resultingFocus!.proposals[0]!.orientation, 'anger');
  assert.throws(() => activeAffect(focus, 'foreign', 'thread', 2));
  assert.throws(() => activeAffect(focus, 'agent', 'foreign', 2));
  assert.throws(() => affectSelectionContext({ identity: { ...identity, agentId: 'foreign' }, contributions, proposals, currentFocus: focus }));
  assert.throws(() => decideAffect({ context: ctx, selection: select(), cycleId: 'cycle-2', threadId: 'thread', sequence: 2, periodId: 'period-1' }));
});

test('affect inquiry validates all contributor targets and cannot select simultaneously', () => {
  const selection = { ...control('deliberate'), explorationRequest: { target_parts: ['part-0'], question: 'What would weaken this interpretation?' } };
  assert.equal(decide(selection).boundary, 'inquiry');
  assert.throws(() => decide({ ...selection, explorationRequest: { ...selection.explorationRequest, target_parts: ['foreign'] } }));
  assert.throws(() => decide({ ...selection, explorationRequest: { ...selection.explorationRequest, target_parts: ['part-0', 'part-0'] } }));
  assert.equal(AffectSelectionSchema.safeParse({ ...selection, selectedProposalIds: ['proposal-0'] }).success, false);
  assert.equal(AffectSelectionSchema.safeParse({ ...select(), explorationRequest: selection.explorationRequest }).success, false);
});

function prediction(id: string, status: Prediction['status'], assessment?: NonNullable<Prediction['evaluation']>['assessment']) {
  return { id, status, evaluation: assessment ? { assessment, interpretation: 'An attributed interpretation',
    causalAttribution: 'No causal proof', evidence: [], evidenceWorldId: 'later-world' } : null };
}
test('period feedback preserves uncertainty and separates baseline from origin outcomes', () => {
  const snapshots = [prediction('supported', 'resolved', 'confirmed'), prediction('wrong', 'resolved', 'contradicted'),
    prediction('open', 'open'), prediction('abandoned', 'abandoned'), prediction('expired', 'expired'), prediction('invalidated', 'invalidated'),
    prediction('partial', 'resolved', 'partly_confirmed'), prediction('ambiguous', 'resolved', 'ambiguous'),
    prediction('self', 'resolved', 'self_influenced'), prediction('external', 'resolved', 'external_circumstances'),
    prediction('interrupted', 'resolved', 'interrupted'), prediction('untestable', 'resolved', 'not_testable')];
  const input = { periodId: 'period', completedCycles: 2, baselinePredictionIds: ['baseline'],
    originatedPredictionIds: snapshots.map(value => value.id), predictions: [...snapshots, prediction('baseline', 'resolved', 'confirmed')] };
  const feedback = affectFeedback(input);
  assert.equal(feedback.baselinePredictions, 1);
  assert.equal(feedback.originatedPredictions, 12);
  assert.equal(feedback.supported, 1);
  assert.equal(feedback.contradicted, 1);
  assert.equal(feedback.untested, 6);
  assert.equal(feedback.unresolved, 1);
  assert.equal(feedback.selfInfluenced, 1);
  assert.equal(feedback.resolvedFraction, 8 / 12);
  assert.equal(feedback.supportedFractionAmongDecisive, 0.5);
  assert.equal(feedback.learningProgress, 'unavailable');
  assert.equal(feedback.practicalValue, 'requires_part_interpretation');
  assert.throws(() => affectFeedback({ ...input, baselinePredictionIds: ['open'] }));
  assert.throws(() => affectFeedback({ ...input, predictions: snapshots.slice(1) }));
  assert.throws(() => affectFeedback({ ...input, predictions: [...snapshots, snapshots[0]!] }));
});

test('late resolutions update the original period and empty cohorts have no invented accuracy', () => {
  const input = { periodId: 'ended-period', completedCycles: 1, baselinePredictionIds: [], originatedPredictionIds: ['later'] };
  assert.equal(affectFeedback({ ...input, predictions: [prediction('later', 'open')] }).supportedFractionAmongDecisive, null);
  const updated = affectFeedback({ ...input, predictions: [prediction('later', 'resolved', 'confirmed')] });
  assert.equal(updated.periodId, 'ended-period');
  assert.equal(updated.supported, 1);
  assert.equal(updated.unresolved, 0);
  const empty = affectFeedback({ ...input, originatedPredictionIds: [], predictions: [] });
  assert.equal(empty.resolvedFraction, null);
  assert.equal(empty.supportedFractionAmongDecisive, null);
});
