/**
 * CLI commands for agent run management.
 *
 * insrc agent list     — show all agent runs
 * insrc agent resume   — resume a paused/crashed run
 * insrc agent discard  — delete a run
 * insrc agent prune    — clean up old completed runs
 */

import type { Command } from 'commander';
import {
  readIndex, readCheckpoint, resolveRunDir, deleteRun, pruneCompleted,
  detectCrashes,
} from '../../agent/framework/checkpoint.js';
import type { RunIndexEntry } from '../../agent/framework/types.js';

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

const STATUS_COLOR: Record<string, string> = {
  running:   GREEN,
  completed: DIM,
  paused:    YELLOW,
  failed:    RED,
  crashed:   RED,
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerAgentCommands(program: Command): void {
  const agent = program.command('agent').description('manage agent runs');

  agent
    .command('list')
    .alias('ls')
    .description('list all agent runs')
    .action(cmdList);

  agent
    .command('resume <runId>')
    .description('resume a paused or crashed run')
    .action(cmdResume);

  agent
    .command('discard <runId>')
    .description('delete a run and its artifacts')
    .action(cmdDiscard);

  agent
    .command('prune')
    .description('remove completed runs older than 7 days')
    .option('--days <n>', 'max age in days', '7')
    .action(cmdPrune);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdList(): void {
  // Detect crashes before listing
  const crashed = detectCrashes();
  if (crashed.length > 0) {
    console.log(`${YELLOW}Detected ${crashed.length} crashed run(s).${RESET}\n`);
  }

  const entries = readIndex();

  if (entries.length === 0) {
    console.log('No agent runs found.');
    return;
  }

  // Header
  console.log(
    `${'Run ID'.padEnd(38)} ${'Agent'.padEnd(12)} ${'Status'.padEnd(12)} ${'Updated'.padEnd(22)} Repo`,
  );
  console.log(`${DIM}${'─'.repeat(100)}${RESET}`);

  for (const e of entries) {
    const color = STATUS_COLOR[e.status] ?? '';
    const shortId = e.runId.length > 36 ? e.runId.slice(0, 36) + '…' : e.runId;
    const updated = formatRelativeTime(e.updatedAt);
    console.log(
      `${shortId.padEnd(38)} ${e.agentId.padEnd(12)} ${color}${e.status.padEnd(12)}${RESET} ${updated.padEnd(22)} ${e.repo}`,
    );
  }
}

async function cmdResume(runId: string): Promise<void> {
  const runDir = resolveRunDir(runId);
  const checkpoint = readCheckpoint(runDir);

  if (!checkpoint) {
    console.error(`${RED}No checkpoint found for run ${runId}${RESET}`);
    process.exit(1);
  }

  if (checkpoint.status === 'running') {
    console.error(`${YELLOW}Run ${runId} is still running (PID ${checkpoint.pid}).${RESET}`);
    process.exit(1);
  }

  if (checkpoint.status === 'completed') {
    console.log(`Run ${runId} is already completed.`);
    return;
  }

  console.log(`Resuming ${checkpoint.agentId} run ${runId} from step "${checkpoint.stepName}"...`);
  console.log(`${DIM}Completed steps: ${checkpoint.completedSteps.map(s => s.name).join(' → ')}${RESET}`);
  console.log(`${DIM}Use the REPL to continue: INSRC_NEW_AGENT=1 insrc${RESET}`);
  console.log(`${DIM}The REPL will detect this run and offer to resume it.${RESET}`);
}

function cmdDiscard(runId: string): void {
  const entries = readIndex();
  const entry = entries.find(e => e.runId === runId);

  if (!entry) {
    console.error(`${RED}Run ${runId} not found in index.${RESET}`);
    process.exit(1);
  }

  deleteRun(runId);
  console.log(`Deleted run ${runId} (${entry.agentId}, ${entry.status}).`);
}

function cmdPrune(opts: { days: string }): void {
  const days = parseInt(opts.days, 10);
  if (isNaN(days) || days < 0) {
    console.error(`${RED}Invalid days: ${opts.days}${RESET}`);
    process.exit(1);
  }

  const pruned = pruneCompleted(days);
  console.log(pruned > 0
    ? `Pruned ${pruned} completed run(s) older than ${days} day(s).`
    : 'No runs to prune.',
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
