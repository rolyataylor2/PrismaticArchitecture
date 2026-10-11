import { ActivationScoreSchema } from './domain.js';
import { AffectChoiceSchema, type AffectChoice, type AffectSelectionContext } from './affect-domain.js';
import { InfrastructureError } from './contracts.js';

export const affectScoreCriteria = ['No useful contribution or incompatible', 'Low or poorly supported value',
  'Possible value, insufficient basis for deliberate focus', 'High supported value for understanding or meaningful action',
  'Essential supported contribution to an enduring commitment'];
export function affectChoices(context: AffectSelectionContext): string[] {
  return [...context.proposals.map(proposal => proposal.id), ...(context.currentFocus ? ['MAINTAIN_AFFECT'] : []),
    'NO_AFFECT_CHANGE', ...(context.canDeliberate && context.availableContributors.length ? ['DELIBERATE_AFFECT'] : [])];
}

/** First judge every proposal; only a separate complementary judgment can add a second. */
export async function scoreAffect(context: AffectSelectionContext,
  judge: (options: string[], selected: string[]) => Promise<unknown>): Promise<AffectChoice> {
  const choices = affectChoices(context);
  if (new Set(choices).size !== choices.length || context.proposals.some(proposal => ['MAINTAIN_AFFECT', 'NO_AFFECT_CHANGE', 'DELIBERATE_AFFECT'].includes(proposal.id)))
    throw new InfrastructureError('affect_selection', 'Duplicate or reserved affect proposal IDs');
  const scores: NonNullable<AffectChoice['scores']> = [];
  const rank = async (options: string[], selected: string[]) => {
    const values = ActivationScoreSchema.array().parse(await judge(options, selected));
    if (values.length !== options.length || new Set(values.map(value => value.partId)).size !== options.length
      || values.some(value => !options.includes(value.partId))) throw new InfrastructureError('affect_selection', 'Missing, duplicate or unavailable affect scores');
    scores.push(...values.map(({ partId, ...value }) => ({ proposalId: partId, ...value, selectedBefore: [...selected] })));
    return options.map(option => values.find(value => value.partId === option)!).sort((a, b) => b.score - a.score);
  };
  const first = (await rank(choices, []))[0]!;
  let mode: AffectChoice['mode'] = 'no_change';
  const selectedProposalIds: string[] = [];
  if (first.partId === 'MAINTAIN_AFFECT' && first.score > 2) mode = 'maintain';
  else if (first.partId === 'DELIBERATE_AFFECT' && first.score > 2) mode = 'deliberate';
  else if (context.proposals.some(proposal => proposal.id === first.partId) && first.score > 2) {
    mode = 'select'; selectedProposalIds.push(first.partId);
    const remaining = context.proposals.filter(proposal => proposal.id !== first.partId).map(proposal => proposal.id);
    if (remaining.length) {
      const complementary = (await rank(remaining, selectedProposalIds))[0]!;
      if (complementary.score > 2) selectedProposalIds.push(complementary.partId);
    }
  }
  return AffectChoiceSchema.parse({ mode, selectedProposalIds, scores,
    reason: 'Bounded affect scores selected this mode; the scoring API does not supply an authored rationale. Proposal reasons retain their own attribution.' });
}
