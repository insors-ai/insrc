/**
 * CLI commands for config management.
 *
 * Subcommands:
 *   insrc config show    — display resolved config JSON
 *   insrc config reindex — re-index config entries
 *   insrc config search  — search config entries
 *   insrc config list    — list config entries
 *   insrc config init    — scaffold project config directory
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { rpc } from '../client.js';
import type { ConfigEntry, ConfigSearchResult } from '../../shared/types.js';
import { loadConfig } from '../../agent/config.js';

export function registerConfigCommands(program: Command): void {
  const config = program.command('config').description('manage config templates, feedback, and conventions');

  config
    .command('show')
    .description('display resolved config JSON')
    .option('--global', 'show global config only')
    .option('--project', 'show project config override only')
    .action(cmdShow);

  config
    .command('reindex')
    .description('re-index config entries (drop and rebuild)')
    .option('--global', 'reindex global config only')
    .option('--project <path>', 'reindex project config for given repo path')
    .action(cmdReindex);

  config
    .command('search <query>')
    .description('search config entries by semantic similarity')
    .option('--namespace <ns>', 'filter by namespace (tester, pair, delegate, designer, planner, common)')
    .option('--category <cat>', 'filter by category (template, feedback, convention)')
    .option('--language <lang>', 'filter by language')
    .option('--limit <n>', 'max results', '10')
    .action(cmdSearch);

  config
    .command('list')
    .description('list config entries')
    .option('--namespace <ns>', 'filter by namespace')
    .option('--category <cat>', 'filter by category')
    .option('--scope <scope>', 'filter by scope (global or project:<path>)')
    .action(cmdList);

  config
    .command('init')
    .description('scaffold project config directory in current repo')
    .option('--path <path>', 'repo path (defaults to cwd)')
    .action(cmdInit);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdShow(opts: { global?: boolean; project?: boolean }): Promise<void> {
  const cfg = loadConfig();
  if (opts.global) {
    console.log(JSON.stringify(cfg, null, 2));
  } else {
    console.log(JSON.stringify(cfg, null, 2));
  }
}

async function cmdReindex(opts: { global?: boolean; project?: string }): Promise<void> {
  const scope = opts.project
    ? { kind: 'project' as const, repoPath: opts.project }
    : { kind: 'global' as const };

  console.log(`Reindexing config (scope: ${scope.kind === 'global' ? 'global' : scope.repoPath})...`);
  await rpc('config.reindex', { scope });
  console.log('Config reindex enqueued.');
}

async function cmdSearch(
  query: string,
  opts: { namespace?: string; category?: string; language?: string; limit?: string },
): Promise<void> {
  const limit = parseInt(opts.limit ?? '10', 10);
  const results = await rpc<ConfigSearchResult[]>('config.search', {
    query,
    namespace: opts.namespace,
    category: opts.category,
    language: opts.language,
    limit,
    boostProject: true,
  });

  if (results.length === 0) {
    console.log('No config entries found.');
    return;
  }

  console.log(`Found ${results.length} config entries:\n`);
  for (const r of results) {
    const boost = r.boosted ? ' [project-boosted]' : '';
    console.log(`  ${r.entry.namespace}/${r.entry.name} (${r.entry.category}, ${r.entry.language})${boost}`);
    console.log(`    score: ${r.score.toFixed(3)}  file: ${r.entry.filePath}`);
    // Show first 100 chars of body
    const preview = r.entry.body.slice(0, 100).replace(/\n/g, ' ');
    console.log(`    ${preview}${r.entry.body.length > 100 ? '...' : ''}`);
    console.log();
  }
}

async function cmdList(opts: { namespace?: string; category?: string; scope?: string }): Promise<void> {
  const entries = await rpc<ConfigEntry[]>('config.list', {
    namespace: opts.namespace,
    category: opts.category,
    scope: opts.scope,
  });

  if (entries.length === 0) {
    console.log('No config entries found.');
    return;
  }

  console.log(`${entries.length} config entries:\n`);
  for (const e of entries) {
    const scopeStr = e.scope.kind === 'global' ? 'global' : `project:${e.scope.kind === 'project' ? (e.scope as { repoPath: string }).repoPath : ''}`;
    console.log(`  [${scopeStr}] ${e.namespace}/${e.name} (${e.category}, ${e.language})`);
    console.log(`    tags: ${e.tags.join(', ') || '(none)'}  file: ${e.filePath}`);
  }
}

async function cmdInit(opts: { path?: string }): Promise<void> {
  const repoPath = opts.path ?? process.cwd();
  const configBase = join(repoPath, '.insrc');

  if (existsSync(configBase)) {
    console.log(`Config directory already exists: ${configBase}`);
    return;
  }

  // Create directory structure
  mkdirSync(join(configBase, 'templates'), { recursive: true });
  mkdirSync(join(configBase, 'feedback'), { recursive: true });
  mkdirSync(join(configBase, 'conventions'), { recursive: true });

  // Create empty config.json
  writeFileSync(
    join(configBase, 'config.json'),
    JSON.stringify({}, null, 2) + '\n',
  );

  console.log(`Scaffolded project config at ${configBase}/`);
  console.log('  templates/');
  console.log('  feedback/');
  console.log('  conventions/');
  console.log('  config.json');
}
