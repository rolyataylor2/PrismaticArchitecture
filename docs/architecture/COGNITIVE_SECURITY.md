# Cognitive Security

The Prism Agent Architecture's cognitive boundaries may also provide useful security boundaries. This document describes architectural possibilities rather than a finished security design.

## Raw external input

Externally supplied language may contain ordinary information, misleading claims, adversarial instructions, or attempts to redirect behavior. A whole-agent decision context does not necessarily need direct access to every raw external token.

## Mediated context

The Prism Agent Architecture should permit configurations where external input is first processed through perception or relevant Parts, after which Self receives bounded internal observations, concerns, or proposals. This may reduce direct exposure of final decision inference to hostile external language. It is an architectural capability, not a mandated default.

## No trusted-Part assumption

Parts are biased cognitive entities and may misunderstand or distort information. They are not trusted security principals merely because they are internal.

## Audit separation

Privileged developer or researcher audit information should not automatically enter cognitive context. Inspection authority and cognitive authority are different concepts.

## Replaceability

Sanitization, content boundaries, capability permissions, prompt-injection resistance, and external-input validation remain implementation questions. Security requirements must preserve the cognitive architecture rather than bypassing it.
