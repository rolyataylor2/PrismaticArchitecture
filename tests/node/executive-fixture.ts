import type { Application } from '../../packages/sdk/src/application.js';

/** Explicit opt-in for integration fixtures that exercise external execution. */
export function enableExecutive(app: Application, agentId: string): void {
  const profile = app.store.executiveProfile(agentId);
  app.store.saveExecutiveProfile(agentId, { ...profile, enabled: true, revision: profile.revision + 1 }, profile.revision);
}
