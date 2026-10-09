import { z } from 'zod';
import { ActionProposalSchema, CognitionSchema, ProposalSchema, Text, freeze } from './domain.js';
import type { Identity, IdentityTrait, WorldState } from './domain.js';

export const PrimitiveDraftSchema = z.strictObject({
  bidsEnabled: z.boolean().optional(),
  activationPrompt: z.string().trim().min(1).max(8000).optional(),
  activationThreshold: z.number().min(0).max(4).optional(),
  family: z.enum(['appraisal', 'action_tendency']).optional(),
  icon: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(1).max(100),
  aspects: z.array(z.string().trim().min(1).max(2000)).min(1).max(20),
  thoughtPrompt: z.string().trim().min(1).max(8000),
  bidPrompt: z.string().trim().min(1).max(8000),
});
export const PrimitiveSchema = PrimitiveDraftSchema.extend({ id: z.string().min(1).max(200) });
export type Primitive = z.infer<typeof PrimitiveSchema>;
export const PrimitiveSettingsSchema = z.strictObject({ revision: z.number().int().nonnegative(),
  items: z.array(PrimitiveSchema).min(1).max(30), originals: z.array(PrimitiveSchema).min(1).max(60),
}).refine(value => new Set(value.items.map(item => item.id)).size === value.items.length, 'Duplicate primitive IDs');
export type PrimitiveSettings = z.infer<typeof PrimitiveSettingsSchema>;
export type PrimitiveActivation = { primitiveId: string; name: string; score: number; distribution?: { label: string; probability: number }[]; previous: number; delta: number; threshold: number; active: boolean };
export type PrimitiveContext = { world: WorldState; primitive: Primitive; question?: string };
// Constrain provider outputs before they reach the runtime's defensive checks.
export const PrimitiveProposalSchema = ActionProposalSchema.extend({
  action: z.strictObject({ kind: z.enum(['say', 'ask', 'wait']), text: Text }),
  executionOrder: z.array(z.string()).max(0),
});
export const PrimitiveOutputSchema = CognitionSchema.extend({ proposal: ProposalSchema.nullable() });
export function primitiveOutputSchema(primitive: Primitive) {
  return PrimitiveOutputSchema.extend({ proposal: primitive.bidsEnabled === false ? z.null() : PrimitiveProposalSchema });
}
const defaultIcons = ['✨', '😮', '😊', '😣', '🪄', '🔁', '🛑', '🔍', '🤝', '❓', '📩', '💬', '🤷', '❔'];
const defaultActivationInstructions = [
  'Evaluate immediate novelty: how unfamiliar is the current stimulation relative to preceding facts and recent experience? Weight novelty_sensitivity where supplied. Do not invent remembered experience.',
  'Evaluate immediate unexpectedness: compare current observation with immediately preceding facts, recent experience and explicit expectations in WorldState. Weight novelty_sensitivity and uncertainty_tolerance where supplied. Do not let learned Part beliefs explain away the abrupt change.',
  'Evaluate immediate pleasant stimulation using positive_reactivity where supplied, without judging long-term benefit or learned interpretations.',
  'Evaluate immediate aversive stimulation using negative_reactivity and soothing_rate where supplied. Do not judge whether avoidance is wise or defer to learned beliefs about safety.',
  'Evaluate whether another intentional entity appears responsible for the current event. Use observable evidence; do not assume certain causation or invent motives.',
  'Evaluate the immediate tendency to repeat current pleasant or interesting stimulation using positive_reactivity, approach_bias and attention_persistence where supplied. This is an action tendency, not an emotion or long-term plan.',
  'Evaluate the immediate tendency to stop or pause current stimulation using negative_reactivity and soothing_rate where supplied. This is an action tendency, not a judgment that stopping is ultimately wise.',
  'Evaluate the immediate orienting tendency to allocate additional attention or observation using novelty_sensitivity and attention_persistence where supplied. Do not label this as an emotion.',
  'Evaluate the immediate tendency toward social contact using social_orientation and approach_bias where supplied. Do not invent a relationship or forecast how another person will respond.',
  'Evaluate immediate ambiguity or not knowing. This can be done by evaluating missing information or missing parts; Base you activation score on the lack of sufficient parts. If there are less than 3 parts that could be activated above 2.0 then uncertainty should be 3 or higher;',
  'Evaluate whether current communication or behavior is directed specifically at us. Distinguish direct address from nearby conversation; do not assume all speech is addressed to us.',
  'Evaluate the immediate tendency to respond to communication or behavior directed at us. Distinguish response from initiating social contact; use social_orientation where supplied.',
  'If uncertainty is high and part activation is low, then your activation should be proportionately high;',
  'Evaluate the immediate tendency to ask for specific missing information needed to reduce current uncertainty. Distinguish seeking information from merely expressing uncertainty or initiating contact.',
];
const definitions = [
  ['Novel', 'Notice unfamiliar stimulation.', 'This is new to me.', 'Ask about the unfamiliar thing.'],
  ['Unexpected', 'Notice a surprising change without inventing a remembered expectation.', 'Something changed.', 'Pause and ask what happened.'],
  ['Pleasant', 'Notice potentially pleasant stimulation.', 'I like this.', 'Express simple appreciation.'],
  ['Aversive', 'Notice potentially uncomfortable stimulation.', 'This feels uncomfortable.', 'Ask for less of the uncomfortable stimulation.'],
  ['Agent caused this', 'Notice when another intentional entity appears responsible; do not assume causation or motives.', 'Someone appears to have caused this.', 'Ask a basic question about who caused the current event.'],
  ['Repeat this', 'Consider repeating a current pleasant or interesting interaction.', 'I want more of this.', 'Ask to repeat the current interaction.'],
  ['Stop this', 'Consider pausing current stimulation.', 'I want a pause.', 'Propose a brief pause.'],
  ['Look closer', 'Attend to immediate details with simple curiosity.', 'I want to look closer.', 'Ask a basic question about a current detail.'],
  ['Seek interaction', 'Attend to possible social contact.', 'I want to connect.', 'Offer a simple greeting or question.'],
  ['Uncertain', 'Notice ambiguity and tolerate not knowing.', 'I do not know yet.', 'Ask for simple clarification.'],
  ['Addressed to me', 'Register communication or behavior directed specifically at me.', 'This appears directed at me.', 'Acknowledge the directed communication without inventing an answer or preference.'],
  ['Respond', 'Provide a basic response to communication or behavior directed at me.', 'I can respond to this.', 'Produce a short grounded response to the current communication. Do not invent preferences, knowledge or experiences.'],
  ['Signal uncertainty', 'Communicate that I lack an answer or adequate interpretation.', 'I can express that I do not know yet.', 'Use a say action to communicate uncertainty simply, for example: I do not know yet. Do not invent knowledge, memories or preferences, or turn this into an information request.'],
  ['Seek information', 'Ask for specific missing information to reduce uncertainty.', 'I need more information about this.', 'Use an ask action for a basic question about the current information gap, for example: What are cats like? Do not presume the answer or invent preferences.'],
];
export function defaultPrimitives(): Primitive[] {
  return definitions.map(([name, aspect, thought, bid], index) => PrimitiveSchema.parse({
    id: `primitive_${index + 1}`, name, icon: defaultIcons[index], aspects: [aspect],
    bidsEnabled: name !== 'Uncertain', activationThreshold: 2, family: [5, 6, 7, 8, 11, 12, 13].includes(index) ? 'action_tendency' : 'appraisal',
    activationPrompt: defaultActivationInstructions[index],
    thoughtPrompt: `Produce one short first-person thought from this primitive interpretation, grounded in current stimulation. Example: "${thought}" Do not invent memories, predictions or complex plans.`,
    bidPrompt: `Produce one basic bid. ${bid} Use only supported say, ask or wait actions. Do not invent forecasts or a multi-step strategy.`,
  })).filter(primitive => primitive.id !== 'primitive_12'); // Retired Respond slot; preserve later IDs and legacy read-time defaults.
}
export function initialPrimitiveSettings(): PrimitiveSettings {
  const items = defaultPrimitives(); return freeze({ revision: 0, items, originals: structuredClone(items) });
}

