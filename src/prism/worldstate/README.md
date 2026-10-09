# WorldState

WorldState represents objective fact-based information available to the Prism Agent Architecture cognitive engine. It is psychologically neutral: it describes what is externally true or presented as externally available.

It does not contain Agent goals, Part missions, emotional interpretation, psychological salience, recommendations, desired outcomes, action preferences, identity congruence, or narrative meaning.

Examples include entities, locations, observable actions, received messages, time, environmental conditions, and factual records. A message may be represented as the fact that it was received; the WorldState layer does not decide what it means psychologically. Bounded recent factual context may also record recent cognitive and execution events with their source, such as which Part proposed an action, what Self selected, an external operation's status, or which sequence step completed. While this context remains available, a Part may preserve details it considers relevant in its prediction capsule; later ordinary evaluation uses that preserved context after recent history decays. Recording that a Part said something does not make its subjective claim objective truth. Do not collapse distinct Part outputs into one canonical Agent belief or place the entire history in every snapshot.

WorldState may originate from chat, applications, tools, physical interfaces, games, simulations, tests, or manually constructed scenarios. The Activator may compare it with Part trigger patterns; interpretation begins in Parts.

For one cognitive cycle, create one immutable snapshot, serialize it canonically once, and reuse that exact representation for every activated Part. Do not reconstruct, independently query, or psychologically summarize WorldState per Part. If the environment changes during cognition, create a snapshot for a future cycle.

Stable facts should remain in stable serialization locations where feasible, followed by changing conditions, recent changes, and the current incoming event. This may improve cache-prefix reuse without omitting or distorting facts. See [`snapshot/README.md`](snapshot/README.md) for snapshot guidance.
