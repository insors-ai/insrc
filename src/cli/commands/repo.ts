import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { Command } from 'commander';
import { rpc } from '../client.js';
import type { RegisteredRepo } from '../../shared/types.js';

export function registerRepoCommands(program: Command): void {
  const repo = program.command('repo').description('manage indexed repositories');

  repo
    .command('add <path>')
    .description('register a local repo for indexing')
    .action(cmdAdd);

  repo
    .command('remove <path>')
    .description('unregister a repo and remove its graph data')
    .action(cmdRemove);

  repo
    .command('list')
    .description('list all registered repos and their status')
    .action(cmdList);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdAdd(path: string): Promise<void> {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    console.error(`path does not exist: ${abs}`);
    process.exitCode = 1;
    return;
  }
  try {
    await rpc('repo.add', { path: abs });
    console.log(`registered: ${abs}`);
    console.log('indexing started in the background');
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
  }
}

async function cmdRemove(path: string): Promise<void> {
  const abs = resolve(path);
  try {
    await rpc('repo.remove', { path: abs });
    console.log(`removed: ${abs}`);
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
  }
}

async function cmdList(): Promise<void> {
  try {
    const repos = await rpc<RegisteredRepo[]>('repo.list');
    if (repos.length === 0) {
      console.log('no repositories registered');
      console.log('add one with: insrc repo add <path>');
      return;
    }

    const col = (s: string, w: number) => s.padEnd(w).slice(0, w);

    console.log(col('STATUS', 10) + col('LAST INDEXED', 24) + 'PATH');
    console.log('-'.repeat(72));
    for (const r of repos) {
      const when = r.lastIndexed
        ? new Date(r.lastIndexed).toLocaleString()
        : 'never';
      console.log(col(r.status, 10) + col(when, 24) + r.path);
    }
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
  }
}
