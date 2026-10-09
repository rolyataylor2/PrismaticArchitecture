import { ActivationScoreSchema, type Choice, type SelfContext } from './domain.js';
import { selfChoices } from './context.js';
import { InfrastructureError } from './contracts.js';

export const selfScoreCriteria = ['No value or incompatible', 'Low value or poorly supported', 'Some value, insufficient distinct contribution', 'High, supported, compatible and distinct value', 'Essential, supported, compatible and distinct value'];
export async function scoreSelf(context: SelfContext, judge: (options: string[], selected: string[]) => Promise<unknown>): Promise<Choice> {
  const fallback = () => context.ongoingActivity ? 'CONTINUE_EXECUTION' : selfChoices(context).includes('NOTHING') ? 'NOTHING' : 'DELIBERATE';
  const scores: NonNullable<Choice['scores']> = [];
  const rank = async (options: string[], selected: string[]) => {
    const results = ActivationScoreSchema.array().parse(await judge(options, selected));
    if (results.length !== options.length || new Set(results.map(r => r.partId)).size !== options.length || results.some(r => !options.includes(r.partId))) throw new InfrastructureError('self', 'Missing, duplicate or unavailable Self score');
    scores.push(...results.map(r => ({ ...r, selectedBefore: [...selected] })));
    return options.map(option => results.find(r => r.partId === option)!).sort((a, b) => b.score - a.score);
  };
  const ranked = await rank(selfChoices(context), []);
  const first = ranked[0]!;
  const selected: string[] = [];
  const bid = context.contributions.find(c => c.bid?.id === first.partId)?.bid;
  let choice = first.partId;
  if (bid?.type === 'navigate') {
    if (first.score > 2) selected.push(bid.id);
    else choice = fallback();
  } else if (bid && bid.type !== 'deliberate') {
    for (const result of ranked) {
      const candidate = context.contributions.find(c => c.bid?.id === result.partId)?.bid;
      if (candidate && candidate.type !== 'deliberate' && candidate.type !== 'navigate' && result.score > 2) selected.push(candidate.id);
    }
    if (!selected.length) choice = fallback();
  }
  return { choice, selectedBidIds: selected, scores,
    explanation: 'All current external bids with independent Self scores strictly above 2/4 are selected in rank order; internal choices remain exclusive.',
    identityConflict: 'Not assessed: bounded Scores do not supply an Identity-conflict explanation.' };
}
