import { freeze, now, type Bid, type Contribution } from './domain.js';
import type { PartContext } from './contracts.js';

export type PendingBidStatus = 'available' | 'needs_review' | 'superseded' | 'withdrawn' | 'selected' | 'expired' | 'rejected';
export type PendingBidRecord = {
  bidId: string; revision: number; partId: string; partVersion: number; scopeId: string;
  threadId: string | null; sourceWorldId: string; sourceCycleId: string;
  reviewedWorldId: string; submittedAt: string; updatedAt: string; status: PendingBidStatus;
  bid: Bid; reason: string; sourceJobId: string | null; activationEventId: string | null;
  supportsBidId?: string;
  expressed?: Omit<Contribution, 'bid'>;
};
export type PoolEntry = { context: PartContext; contribution: Contribution; record: PendingBidRecord | null };

export function contributionScope(context: PartContext): string {
  return context.part.instance?.dispositionBindings?.[0]?.dispositionId ?? '__identity_fallback__';
}

export function deduplicateActionBids(contributions: Contribution[]): void {
  const representatives = new Map<string, string>();
  for (const contribution of contributions) {
    const bid = contribution.bid;
    if (!bid?.action) continue;
    delete contribution.supportingBidId;
    const key = JSON.stringify(bid.action);
    const representative = representatives.get(key);
    if (representative) { contribution.supportingBidId = representative; contribution.bid = null; }
    else representatives.set(key, bid.id);
  }
}

/** A bounded collection of expressed proposals, with no motivation or selection authority. */
export class BidPool {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly latestRecords = new Map<string, PendingBidRecord>();
  private readonly selectedActions = new Map<string, Map<string, string>>();
  revision = 0;
  consideredRevision = 0;
  constructor(private readonly recordEvent: (record: PendingBidRecord) => void, private readonly hold: (partId: string, retained: boolean) => void) {}
  private record(record: PendingBidRecord): void { this.latestRecords.set(record.bidId, record); this.recordEvent(record); }
  selectedAt(bidId: string, worldId: string): boolean {
    const record = this.latestRecords.get(bidId);
    return record?.status === 'selected' && record.reviewedWorldId === worldId;
  }
  rejectSelection(bidId: string, reason: string): void {
    const record = this.latestRecords.get(bidId);
    if (record?.status === 'selected') this.record(freeze({ ...record, revision: record.revision + 1, status: 'rejected', updatedAt: now(), reason }));
  }

  values(): PoolEntry[] { return [...this.entries.values()]; }
  get(scopeId: string): PoolEntry | undefined { return this.entries.get(scopeId); }
  reviewed(entry: PoolEntry, context: PartContext, contribution: Contribution): void {
    entry.context = context; entry.contribution = freeze(contribution);
    if (entry.record && contribution.bid) this.transition(entry, 'available', 'Owning Part retained its recommendation after later experience', context.world.id);
    else this.revision++;
  }

  publish(context: PartContext, contribution: Contribution, sourceJobId: string | null, activationEventId: string | null): void {
    const scopeId = contributionScope(context);
    const prior = this.entries.get(scopeId);
    // A late job cannot replace a contribution grounded in newer experience.
    if (prior && prior.context.world.sequence > context.world.sequence) {
      if (contribution.bid) this.record(this.newRecord(context, contribution.bid, sourceJobId, activationEventId, 'superseded', 'A newer scope contribution is already recorded', contribution));
      return;
    }
    if (prior?.record && ['available', 'needs_review'].includes(prior.record.status))
      this.transition(prior, 'superseded', 'A newer expressed contribution replaced this scope proposal');
    if (prior) this.hold(prior.context.part.id, false);
    const entry: PoolEntry = { context, contribution: freeze(structuredClone(contribution)),
      record: contribution.bid ? this.newRecord(context, contribution.bid, sourceJobId, activationEventId, 'available', 'Owning Part expressed a proposal', contribution) : null };
    const supporting = contribution.bid?.action ? this.selectedActions.get(context.world.id)?.get(JSON.stringify(contribution.bid.action)) : undefined;
    if (supporting && entry.record) {
      entry.record = freeze({ ...entry.record, status: 'selected', supportsBidId: supporting,
        reason: 'This identical action was already selected for this snapshot; preserve support without a second submission' });
      entry.contribution = freeze({ ...entry.contribution, supportingBidId: supporting, bid: null });
    }
    this.entries.set(scopeId, entry); this.revision++;
    this.hold(context.part.id, Boolean(entry.contribution.bid || entry.contribution.affectProposals?.length));
    if (entry.record) this.record(entry.record);
  }

  private newRecord(context: PartContext, bid: Bid, sourceJobId: string | null, activationEventId: string | null,
    status: PendingBidStatus, reason: string, contribution: Contribution): PendingBidRecord {
    const at = now();
    const { bid: _bid, ...expressed } = contribution;
    return freeze({ bidId: bid.id, revision: 1, partId: context.part.id, partVersion: context.part.version,
      scopeId: contributionScope(context), threadId: context.part.instance?.threadId ?? null,
      sourceWorldId: context.world.id, sourceCycleId: context.world.cycleId, reviewedWorldId: context.world.id,
      submittedAt: at, updatedAt: at, status, bid: structuredClone(bid), reason, sourceJobId, activationEventId, expressed });
  }

