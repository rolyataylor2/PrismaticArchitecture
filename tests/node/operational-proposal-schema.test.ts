import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { operationalProposalSchema } from '../../packages/providers/src/operational-proposal-schema.js';
import { strictOutputSchema } from '../../packages/providers/src/openai.js';
import { defaultExecutiveProfile } from '../../packages/core/src/executive-profile.js';
import type { PublicExecutiveSkill } from '../../packages/core/src/executive-skill.js';
import { WorldStateSchema } from '../../packages/core/src/domain.js';

const proposal = (invocation?: object) => ({ action: { kind: 'operate', text: 'Verify a read', operation: { successCriteria: 'Independent result', constraints: [],
  steps: [], verification: null, ...(invocation ? { skillInvocation: invocation } : {}) } }, argument: 'Fixture reason', identityFit: [], executionOrder: [] });
const publicMethod: PublicExecutiveSkill = { id: 'method', version: 3, name: 'Fixture method', conditions: ['Exact fixture'], scope: 'agent', status: 'active',
  inputPolicy: 'exact_recorded_inputs', successCriteria: 'Independent result', constraints: [], limits: defaultExecutiveProfile().limits,
  requiredTools: [], permitted: true, validation: 'passed', limitations: ['Plumbing only'] };
const world = (skills: PublicExecutiveSkill[]) => WorldStateSchema.parse({ id: 'world', cycleId: 'cycle', agentId: 'agent', sequence: 1,
  capturedAt: new Date().toISOString(), facts: [], externalSkills: skills });

test('generative method references admit only current available exact versions and conditional branches; no methods means no invocation field', () => {
  const absent = operationalProposalSchema(world([]));
  assert.ok(absent.safeParse(proposal()).success); assert.equal(absent.safeParse(proposal({ skillId: 'invented', version: 1 })).success, false);
  assert.equal(JSON.stringify(strictOutputSchema(z.toJSONSchema(absent))).includes('skillInvocation'), false);
  assert.equal(JSON.stringify(strictOutputSchema(z.toJSONSchema(absent))).includes('intervention'), false);
  const exact = operationalProposalSchema(world([publicMethod]));
  assert.ok(exact.safeParse(proposal({ skillId: 'method', version: 3 })).success);
  for (const ref of [{ skillId: 'invented', version: 3 }, { skillId: 'method', version: 2 }, { skillId: 'method', version: 3, branchId: 'invented' }]) assert.equal(exact.safeParse(proposal(ref)).success, false);
  const conditional = operationalProposalSchema(world([{ ...publicMethod, conditional: [
    { id: 'approved', when: ['Present condition'], reason: 'Recorded', skillId: 'member', version: 2, successCriteria: 'Independent result', constraints: [], permitted: true, status: 'active' },
    { id: 'stale', when: ['Older condition'], reason: 'Historical', skillId: 'old-member', version: 2, successCriteria: 'Independent result', constraints: [], permitted: false, status: 'stale' },
  ] }]));
  assert.ok(conditional.safeParse(proposal({ skillId: 'method', version: 3, branchId: 'approved' })).success);
  assert.equal(conditional.safeParse(proposal({ skillId: 'method', version: 3 })).success, false);
  assert.equal(conditional.safeParse(proposal({ skillId: 'method', version: 3, branchId: 'stale' })).success, false);
  for (const excluded of [{ ...publicMethod, status: 'proposed' as const }, { ...publicMethod, permitted: false }])
    assert.equal(operationalProposalSchema(world([excluded])).safeParse(proposal({ skillId: 'method', version: 3 })).success, false);
});

test('remainder generation binds only the supplied activity and explicit tool-result checkpoint', () => {
  const snapshot = world([]);
  snapshot.selectedActivity = { executionId: 'running', goal: 'Verify a read', successCriteria: 'Independent result', constraints: [] };
  snapshot.facts = [{ source: 'External execution', kind: 'observes', text: 'At this tool result, the recorded successful call prefix contains 1 calls.', timestamp: null, referenceId: 'trace' }];
  const base = proposal();
  const corrected = { ...base, action: { ...base.action, operation: { ...base.action.operation, remainderCorrection: { executionId: 'running', checkpointTraceId: 'trace' } } } };
  const schema = operationalProposalSchema(snapshot);
  assert.ok(schema.safeParse(corrected).success);
  assert.equal(schema.safeParse({ ...corrected, action: { ...corrected.action, operation: { ...corrected.action.operation, remainderCorrection: { executionId: 'other', checkpointTraceId: 'trace' } } } }).success, false);
  assert.equal(schema.safeParse({ ...corrected, action: { ...corrected.action, operation: { ...corrected.action.operation, remainderCorrection: { executionId: 'running', checkpointTraceId: 'old' } } } }).success, false);
  snapshot.facts = [];
  assert.equal(operationalProposalSchema(snapshot).safeParse(corrected).success, false);
});
