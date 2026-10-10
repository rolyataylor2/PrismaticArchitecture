import type { McpRegistry, McpPermissions, McpServerConfig } from '../../../packages/core/src/mcp-configuration.js';
import type { McpRepositoryPreview } from '../../../packages/sdk/src/mcp-repository.js';
type Api = <T>(path: string, method?: string, data?: unknown) => Promise<T>;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
export function showMcpRegistration(dialog: HTMLDialogElement, api: Api, path: string, registry: McpRegistry, permissions: McpPermissions,
  registered: (result: { registry: McpRegistry; permissions: McpPermissions }) => void) {
  dialog.setAttribute('aria-label', 'Register MCP connection');
  const header = el('div'); header.className = 'modal-header'; header.append(el('h3', 'Register MCP connection'));
  const close = el('button', 'Close'); close.onclick = () => dialog.close(); header.append(close);
  const body = el('div'); body.className = 'modal-body'; dialog.append(header, body);
  const button = (title: string, run: () => void | Promise<void>) => {
    const node = el('button', title); node.type = 'button'; node.onclick = () => { node.disabled = true; void Promise.resolve().then(run).catch(error => {
      errorText.textContent = error instanceof Error ? error.message : String(error);
    }).finally(() => { node.disabled = false; }); }; body.append(node); return node;
  };
  const errorText = el('p'); errorText.setAttribute('role', 'alert');
  const field = (title: string, value = '', multiline = false) => {
    const label = el('label', title); const control = multiline ? el('textarea') : el('input'); control.value = value; label.append(control); body.append(label); return control;
  };
  const select = (title: string, options: string[]) => {
    const label = el('label', title); const control = el('select'); for (const value of options) { const option = el('option', value); option.value = value; control.append(option); }
    label.append(control); body.append(label); return control;
  };
  const reset = (step: string) => { body.replaceChildren(el('p', step), errorText); errorText.textContent = ''; };
  const submit = async (data: { server?: McpServerConfig; serverId?: string }) => {
    const result = await api<{ registry: McpRegistry; permissions: McpPermissions }>(`${path}/mcp-connections`, 'POST', {
      expectedRegistryRevision: registry.revision, expectedPermissionRevision: permissions.revision, ...data });
    registered(result); dialog.close();
  };
  const details = (initial?: McpServerConfig, notes: string[] = []) => {
    reset('Step 2: Review connection settings'); for (const note of notes) body.append(el('p', note));
    const id = field('Server name', initial?.id);
    const transport = select('Transport', ['http', 'stdio']); transport.value = initial?.transport ?? 'http';
    const endpoint = field('HTTP endpoint', initial?.transport === 'http' ? initial.url : '');
    const bearer = field('Bearer secret reference (optional)', initial?.transport === 'http' ? initial.bearerSecretRef : '');
    const command = field('Local command', initial?.transport === 'stdio' ? initial.command : '');
    const args = field('Arguments (one per line)', initial?.transport === 'stdio' ? initial.args.join('\n') : '', true);
    const cwd = field('Working directory (optional)', initial?.transport === 'stdio' ? initial.cwd : '');
    const env = field('Environment secret references (JSON object, optional)', JSON.stringify(initial?.transport === 'stdio' ? initial.envSecretRefs : {}), true);
    const timeout = field('Timeout (ms)', String(initial?.timeoutMs ?? 30000));
    const visibility = () => { for (const item of [endpoint, bearer]) item.closest('label')!.hidden = transport.value !== 'http'; for (const item of [command, args, cwd, env]) item.closest('label')!.hidden = transport.value !== 'stdio'; };
    transport.onchange = visibility; visibility();
    body.append(el('p', 'Use secret references such as env:MY_API_KEY for credentials.'));
    button('Back', methods);
    button('Review registration', () => {
      const common = { id: id.value, timeoutMs: Number(timeout.value) };
      const server: McpServerConfig = transport.value === 'http' ? { ...common, transport: 'http', url: endpoint.value,
        ...(bearer.value ? { bearerSecretRef: bearer.value } : {}) } : { ...common, transport: 'stdio', command: command.value,
        args: args.value.split('\n').filter(Boolean), envSecretRefs: JSON.parse(env.value || '{}'), ...(cwd.value ? { cwd: cwd.value } : {}) };
      if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(server.id)) throw new Error('Enter a server name using letters, numbers, dots, underscores or hyphens.');
      if (server.transport === 'http') { const url = new URL(server.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an HTTP endpoint without embedded credentials.'); }
      else if (!server.command.trim()) throw new Error('Enter a local command.');
      if (registry.servers.some(item => item.id === server.id)) throw new Error('This server name is already registered; choose another name or use the existing connection.');
      reset('Step 3: Confirm registration'); body.append(el('pre', JSON.stringify(server, null, 2)), el('p', 'Adds this connection to the Agent. Tool grants and the Executive switch are configured separately.'));
      button('Back', () => details(server, notes)); button('Register MCP server', () => submit({ server }));
    });
  };
  const lookup = (repository: boolean) => {
    reset('Step 2: Find a public MCP');
    body.append(el('p', repository ? 'Read declared settings from a public GitHub repository.' : 'Search the official MCP Registry.'));
    const query = field(repository ? 'Public repository URL' : 'Search MCP Registry');
    button('Back', methods);
    const results = el('div');
    button(repository ? 'Load repository settings' : 'Search registry', async () => {
      const preview = await api<McpRepositoryPreview>(repository ? 'mcp-repository-preview' : 'mcp-registry-search', 'POST', repository ? { url: query.value } : { query: query.value });
      if (!dialog.open) return; results.replaceChildren();
      for (const note of preview.notes) results.append(el('p', note));
      if (!preview.candidates.length) results.append(el('p', 'No supported settings found. Try another search or specify the connection manually.'));
      for (const candidate of preview.candidates) {
        const row = el('div'); row.append(el('h4', candidate.label)); const link = el('a', 'Source'); link.href = candidate.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link);
        const choose = el('button', 'Review settings'); choose.onclick = () => details(candidate.server, candidate.notes); row.append(choose); results.append(row);
      }
    }); body.append(results);
  };
  function methods() {
    reset('Step 1: Choose a registration method');
    const method = select('Registration method', ['Import from official MCP Registry', 'Specify manually', 'Import from public repository', 'Use a registered connection']);
    button('Continue', () => {
      if (method.value === 'Specify manually') details();
      else if (method.value === 'Use a registered connection') {
        reset('Step 2: Choose a registered connection'); const assigned = new Set([...(permissions.serverIds ?? []), ...permissions.tools.map(tool => tool.serverId)]);
        const available = registry.servers.filter(server => !assigned.has(server.id));
        if (!available.length) body.append(el('p', 'No other registered connections available.'));
        for (const server of available) button(`Add ${server.id}`, () => submit({ serverId: server.id })); button('Back', methods);
      } else lookup(method.value === 'Import from public repository');
    });
  }
  methods(); dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
}
