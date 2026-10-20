import type { Proposal, WorldState } from './domain.js';
import { InfrastructureError } from './contracts.js';

/** Validate structured authority, rather than guessing whether prose knows a game rule. */
export function validateActionSpace(world: WorldState, proposal: Proposal | null | undefined): void {
  if (world.embodied && proposal?.action?.kind === 'operate')
    throw new InfrastructureError('cognition', 'Embodied proposals express natural intentions; mechanical operations are Executive-only');
  if (world.embodied && proposal?.action && proposal.action.kind !== 'act')
    throw new InfrastructureError('cognition', 'Embodied speech, questions and waiting require natural act intentions; chat-only actions bypass the body');
  if (!world.embodied && proposal?.action?.kind === 'act')
    throw new InfrastructureError('cognition', 'Natural physical actions require a host-bound embodied action space');
}
