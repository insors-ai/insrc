/**
 * CLI commands for conversation history management.
 *
 * Subcommands:
 *   insrc conversation compact — compact old conversation turns (tiered compression)
 *   insrc conversation stats   — show conversation storage statistics
 */

import type { Command } from 'commander';
import { rpc } from '../client.js';
import type { CompactionResult } from '../../db/compaction.js';
import type { ConversationStats } from '../../db/conversations.js';

export function registerConversationCommands(program: Command): void {
  const conv = program.command('conversation').description('manage conversation history');

  conv
    .command('compact')
    .description('compact old conversation turns (tiered compression)')
    .option('--repo <path>', 'scope to a single repo')
    .option('--hot-days <n>', 'days to keep verbatim (default: 7)')
    .option('--warm-days <n>', 'days before cold compression (default: 30)')
    .option('--cold-days <n>', 'days before archive (default: 90)')
    .option('--dry-run', 'show what would be compacted without applying')
    .action(cmdCompact);

  conv
    .command('stats')
    .description('show conversation storage statistics')
    .option('--repo <path>', 'scope to a single repo')
    .action(cmdStats);
}

async function cmdCompact(opts: {
  repo?: string;
  hotDays?: string;
  warmDays?: string;
  coldDays?: string;
  dryRun?: boolean;
}): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts.repo) params['repo'] = opts.repo;
  if (opts.hotDays) params['hotDays'] = parseInt(opts.hotDays, 10);
  if (opts.warmDays) params['warmDays'] = parseInt(opts.warmDays, 10);
  if (opts.coldDays) params['coldDays'] = parseInt(opts.coldDays, 10);
  if (opts.dryRun) params['dryRun'] = true;

  try {
    const result = await rpc<CompactionResult>('conversation.compact', params);

    if (opts.dryRun) {
      console.log('Dry run — no changes applied:\n');
    }

    console.log('Compaction results:');
    console.log(`  Directives extracted:  ${result.directives}`);
    console.log(`  Warm compressed:       ${result.warmCompressed}`);
    console.log(`  Cold merged:           ${result.coldMerged}`);
    console.log(`  Archived:              ${result.archived}`);
    console.log(`  Deduplicated:          ${result.deduped}`);
    console.log(`  Capped (size limit):   ${result.capped}`);

    const total = result.directives + result.warmCompressed + result.coldMerged +
                  result.archived + result.deduped + result.capped;
    console.log(`  Total affected:        ${total}`);
  } catch (err) {
    console.error(`Compaction failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

async function cmdStats(opts: { repo?: string }): Promise<void> {
  try {
    const stats = await rpc<ConversationStats>('conversation.stats', { repo: opts.repo });

    console.log('Conversation storage statistics:\n');
    console.log(`  Total turns:    ${stats.totalTurns}`);
    console.log(`  Sessions:       ${stats.sessions}`);

    if (Object.keys(stats.byType).length > 0) {
      console.log('\n  By type:');
      for (const [type, count] of Object.entries(stats.byType)) {
        console.log(`    ${type.padEnd(12)} ${count}`);
      }
    }

    if (Object.keys(stats.byTier).length > 0) {
      console.log('\n  By tier:');
      for (const [tier, count] of Object.entries(stats.byTier)) {
        console.log(`    ${tier.padEnd(12)} ${count}`);
      }
    }

    if (Object.keys(stats.byRepo).length > 0) {
      console.log('\n  By repo:');
      for (const [repo, count] of Object.entries(stats.byRepo)) {
        console.log(`    ${repo.length > 50 ? '...' + repo.slice(-47) : repo.padEnd(50)} ${count}`);
      }
    }
  } catch (err) {
    console.error(`Stats failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
