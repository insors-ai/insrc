#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Insrc CLI entry.
 *
 * Cleanup-scrubbed: the REPL + ask + plan one-shot subcommands and the
 * agent / config / test / mcp-setup / handoff / query / keys / conversation
 * sub-registrations all bound into the deleted agent + handoff + mcp +
 * meta-task subsystems. What's left is the infra surface the daemon
 * + repo registry need.
 */

import { Command } from 'commander';
import { registerDaemonCommands }   from './commands/daemon.js';
import { registerRepoCommands }     from './commands/repo.js';
import { registerWorkflowCommands } from './commands/workflow.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('cli');

const program = new Command();

program
	.name('insrc')
	.description('local-first code-knowledge-graph backend')
	.version('0.1.0');

registerDaemonCommands(program);
registerRepoCommands(program);
registerWorkflowCommands(program);

// Setup / system detection
program
	.command('setup')
	.description('detect hardware and recommend optimal model configuration')
	.option('--detect', 'show system info only (no config changes)')
	.option('--recommend', 'show recommendation only (no config changes)')
	.option('--apply', 'apply recommended config without prompting')
	.action(async (opts: { detect?: boolean; recommend?: boolean; apply?: boolean }) => {
		const { setupCommand } = await import('./commands/setup.js');
		await setupCommand(opts);
	});

program.parseAsync(process.argv).catch(err => {
	log.error({ err }, 'fatal error');
	process.exit(1);
});
