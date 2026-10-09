import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentSkillPackage } from '../../packages/core/src/agent-skill-format.js';

test('standard package parsing preserves generic instructions and resources without granting tool authority', () => {
  const files = { 'SKILL.md': '---\nname: example\ndescription: |\n  Apply a reusable procedure.\nmetadata:\n  version: "2"\nallowed-tools: unrestricted\n---\n\nFollow current instructions.\n',
    'scripts/example.sh': 'exit 99', 'references/notes.md': 'Development notes' };
  const parsed = parseAgentSkillPackage('example', files);
  assert.deepEqual(parsed.files, files); assert.match(parsed.instructions, /Follow current/);
  assert.equal(parsed.frontmatter.metadata?.version, '2');
  assert.equal(parsed.frontmatter['allowed-tools'], 'unrestricted');
  assert.equal(parsed.digest, parseAgentSkillPackage('example', Object.fromEntries(Object.entries(files).reverse())).digest);
  for (const metadata of ['version: 2', 'evidence:\n    - nested'])
    assert.throws(() => parseAgentSkillPackage('example', { 'SKILL.md': `---\nname: example\ndescription: Example\nmetadata:\n  ${metadata}\n---\n` }), /metadata/);
  assert.throws(() => parseAgentSkillPackage('different', files), /directory/);
  assert.throws(() => parseAgentSkillPackage('example', { ...files, '../outside': 'Forbidden' }), /relative/);
  assert.throws(() => parseAgentSkillPackage('example', { 'SKILL.md': 'No frontmatter' }), /frontmatter/);
});
