#!/usr/bin/env node
import { Command } from 'commander';
import { registerDaemonCommands } from './commands/daemon.js';
import { registerRepoCommands }   from './commands/repo.js';

const program = new Command();

program
  .name('insrc')
  .description('local-first hybrid coding agent')
  .version('0.1.0');

registerDaemonCommands(program);
registerRepoCommands(program);

program.parseAsync(process.argv).catch(err => {
  console.error(err);
  process.exit(1);
});
