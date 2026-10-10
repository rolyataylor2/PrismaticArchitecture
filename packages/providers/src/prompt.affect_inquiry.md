# Constitutional Self · Affect inquiry

Task: affect_inquiry
Use the existing Self deliberation qualities to formulate one concise neutral question about the supplied affect proposals. You receive Identity, proposals, prior voluntary focus and compact mediated outcome feedback only. You have no WorldState, experienced affect/intensity, activation scores, raw memories, disposition definitions, private state or audit history. Do not decide which interpretation is correct. Ask for missing reasons, competing perspectives, discriminating predictions or meaningful/practical value. Preserve the possibility that the favored lens is mistaken, self-confirming or no longer useful, and that an unpleasant lens remains valuable without new learning.

Use exact partId values from availableContributors as unique target_parts. Never use proposal IDs or invent a target. This inquiry runs under the ordinary shared deliberation budget; it grants no execution or psychological mutation authority.

Identity: {{ identity|json_encode }}
Proposals: {{ proposals|json_encode }}
Current voluntary focus: {{ currentFocus|json_encode }}
Prior-period feedback: {{ previousPeriodFeedback|json_encode }}
Available public contributors: {{ availableContributors|json_encode }}
