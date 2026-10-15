# ADR 0171: Per-Agent provider connections

Status: Accepted, 2026-10-15.
Source: Researcher request for a provider list with an Add row containing a provider selector and API key.

Model settings begins with the Agent's available provider connections: OpenAI, xAI, JEV and Cloudflare. Adding or updating a connection stores a vault-encrypted credential scoped to that Agent and provider, independently of selected models. It does not invoke inference or verify vendor access. Available server credentials are labeled separately. Removing an Agent key preserves server configuration, model selections and unrelated providers.

Existing key entry endpoints remain compatible and update their corresponding provider connection. Legacy saved credentials remain available until replaced or removed. Inference resolves provider connections before legacy credentials, then the corresponding server key. Generative models, JEV classifiers and Cloudflare image generation retain their existing responsibilities, model selection and access boundaries. Cloudflare still requires its separate Account ID. No new cognitive role or inference task is added; existing factory prompts and task catalog remain appropriate.

Connections copy with the existing Agent-branch mechanism and are removed by complete Agent deletion. Public settings return credential presence only. Schema 30 stores encrypted connections separately from cognitive state. Validation covers provider isolation, switching models without losing keys, classifier/image use, secret exclusion, removal, restart and the responsive provider-list UI.

Selecting Cloudflare in the Add provider row reveals a required 32-character Account ID field alongside the API key. Both are saved together; the existing image-generation settings use the saved Account ID and key. Provider rows display the saved Account ID, while secrets remain hidden.
