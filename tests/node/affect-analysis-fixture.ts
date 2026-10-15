import { MockDecisions, MockReasoning, MockEmbeddings } from '../../packages/providers/src/mock.js';
import type { AffectSelectionContext, AffectChoice } from '../../packages/core/src/affect-domain.js';
import type { SelfContext } from '../../packages/core/src/domain.js';
import type { FocusedBidContext } from '../../packages/core/src/contracts.js';
import { PartGenerationSchema, type ConstructedInput } from '../../packages/core/src/constructed-domain.js';
import { Application } from '../../packages/sdk/src/application.js';
import { SqliteStore } from '../../packages/storage/src/sqlite.js';

// Authored deterministic inspection fixtures, not psychological hypothesis validation.
export function affectFixture(store: SqliteStore) {
  class Decisions extends MockDecisions {
    mode: AffectChoice['mode'] = 'select';
    override async chooseAffect(context: AffectSelectionContext): Promise<AffectChoice> {
      return { mode: this.mode, selectedProposalIds: this.mode === 'select' ? [context.proposals[0]!.id] : [], reason: 'Explicit inspection fixture selection' };
    }
    override async choose(context: SelfContext) {
      const bid = context.contributions.find(item => item.bid)?.bid;
      return bid ? { choice: bid.id, selectedBidIds: [bid.id], explanation: 'Explicit inspection fixture arbitration', identityConflict: '' } : super.choose(context);
    }
  }
  class Reasoning extends MockReasoning {
    fail = false;
    override async constructed(input: ConstructedInput) {
      const value = await super.constructed(input); if (input.task !== 'part_cognition') return value;
      const product = PartGenerationSchema.parse(value);
      product.cognition.affect = 'Sadness alongside curiosity';
      product.cognition.affectProposals = [{ orientation: 'Careful curiosity', motivation: 'Understand while caring', reason: 'Inspect a competing interpretation',
        expectedValue: 'Meaningful inquiry', supportingPredictionIds: [] }];
      product.cognition.proposal = { action: { kind: 'say', text: 'Original recommendation' }, argument: 'Original fixture bid', identityFit: [], executionOrder: [] };
      return product;
    }
    override async reviseFocusedBid(context: FocusedBidContext) {
      if (this.fail) throw new Error('Inspection fixture failure');
      return { response: `Reconsider ${context.selectedFocus.proposals[0]!.orientation}`, bid_disposition: 'replace' as const,
        new_bid: { action: { kind: 'say' as const, text: 'Revised recommendation' }, argument: 'Focused fixture bid', identityFit: [], executionOrder: [] } };
    }
  }
  const decisions = new Decisions(); const reasoning = new Reasoning();
  return { app: new Application(store, { decisions, reasoning, embeddings: new MockEmbeddings() }), decisions, reasoning };
}
