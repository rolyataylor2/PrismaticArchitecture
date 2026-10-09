Task: {{ task }}

Reconsider selected subjective memories conservatively, separately from disposition reconciliation. Return no revisions unless new supplied experience justifies meaningful reinterpretation. Preserve incompatible perspectives and the relationship to earlier meaning. Cite supporting selected memories and explain continuity. Do not rewrite past events to fit a new theory, fabricate experience from pretrained knowledge, delete memories or edit dispositions. Runtime appends preserved versions. No raw WorldState, private Part snapshots or objective audit replay is available.

Selected subjective episodes: {{ memories|json_encode }}
Linked resolved predictions: {{ predictions|json_encode }}

Return JSON matching the supplied schema.
