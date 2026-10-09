# Simulation Boundary

Simulation is an optional external environment and training system. The Agent engine functions without it.

The Agent engine owns WorldState intake, activation, Part cognition, bidding, Self selection, Identity access, action selection, prediction evaluation, and Part development. Simulation owns an artificial world: facts, time, locations, NPCs, rules, action validation, and consequences.

Simulation does not own Parts, Identity, Self, bidding, activation, Part development, or psychological interpretation.

```text
Simulation → WorldState → Agent Engine → Action → Simulation
```

Simulation presents facts; the Agent responds; simulation applies consequences; those consequences become later WorldState. It is one of several possible environment adapters and is especially useful for controlled training, replay, and developmental experiments.
