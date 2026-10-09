# Prediction Context

When a Part commits a prediction, it selects relevant details from the current experience before bounded recent context decays. This prospective experience capsule may preserve:

- expectation and the Part's interpretation;
- salient words, tone, behavior, reactions, setting, or entities;
- activation level and activation change/spike context;
- uncertainty or confidence;
- expected horizon;
- opaque WorldState/recent-history/experience references.

This is subjective, Part-selected context, not a copy of full objective WorldState. It is later used with new evidence for evaluation and may anchor episodic encoding. Ordinary evaluation relies on the preserved capsule rather than rereading objective history. Exact structure remains experimental.
