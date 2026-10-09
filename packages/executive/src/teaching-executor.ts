import type { Executor } from '../../core/src/contracts.js';
import type { Execution } from '../../core/src/domain.js';

/** External recording callback only; no storage handle or cognitive mutation interface. */
export class TeachingExecutiveExecutor implements Executor {
  readonly executeSay?: NonNullable<Executor['executeSay']>;
  constructor(private readonly delegate: Executor, private readonly record: (execution: Execution) => void) {
    if (delegate.executeSay) this.executeSay = input => delegate.executeSay!(input);
  }
  execute(input: Parameters<Executor['execute']>[0]): Promise<Execution> { return this.delegate.execute(input); }
  resume(input: Parameters<Executor['execute']>[0]): Promise<Execution> { return this.delegate.resume ? this.delegate.resume(input) : this.delegate.execute(input); }
  recorded(execution: Execution): void { this.delegate.recorded?.(execution); this.record(execution); }
}
