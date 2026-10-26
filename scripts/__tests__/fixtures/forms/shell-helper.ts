import { runShell } from '../../../src-stub.js';
export async function run(): Promise<void> { await runShell(['gh', 'pr', 'list'], {}); }
