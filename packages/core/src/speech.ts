import { freeze, SpeechContextSchema, type ActionBid, type Identity, type SpeechContext } from './domain.js';

/** Exact researcher tag; no inferred relevance or private cognitive state. */
export function speechContext(identity: Identity, bids: ActionBid[]): SpeechContext {
  if (!bids.length || bids.some(bid => bid.action.kind !== 'say' && bid.action.kind !== 'ask')) throw new Error('Speech realization requires selected Say or Ask commands');
  return freeze(SpeechContextSchema.parse({ agentId: identity.agentId,
    speechTraits: identity.traits.filter(trait => trait.keywords.some(keyword => keyword.trim().toLowerCase() === 'speech')),
    commands: bids.map(bid => ({ bidId: bid.id, text: bid.action.text, argument: bid.argument })),
  }));
}
