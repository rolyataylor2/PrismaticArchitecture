import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { parseDocument, isMap, isScalar } from 'yaml';

const directories = process.argv.slice(2);
if (!directories.length) {
  process.stderr.write('Usage: npm run validate:skills -- <skill-directory> [<skill-directory> ...]\nInstall the official skills-ref development validator and optionally set SKILLS_REF_BIN.\n');
  process.exitCode = 1;
} else {
  for (const directory of directories) {
    try {
      const executable = process.env.SKILLS_REF_BIN ?? 'skills-ref';
      const options = { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 };
      const output = execFileSync(executable, ['validate', resolve(directory)], options);
      const contents = readFileSync(resolve(directory, 'SKILL.md'), 'utf8');
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(contents);
      if (!frontmatter) throw new Error('Agent Skills requires YAML frontmatter');
      const document = parseDocument(frontmatter[1]);
      if (document.errors.length) throw new Error(document.errors[0].message);
      const metadata = document.get('metadata', true);
      if (metadata !== undefined && (!isMap(metadata) || metadata.items.some(({ key, value }) =>
        !isScalar(key) || typeof key.value !== 'string' || !isScalar(value) || typeof value.value !== 'string')))
        throw new Error('Agent Skills metadata must be a map of strings to strings');
      process.stdout.write(`${resolve(directory)}\n${output}`);
    } catch (error) {
      process.exitCode = 1;
      process.stderr.write(`Agent Skills reference validation failed: ${resolve(directory)}\n`);
      if (error.code === 'ENOENT') process.stderr.write('skills-ref is unavailable; install it or set SKILLS_REF_BIN to its executable.\n');
      else process.stderr.write(String(error.stderr || error.stdout || error.message));
    }
  }
}
