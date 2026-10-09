import { copyFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('packages/providers/src');
const destination = resolve('dist/packages/providers/src');
mkdirSync(destination, { recursive: true });
const templateNames = readdirSync(source).filter(name => name.startsWith('prompt.') && name.endsWith('.md'));
for (const filename of readdirSync(destination).filter(name => name.startsWith('prompt.') && name.endsWith('.md'))) {
  if (!templateNames.includes(filename)) unlinkSync(resolve(destination, filename));
}
for (const filename of templateNames) {
  copyFileSync(resolve(source, filename), resolve(destination, filename));
}
const identityPresets = resolve('dist/presets/identities');
mkdirSync(identityPresets, { recursive: true });
copyFileSync(resolve('presets/identities/question-library.json'), resolve(identityPresets, 'question-library.json'));
copyFileSync(resolve('presets/identities/answer-guidance.txt'), resolve(identityPresets, 'answer-guidance.txt'));
const simulationFixtures = resolve('dist/packages/simulation/fixtures');
mkdirSync(simulationFixtures, { recursive: true });
copyFileSync(resolve('packages/simulation/fixtures/executive-attention.mjs'), resolve(simulationFixtures, 'executive-attention.mjs'));
