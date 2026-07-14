#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * insrc-mcp -- binary entry for the Insrc MCP server.
 *
 * Speaks MCP over stdio. Wire it into a client (e.g. Claude Code) by
 * adding to `~/.claude/settings.json`:
 *
 *   {
 *     "mcpServers": {
 *       "insrc": {
 *         "command": "insrc-mcp",
 *         "env": {
 *           "INSRC_REPO": "/path/to/registered/repo"
 *         }
 *       }
 *     }
 *   }
 *
 * The `INSRC_REPO` env is optional -- callers can pass `repo` on
 * every tool call instead. If neither is set, the tool fails with a
 * clear error listing the registered repos.
 *
 * When the client declares the `sampling` capability at initialize,
 * inner LLM calls route back through MCP `sampling/createMessage`
 * (no subprocess spawn, single session). When it doesn't, the
 * daemon's configured `shaperProvider` falls back to CliProvider or
 * Ollama. Either way the analyze framework's discipline stays the
 * same: same recipes, same prompts, same schema validation.
 */

import { setLogMode, getLogger } from '../shared/logger.js';

// Route logs to stderr so stdout stays clean for the MCP protocol.
setLogMode('mcp');

const log = getLogger('bin:insrc-mcp');

async function main(): Promise<void> {
	const { runInsrcMcpStdio } = await import('../mcp/server.js');
	await runInsrcMcpStdio();
}

main().catch((err: Error) => {
	log.error({ err: err.message, stack: err.stack }, 'insrc-mcp: fatal');
	process.exit(1);
});
