import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const command = fileURLToPath(new URL('./validate-agent-skills.mjs', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'agent-skills-format-controls-'));
try {
  const cases = [
    ['valid-control', 'name: valid-control\ndescription: Format check\nmetadata:\n  version: "2"', 0],
    ['invalid-name', 'name: Invalid_Name\ndescription: Format check', 1],
    ['missing-description', 'name: missing-description', 1],
    ['nested-metadata', 'name: nested-metadata\ndescription: Format check\nmetadata:\n  evidence:\n    - nested', 1],
    ['numeric-metadata', 'name: numeric-metadata\ndescription: Format check\nmetadata:\n  version: 2', 1],
  ];
  for (const [name, frontmatter, expected] of cases) {
    const directory = join(root, name); mkdirSync(directory);
    writeFileSync(join(directory, 'SKILL.md'), `---\n${frontmatter}\n---\n\nFormat control.\n`);
    const result = spawnSync(process.execPath, [command, directory], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, expected, `${name}: ${result.stderr || result.error || result.stdout}`);
  }
  const missing = spawnSync(process.execPath, [command, join(root, 'valid-control')],
    { encoding: 'utf8', timeout: 30000, env: { ...process.env, SKILLS_REF_BIN: join(root, 'missing-validator') } });
  assert.equal(missing.status, 1); assert.match(missing.stderr, /unavailable/);
  process.stdout.write('Agent Skills format controls passed: valid, invalid name, missing description, nested/numeric metadata, missing validator.\n');
} finally { rmSync(root, { recursive: true, force: true }); }
