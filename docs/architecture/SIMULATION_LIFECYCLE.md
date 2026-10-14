# Simulation Lifecycle

The Prism Agent Architecture simulations maintain external worlds in which agents can have experiences.

1. **World state:** The simulation maintains authoritative external reality.
2. **Time and systems:** World systems may advance time or produce changes independently of a particular Agent action.
3. **Storylet eligibility:** Authored situations may become possible when world conditions are satisfied; eligibility need not force one predetermined branch.
4. **Event:** Something occurs in the authoritative world.
5. **Perception:** The simulation determines what information is available to each participant; participants may receive different observations.
6. **Agent cognition:** The Agent interprets its observation internally, outside the simulation subsystem.
7. **Attempted action:** The Agent returns an attempted action.
8. **Validation:** The simulation determines whether and how the action can occur.
9. **State transition:** Accepted consequences modify authoritative world state.
10. **Event recording:** What actually occurred becomes part of simulation history.
11. **Narration:** Authoritative events may be rendered into language or another presentation. Narration is downstream from reality and must not silently create it.
12. **Continued simulation:** World systems, schedules, storylets, Agents, and time continue interacting. The architecture should support short experiments and extremely long simulated lives.

## Rejected consolidation proposals

A structural proposal blocked by citation, evidence or lifecycle policy is recorded as `disposition.reconciliation_rejected`, with the proposal and reason. It does not mutate the rejected structure or fail sleep or the surrounding simulation. Other valid proposals and ordinary memory reinterpretation continue. Provider, malformed-output, storage and stale-version failures remain failures.
