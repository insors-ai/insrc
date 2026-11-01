/**
 * The identity lookup's default command runner (Story s9): the three commands it runs — `gh auth status --json hosts`,
 * `gh api --hostname <host> users/<login>` and `git config --get user.email` — made through the tool registry (gh_auth hosts, gh_tracker
 * user_by_host, git_config) instead of by spawning gh and git. The lookup keeps reading the same command results (exit code, stdout,
 * spawn error), so its multi-host and multi-account behaviour is unchanged. A denied call is thrown: it is not an unavailable provider.
 */

import type { ShellOptions, ShellResult } from '../daemon/tools/shell-helper.js';
import { ghAuthTool } from '../daemon/tools/builtins/gh/account.js';
import { ghTrackerTool } from '../daemon/tools/builtins/gh/tracker.js';
import { gitConfigTool } from '../daemon/tools/builtins/git/config.js';
import { run, workflowToolDeps } from '../workflow/tracker/registry-table.js';
import { errorOfFailure } from '../workflow/tracker/tool-denied.js';
import type { ToolFailure } from '../daemon/tools/types.js';

type Command = (argv: readonly string[], options?: ShellOptions) => Promise<ShellResult>;

const done = (stdout: string, code = 0): ShellResult => ({ stdout, stderr: '', code, spawnError: false, timedOut: false, stdoutTruncated: false });
const failed = (stderr: string, spawnError = false): ShellResult => ({ stdout: '', stderr, code: spawnError ? null : 1, spawnError, timedOut: false, stdoutTruncated: false });

/** A tool failure as the command result it stands for: a missing program is a spawn error, a denial is thrown. */
function ofFailure(toolId: string, failure: ToolFailure): ShellResult {
	if (failure.kind === 'denied') throw errorOfFailure(toolId, failure);
	return failed(failure.message, failure.kind === 'missing-tool');
}

export const toolIdentityCommand: Command = async (argv, options = {}) => {
	const cwd = options.cwd ?? process.cwd();
	const deps = workflowToolDeps(cwd, { signal: options.signal });
	const [program, ...rest] = argv;

	if (program === 'gh' && rest.join(' ') === 'auth status --json hosts') {
		const c = await run(ghAuthTool, { op: 'hosts' }, deps);
		if (!c.ok) return ofFailure(ghAuthTool.id, c.failure);
		return done(JSON.stringify({ hosts: (c.data as { hosts: unknown }).hosts }));
	}
	if (program === 'gh' && rest[0] === 'api' && rest[1] === '--hostname' && rest[2] !== undefined && rest[3]?.startsWith('users/') === true && rest.length === 4) {
		const c = await run(ghTrackerTool, { op: 'user_by_host', host: rest[2], login: decodeURIComponent(rest[3].slice('users/'.length)) }, deps);
		if (!c.ok) return ofFailure(ghTrackerTool.id, c.failure);
		const user = c.data as { login: string; node_id: string };
		return done(JSON.stringify({ login: user.login, node_id: user.node_id }));
	}
	if (program === 'git' && rest.join(' ') === 'config --get user.email') {
		const c = await run(gitConfigTool, { cwd, key: 'user.email' }, deps);
		if (!c.ok) return ofFailure(gitConfigTool.id, c.failure);
		const data = c.data as { found: boolean; value?: string };
		return data.found ? done(`${data.value ?? ''}\n`) : done('', 1);
	}
	throw new Error(`the identity lookup does not run '${argv.join(' ')}'`);
};
