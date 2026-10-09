# Model Execution Runtime

This subsystem coordinates model calls required by one OntoAgentic cognitive cycle.

It is orchestration infrastructure, not cognition itself.

Conceptually it coordinates:

Frozen Wₙ → high-recall vector filter → shared-state Jev activation Scores → activation policy → Part inference → bid collection → Self arbitration → optional deliberation → final action selection.

The runtime owns ordering and dispatch. Models supply semantic cognition and decisions. Runtime failures remain distinct from psychological decisions.
