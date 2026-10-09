import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Structural lint supplements strict TypeScript/noUnused checks with dependency boundaries.
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.name.endsWith('.ts')) result.push(path);
  }
  return result;
}
const violations = [];
for (const path of await files('packages/core/src')) {
  const text = await readFile(path, 'utf8');
  if (/from\s+['"][^'"]*(?:providers|storage|sdk|simulation|apps)\//.test(text)) violations.push(`${path}: core depends on an outer implementation`);
  if (/from\s+['"](?:node:sqlite|openai|@anthropic-ai|any-llm|jev)/.test(text)) violations.push(`${path}: vendor/persistence dependency crosses the domain boundary`);
}
for (const root of ['packages', 'apps']) for (const path of await files(root)) {
  const text = await readFile(path, 'utf8');
  if (/from\s+['"][^'"]*(?:tests\/|historical\/)/.test(text)) violations.push(`${path}: production imports a historical test fixture`);
  if (/^\s*(?:<<<<<<<|=======|>>>>>>>)/m.test(text)) violations.push(`${path}: unresolved conflict marker`);
}
if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
else console.log('Strict TypeScript and architectural dependency lint passed.');
