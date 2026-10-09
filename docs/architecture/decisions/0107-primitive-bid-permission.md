# ADR 0107: Per-primitive bid permission

Status: Accepted
Date: 2026-10-01
Extends ADRs 0104 and 0106.

Each primitive has a researcher-editable bidsEnabled setting, defaulting to true for existing and factory definitions. Disabling bids preserves independent activation scoring, surfacing, thoughts and participation in Self inquiry. It does not suppress appraisal or grant authority to another contributor.

A disabled primitive contributes no proposal and no bid. Its cognition provider is instructed and output-constrained to return a null proposal. Runtime also discards any proposed bid from a disabled primitive. During inquiry it may answer but cannot replace an absent bid; provider constraints and runtime enforcement keep new_bid null. Changes apply through the ordinary per-Agent primitive settings revision and are captured in the cycle configuration, not applied midway through cognition. Reset restores the factory/custom creation setting; configuration and audit history remain preserved.

Self remains world-blind and selects only available bids. If no bid exists, existing deliberation and round limits apply; no substitute action is invented. Provider routing and task catalog remain unchanged. Dedicated primitive prompts reflect the permission; Settings → Prompts tasks retain their existing responsibilities.
