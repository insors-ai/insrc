import { execFileSync } from 'node:child_process';
import type { StructuredSchema } from '../../shared/types.js';
import type { CliKind } from './cli-provider.js';

export class UnsupportedBoundedInputError extends Error {
	readonly code = 'unsupported-bounded-input';
	constructor(message: string) { super(message); this.name = 'UnsupportedBoundedInputError'; }
}

export const BOUNDED_SYSTEM_PROMPT = 'Return only the requested structured result. Use only the supplied evidence.';
const FLAGS = ['--safe-mode', '--no-session-persistence', '--system-prompt', '--tools', '--disable-slash-commands', '--setting-sources', '--strict-mcp-config', '--mcp-config'];

/** Flags are checked without a model request; ordinary completions never probe. */
export function verifyBoundedCli(kind: CliKind, bin: string, cwd: string): void {
	// 0.164.0 still exposes model-catalog-driven tools without a verified zero-tool switch.
	if (kind !== 'claude') throw new UnsupportedBoundedInputError('Bounded isolation is only verified for the claude CLI: tool-free execution cannot be verified for this kind');
	let help: string;
	try { help = execFileSync(bin, ['--help'], { cwd, encoding: 'utf8', timeout: 5_000, maxBuffer: 512_000, env: boundedClaudeEnv(), stdio: ['ignore', 'pipe', 'pipe'] }); }
	catch { throw new UnsupportedBoundedInputError('Cannot verify installed CLI isolation support'); }
	if (FLAGS.some(flag => !help.includes(flag))) throw new UnsupportedBoundedInputError('Installed CLI lacks required bounded isolation flags');
}

export function boundedClaudeArgs(schema: StructuredSchema, modelArgs: readonly string[]): string[] {
	return ['--print', '--output-format', 'json', '--json-schema', JSON.stringify(schema),
		'--safe-mode', '--no-session-persistence', '--system-prompt', BOUNDED_SYSTEM_PROMPT,
		'--tools', '', '--disable-slash-commands', '--setting-sources', '',
		'--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', ...modelArgs];
}

/** Preserve CLI-owned OAuth and platform lookup, not inherited agent/session customizations. */
export function boundedClaudeEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN']) {
		if (process.env[key] !== undefined) env[key] = process.env[key];
	}
	return env;
}
