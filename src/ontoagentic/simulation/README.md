# Simulation

> **Architectural status: Optional external training/environment subsystem.**
>
> Simulation is not part of the normal OntoAgentic cognitive runtime. The Agent engine must operate without this package.

The OntoAgentic simulation subsystem creates environments and experiences for agents.

## Fundamental boundary

**Simulations create experiences. Agents create psychological meaning.**

The simulation establishes what happens; the agent determines what those experiences mean. Parts, Part activation, and psychological interpretation do not belong to this package.

## Authoritative reality

The simulation owns authoritative external world state, including time, locations, objects, characters, schedules, resources, interactions, and consequences. It may contain substantially more information than any individual agent knows.

## Subjective access

Agents receive only observations available from their position and capabilities. Whether an agent remembers, believes, trusts, doubts, or interprets information belongs to the agent.

## State authority

Generated narration is never authoritative merely because an LLM said something happened. Proposed changes must be validated and applied through structured simulation mechanisms; narration describes resulting reality.

## Scalability of realism

Realism should emerge from replaceable systems such as time, schedules, weather, social structures, economics, health, communication, institutions, transportation, reputation, and obligations.
