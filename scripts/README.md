# Scripts

This directory contains repository maintenance, development, migration, and bootstrap scripts.

Scripts should not contain core cognitive logic. Anything required for normal cognitive behavior belongs in the The Prism Agent Architecture package.

The build asset-copy step includes the Identity question library and shared answer guidance in `dist/presets/identities` so compiled services use the same catalog as source services.

`npx tsx scripts/populate-retrieval-keys.ts` explicitly appends researcher-edit versions for known seed Parts and the local Fear of dogs Part lacking keys. It respects PRISM_DB, skips authored keys and unknown Parts, and rejects active cognition/consolidation.

`npm run validate:skills -- <skill-directory> ...` invokes the official Agent Skills `skills-ref validate` development validator for each explicit directory. Install `skills-ref` separately and optionally set `SKILLS_REF_BIN` to its executable; a missing validator, invalid package or timeout fails the command. It does not install dependencies, infer, execute packaged scripts or change approval. The reference project describes itself as a demonstration library, so it is not a production runtime dependency. For reproducible checks, install a pinned official repository revision in a separate Python virtual environment.

`npm run validate:skills-controls` exercises one valid package, invalid names/missing descriptions, nested/numeric metadata and an unavailable validator. A working real reference validator is required for the positive control; a missing installation cannot masquerade as passed negative checks. The validation command checks the original YAML metadata nodes because the pinned reference parser converts metadata values to strings. The `yaml` parser is also used by runtime package format validation; the reference executable remains development-only.

`npx tsx scripts/run-affect-experiments.ts fixture [output-directory] [test-id]` runs all eight sourced affect scenarios on separate fresh Agents, preserves SQLite and full JSON reports, and reports mock abstention as inconclusive. `configured` uses configured providers and may incur inference costs; it never silently substitutes models. Starting concerns and external experiences are authored in the shared Simulation Tests registry. The script explicitly disables automatic evaluation so the preserved cognition and report settle before database shutdown; saved runs can be assessed separately through Simulation Tests. It contains no cognitive logic and does not alter an existing source Agent. To inspect a saved database in the browser, start the server with PRISM_DB set to its research.sqlite path.
