import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

/** Entrypoints only: shell values take precedence over the local, ignored .env. */
export function loadLocalEnvironment(path = '.env'): void {
  if (existsSync(path)) loadEnvFile(path);
}
