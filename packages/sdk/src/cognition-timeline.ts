import type { CognitiveEvent } from '../../core/src/contracts.js';

export type CognitionTimelineRow = { eventId: string; cycleId: string | null; at: string; sequence: number;
  phase: string; status: string; summary: string };

/** Researcher-only chronology of recorded transitions, never an inference about mental strength or success. */
export function cognitionTimeline(events: CognitiveEvent[]): CognitionTimelineRow[] {
  const scopes = new Map(events.flatMap(event => event.type === 'construction.eligibility'
    ? event.payload.scopes.map(scope => [scope.dispositionId, scope.name] as const) : []));
  return events.flatMap(event => {
    let row: Pick<CognitionTimelineRow, 'phase' | 'status' | 'summary'>;
    if (event.type === 'cognition.inquiry_deferred') row = { phase: 'Part inquiry', status: 'deferred', summary: event.payload.reason };
    else if (event.type === 'cognition.resources') row = { phase: 'Reasoning resources', status: event.payload.reason === 'repeated_prediction_contradiction' ? 'history escalation' : 'workload assessment',
      summary: `${event.payload.model} · ${event.payload.assessment.difficulty} · ${event.payload.assessment.uncertainty} uncertainty · ${event.payload.assessment.urgency}. ${event.payload.assessment.reason}` };
    else if (event.type === 'cognition.job') row = { phase: 'Reasoning', status: event.payload.status,
      summary: `${scopes.get(event.payload.dispositionId) ?? (event.payload.dispositionId === '__identity_fallback__' ? 'Identity fallback perspective' : 'Recorded scope')} · independent job ${event.payload.status}.` };
    else if (event.type === 'cognition.bid') row = { phase: 'Proposal',
      status: event.payload.supportsBidId ? 'supporting selected action' : event.payload.status,
      summary: `${event.payload.expressed?.name ?? 'Owning Part'} · revision ${event.payload.revision} · ${event.payload.reason}` };
    else if (event.type === 'self.commitment') row = { phase: 'Self choice', status: event.payload.status,
      summary: event.payload.proposals.map(proposal => `${proposal.kind}: ${proposal.text}`).join(' · ') };
    else if (event.type === 'self.affect_committed') row = { phase: 'Chosen focus', status: event.payload.offersConsidered ? 'considered' : 'carried',
      summary: `Choice epoch ${event.payload.record.sequence} · ${event.payload.record.focusAfter?.proposals.map(proposal => proposal.orientation).join(' · ') ?? 'No voluntary focus'}` };
    else if (event.type === 'execution.applicability_checked') row = { phase: 'External conditions', status: event.payload.admitted ? 'supported' : 'unverified',
      summary: event.payload.conditions.map(condition => `${condition.condition}: ${condition.score ?? 'unmeasured'} / 4`).join(' · ') };
    else if (event.type === 'execution.bid_rejected') row = { phase: 'Submission', status: 'rejected', summary: event.payload.reason };
    else if (event.type === 'execution.status') row = { phase: 'External report', status: event.payload.status,
      summary: `${event.payload.action.kind}: ${event.payload.action.text}${event.payload.action.kind === 'operate' ? ` · Independent verification ${event.payload.operational?.verified ? 'recorded' : 'not established'}` : ''}` };
    else if (event.type === 'cognition.stream') row = { phase: 'Activation', status: event.payload.status,
      summary: `${event.payload.passCount} recorded passes · ${event.payload.passLimit === null ? 'unlimited allowance' : `allowance ${event.payload.passLimit}`} · ${event.payload.reason}` };
    else return [];
    return [{ eventId: event.id, cycleId: event.cycleId, at: event.at, sequence: event.sequence, ...row }];
  }).sort((a, b) => a.sequence - b.sequence);
}
