# ADR 0178: correlated bid revision output schemas

Status: Accepted
Date: 2026-10-22

The existing domain contract permits a non-null new_bid exactly when bid_disposition is replace. JSON Schema export omits Zod refinements, so provider generation previously permitted retain/withdraw with a new bid or replace with null. A retained embodiment trial ended with an infrastructure validation failure; this mismatch is a possible failure route, not proof of that historical response's exact contents.

Before exporting provider schemas, represent eligible top-level bid-revision products as three object alternatives: retain/null, withdraw/null and replace/non-null proposal. Preserve every other field, contextual proposal restriction, optional-field semantics and original domain parser. This is wire constraint encoding, not response repair or a new cognitive choice. Disabled primitive bids retain their existing retain/withdraw-only contract. Products without the exact revision fields remain unchanged.

OpenAI and compatible chat adapters keep the root object envelope with the alternatives nested under result, as required by [official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs). Ollama uses the same correlation at its existing unwrapped output boundary. No prompt, inference task, model, routing, token budget, retry, default bid or runtime learning change is introduced. A vendor can still violate an output contract; original parsing must reject rather than coerce its response.

Verify all valid dispositions, invalid combinations, contextual embodied proposal restrictions, optional affect offers, disabled primitives and ordinary schemas. Exercise actual stateless adapter requests with prescribed transports and keep malformed responses as infrastructure failures. These mechanical tests are not evidence of autonomous feeding, affect benefit or human psychology. Historical failed trials remain unchanged; no repeat-until-success trial follows from this fix.
