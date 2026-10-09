# ADR 0012: Identity Perception Is Configurable

Status: Superseded by ADR 0033.

## Decision
Historically, this ADR treated direct Identity perception as configurable. ADR 0033 now requires Self and Identity to remain WorldState-blind.

## Reason
Part-mediated interpretation remains important; Self may question differently biased Parts while consulting Identity.

## Consequences
This historical consequence is superseded: current designs must keep WorldState access mediated to Self through Parts or other explicitly mediated interfaces.

## Flexible implementation
Observation interfaces and the default mode remain undecided.