  restore(context: PartContext, record: PendingBidRecord): void {
    const expressed = record.expressed ?? { partId: context.part.id, name: context.part.name,
      thought: record.bid.argument, interpretation: record.bid.argument, evidenceSummary: [], prediction: null };
    const restored: PoolEntry = { context, contribution: freeze({ ...expressed, bid: record.bid }), record };
    this.entries.set(record.scopeId, restored); this.hold(context.part.id, true);
    this.transition(restored, 'needs_review', 'Recovered pending proposal; renewed owning-Part review is required before selection');
  }

  transition(entry: PoolEntry, status: PendingBidStatus, reason: string, reviewedWorldId?: string, supportsBidId?: string): void {
    if (!entry.record) return;
    entry.record = freeze({ ...entry.record, revision: entry.record.revision + 1, updatedAt: now(), status, reason,
      ...(reviewedWorldId ? { reviewedWorldId } : {}), ...(supportsBidId ? { supportsBidId } : {}) });
    this.record(entry.record); this.revision++;
    if (status === 'selected' && entry.record.bid.action) {
      let actions = this.selectedActions.get(entry.record.reviewedWorldId);
      if (!actions) { actions = new Map(); this.selectedActions.set(entry.record.reviewedWorldId, actions); }
      if (!actions.has(JSON.stringify(entry.record.bid.action))) actions.set(JSON.stringify(entry.record.bid.action), entry.record.bidId);
      if (this.selectedActions.size > 16) this.selectedActions.delete(this.selectedActions.keys().next().value!);
    }
    if (!['available', 'needs_review'].includes(status)) {
      entry.contribution = freeze({ ...entry.contribution, bid: null });
      this.hold(entry.context.part.id, false);
    }
  }

  /** Only reviewed current proposals are selectable; exact duplicate actions retain attributed support. */
  snapshot(worldId: string) {
    const contexts = new Map<string, PartContext>();
    const contributions = this.values().map(entry => {
      contexts.set(entry.context.part.id, entry.context);
      const contribution = structuredClone(entry.contribution);
      const alreadySelected = contribution.bid?.action ? this.selectedActions.get(worldId)?.get(JSON.stringify(contribution.bid.action)) : undefined;
      if (alreadySelected && entry.record?.reviewedWorldId === worldId) {
        this.transition(entry, 'selected', 'The identical action was already selected for this snapshot', worldId, alreadySelected);
        contribution.bid = null; contribution.supportingBidId = alreadySelected;
      }
      if (entry.record && (entry.record.status !== 'available' || entry.record.reviewedWorldId !== worldId)) contribution.bid = null;
      if (entry.context.world.id !== worldId) contribution.affectProposals = [];
      return contribution;
    });
    deduplicateActionBids(contributions);
    return { contributions, contexts, worldId, revision: this.revision, entries: new Map(this.entries) };
  }

  settle(contributions: Contribution[], selectedIds: Set<string>, snapshot: ReturnType<BidPool['snapshot']>, clearAffect = true): void {
    const unchanged = this.revision === snapshot.revision;
    // Arrivals during Self remain for the next decision; update only exact captured bid versions.
    for (const contribution of contributions) {
      const entry = this.values().find(entry => entry.context.part.id === contribution.partId);
      if (!entry || (snapshot.entries.get(contributionScope(entry.context)) !== entry
        && !selectedIds.has(entry.contribution.bid?.id ?? ''))) continue;
      if (contribution.bid && entry.contribution.bid?.id !== contribution.bid.id) {
        this.transition(entry, 'superseded', 'Owning Part revised its proposal during inquiry');
        this.publish(entry.context, contribution, entry.record?.sourceJobId ?? null, entry.record?.activationEventId ?? null);
        const revised = this.get(contributionScope(entry.context))!;
        if (selectedIds.has(contribution.bid.id)) this.transition(revised, 'selected', 'Self selected the revised proposal');
        continue;
      }
      if (contribution.supportingBidId && selectedIds.has(contribution.supportingBidId))
        this.transition(entry, 'selected', 'Self selected the identical action represented by the cited supporting bid', undefined, contribution.supportingBidId);
      else if (contribution.bid && selectedIds.has(contribution.bid.id)) this.transition(entry, 'selected', 'Self selected this expressed proposal');
      else if (entry.record?.status === 'available' && entry.record.reviewedWorldId === snapshot.worldId && entry.contribution.bid && !contribution.bid && !contribution.supportingBidId)
        this.transition(entry, 'withdrawn', 'The owning Part withdrew its proposal during inquiry');
      if (clearAffect) entry.contribution = freeze({ ...entry.contribution, affectProposals: [] });
      this.hold(entry.context.part.id, Boolean(entry.contribution.bid || entry.contribution.affectProposals?.length));
    }
    for (const [scopeId, entry] of snapshot.entries) {
      if (this.entries.get(scopeId) === entry && !entry.contribution.bid && !entry.contribution.affectProposals?.length) this.entries.delete(scopeId);
    }
    this.consideredRevision = unchanged ? this.revision : Math.max(this.consideredRevision, snapshot.revision);
  }
}
