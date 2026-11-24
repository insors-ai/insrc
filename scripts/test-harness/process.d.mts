import type { BuildRun } from './context.mjs';
export interface OwnerChannel { write(frame: string): void; end(): void }
export interface CommandResult { childId: string; log: string; closeJournal: string; code: number | null; signal: string | null; timedOut?: boolean; interrupted?: boolean; launchError?: string }
export interface CommandScope {
  start(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; budgetMs?: number; stdout?: unknown; stderr?: unknown; logPath?: string; outputLimitBytes?: number; ownerChannel?: { initial: string; cancel?: string; connect(channel: OwnerChannel): () => void } }): Promise<CommandResult>;
  drain(): Promise<boolean>; stop(): void; readonly stopped: boolean;
  readonly cancellationErrors: unknown[]; readonly evidenceErrors: unknown[];
}
export function processScope(run: BuildRun, options?: { includeForeignActors?: boolean }): CommandScope;
export function withRun<T>(run: BuildRun, work: (scope: CommandScope) => Promise<T>): Promise<T>;
export function actorsClosed(run: BuildRun): boolean;
export function registerChild<T>(child: T, context?: BuildRun): T;