/** Read-time defaults preserve existing researcher configuration and immutable history. */
export function effectivePrimitive(primitive: Primitive): Primitive & { activationPrompt: string; activationThreshold: number; family: 'appraisal' | 'action_tendency' } {
  const index = Number(primitive.id.replace('primitive_', '')) - 1;
  return { ...primitive, activationThreshold: primitive.activationThreshold ?? 2,
    family: primitive.family ?? ([5, 6, 7, 8, 11, 12, 13].includes(index) ? 'action_tendency' : 'appraisal'),
    activationPrompt: primitive.activationPrompt ?? defaultActivationInstructions[index]
      ?? 'Evaluate immediate registration through this primitive’s aspects. Use supplied temperament where relevant; do not infer learned memories, forecasts or plans.' };
}

/** Researcher-authored temperament stays in Identity; no inferred numeric profile. */
export function primitiveSensitivities(identity: Identity): IdentityTrait[] {
  const patterns = [/novelty/, /negative[ _]reactivity/, /positive[ _]reactivity/, /approach[ _]bias/,
    /attention[ _]persistence/, /soothing[ _]rate/, /social[ _]orientation/, /uncertainty[ _]tolerance/];
  return structuredClone(identity.traits.filter(trait => trait.role !== 'autobiographical'
    && patterns.some(pattern => pattern.test(`${trait.question} ${trait.keywords.join(' ')}`.toLowerCase()))));
}

export const partActivationCriteria = [
  'Dormant: no meaningful current resonance; any similarity is incidental.',
  'Stirred: weak or background resonance; unlikely to contribute.',
  'Active: meaningfully engaged and likely to contribute a thought, feeling, prediction or bid.',
  'Strong: directly engaged and exerting substantial pressure to contribute.',
  'Dominant: intensely engaged around a central concern and exerting unusually strong pressure on cognition or behavior.',
];
export const primitiveActivationCriteria = [
  'Dormant: no meaningful immediate appraisal or action tendency.',
  'Stirred: mild background registration or orientation.',
  'Active: clear immediate registration or orientation likely to influence attention.',
  'Strong: substantial immediate registration or orientation demanding attention.',
  'Dominant: unusually intense immediate registration or orientation capturing cognition.',
];
