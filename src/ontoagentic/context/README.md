# Inference Context

This subsystem concerns preparation of information supplied to inference systems.

It does not own cognition.

Its purpose is to efficiently assemble consistent context for:

- activation;
- Part evaluation;
- Self deliberation;
- prediction evaluation.

A major requirement is preserving strict context boundaries between cognitive roles.

In particular:

WorldState is available to the Activator and activated Parts.

WorldState is not available to Self.

Context optimization must never violate this boundary.
