#!/usr/bin/env node
import { Command } from 'commander';
import { registerDaemonCommands } from './commands/daemon.js';
import { registerRepoCommands }   from './commands/repo.js';
import { registerAgentCommands }  from './commands/agent.js';
import { registerConfigCommands } from './commands/config.js';
import { registerConversationCommands } from './commands/conversation.js';
import { registerTestCommands } from './commands/test.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('cli');

const program = new Command();

program
  .name('insrc')
  .description('local-first hybrid coding agent')
  .version('0.1.0');

// Default action: start REPL if no subcommand given
program
  .argument('[message]', 'optional one-shot message (starts REPL if omitted)')
  .option('--cwd <path>', 'repo path (defaults to current directory)')
  .action(async (message: string | undefined, opts: { cwd?: string }) => {
    const { startRepl } = await import('../agent/index.js');
    await startRepl(opts.cwd);
  });

// ---------------------------------------------------------------------------
// One-shot subcommands (Phase 11)
// ---------------------------------------------------------------------------

interface AskOpts {
  intent?: string;
  claude?: boolean;
  json?: boolean;
  cwd?: string;
}

program
  .command('ask')
  .description('classify, execute one turn, print result, and exit')
  .argument('<message>', 'the question or task')
  .option('--intent <name>', 'override classified intent')
  .option('--claude', 'force Claude routing')
  .option('--json', 'output structured JSON')
  .option('--cwd <path>', 'repo path (defaults to current directory)')
  .action(async (message: string, opts: AskOpts) => {
    const { runOneShot } = await import('../agent/cli.js');
    const result = await runOneShot(message, {
      intent: opts.intent,
      claude: opts.claude,
      json: opts.json,
      cwd: opts.cwd,
    });
    process.stdout.write(result.output + '\n');
    process.exit(result.exitCode);
  });

program
  .command('plan')
  .description('generate a plan as a markdown checklist')
  .argument('<description>', 'what to plan')
  .option('--claude', 'force Claude routing')
  .option('--json', 'output structured JSON')
  .option('--cwd <path>', 'repo path (defaults to current directory)')
  .action(async (description: string, opts: AskOpts) => {
    const { runPlanShorthand } = await import('../agent/cli.js');
    const result = await runPlanShorthand(description, {
      claude: opts.claude,
      json: opts.json,
      cwd: opts.cwd,
    });
    process.stdout.write(result.output + '\n');
    process.exit(result.exitCode);
  });

registerDaemonCommands(program);
registerRepoCommands(program);
registerAgentCommands(program);
registerConfigCommands(program);
registerConversationCommands(program);
registerTestCommands(program);

program.parseAsync(process.argv).catch(err => {
  log.error({ err }, 'fatal error');
  process.exit(1);
});
