import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PATHS } from '../../shared/paths.js';

const execute = promisify(execFile);
const packageTools = fileURLToPath(new URL('../../../scripts/', import.meta.url));

export interface OwnedToolchain {
	readonly node: string;
	readonly npm: string;
	readonly identity: string;
}

/** Consume the same bootstrap authority as the shell. There is no Node search. */
export async function resolveOwnedToolchain(installationRoot: string): Promise<OwnedToolchain> {
	const installedTools = join(installationRoot, 'scripts');
	// An updated CLI can migrate an older source checkout using its own shipped
	// assets. When CLI and target coincide, missing assets remain an error.
	const tools = existsSync(join(installedTools, 'node-runtime-env.sh')) ? installedTools : packageTools;
	if (!existsSync(join(tools, 'node-runtime-env.sh'))) throw new Error('Runtime bootstrap assets missing; reinstall with the matching packaged installer.');
	try {
		const { stdout } = await execute('/bin/bash', ['-c',
			'set -euo pipefail; . "$1/node-runtime-env.sh"; insrc_source_toolchain "$1" "$2"; printf "%s\\0%s\\0%s\\0" "$NODE_BIN" "$NPM_CLI" "$TOOLCHAIN_ID"',
			'insrc-owned-runtime', tools, PATHS.insrc], {
			encoding: 'utf8', timeout: 180000, maxBuffer: 256 * 1024, env: cleanNodeEnvironment(process.env),
		});
		const [node, npm, identity, end, ...extra] = stdout.split('\0');
		if (!node || !npm || !identity || end !== '' || extra.length !== 0 || !isAbsolute(node) || !isAbsolute(npm)) {
			throw new Error('runtime authority returned an invalid toolchain');
		}
		return { node, npm, identity };
	} catch (error) {
		const detail = error as { stderr?: string; message?: string };
		throw new Error(`Verified local Node toolchain unavailable: ${detail.stderr?.trim() || detail.message || String(error)}`);
	}
}

export function cleanNodeEnvironment(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const env = { ...parent }; delete env['NODE_OPTIONS']; delete env['NODE_PATH']; return env;
}

export function ownedNodeEnvironment(toolchain: OwnedToolchain, parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return { ...cleanNodeEnvironment(parent), PATH: `${dirname(toolchain.node)}${delimiter}${parent['PATH'] || '/usr/bin:/bin'}`,
		npm_config_target: toolchain.identity.split(':')[0], npm_config_runtime: 'node' };
}

export function toolchainInstallMarker(lockHash: string, toolchain: OwnedToolchain): string {
	return `v2:${lockHash}:${toolchain.identity}`;
}
