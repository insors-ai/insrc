#!/usr/bin/env node
import { Command } from 'commander';
import { registerDaemonCommands } from './commands/daemon.js';
import { registerRepoCommands }   from './commands/repo.js';

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

registerDaemonCommands(program);
registerRepoCommands(program);

program.parseAsync(process.argv).catch(err => {
  console.error(err);
  process.exit(1);
});
