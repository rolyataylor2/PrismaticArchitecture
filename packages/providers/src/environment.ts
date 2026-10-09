import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

/** Entrypoints only: shell values take precedence over the local, ignored .env. */
export function loadLocalEnvironment(path = '.env'): void {
  if (existsSync(path)) loadEnvFile(path);
}

/** Prism settings take precedence; accept existing pre-rebrand configuration. */
export function projectEnvironmentValue(name: string, environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return environment[`PRISM_${name}`] ?? environment[`ONTOAGENTIC_${name}`];
}
