export interface BuildRun {
  root: string; active: string; workspace: string; runId: string;
  runtime: { executable: string; version: string };
  budgets: { buildMs: number; fileMs: number; runMs: number; cleanupMs: number };
  readonly record: { phase: string; [key: string]: unknown };
  assertOwner(): void; transition(phase: string, outcome?: unknown): void;
  release(options: { confirmedClosed: boolean }): void;
  environment(): NodeJS.ProcessEnv;
}
export function createRun(root: string, options?: { mode?: 'test' | 'build'; selectedFiles?: string[]; budgets?: Partial<BuildRun['budgets']>; runId?: string }): BuildRun;
export function participantContext(root?: string): BuildRun & { phase: string };
export function harnessError(code: string, message: string): Error & { code: string };
export function assertSupportedVersion(version: string): void;
export function recoverRun(root: string, options: { runId: string; confirmedActorsEnded: boolean }): void;
export function childEnvironment(runtime: BuildRun['runtime'], inherited?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function qualificationEnvironment(inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
