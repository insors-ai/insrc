/**
 * The isolated git environment and the read-only arguments, defined once. git_cat_file uses them through
 * runShellBytes({ isolate: true }); the design corpus reader (git-reader.ts) keeps its own copy until
 * Story s7 moves it here, and a test pins the two equal.
 */

/**
 * A fresh environment built from PATH (and SystemRoot where set) only: it does not inherit GIT_CONFIG_*, alternate
 * object stores, replacement refs or command overrides from the daemon's environment.
 */
export function gitEnvironment(): NodeJS.ProcessEnv {
	return {
		PATH: process.env['PATH'],
		...(process.env['SystemRoot'] ? { SystemRoot: process.env['SystemRoot'] } : {}),
		LC_ALL: 'C', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
		GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
	};
}

/** Arguments that go before the subcommand of an isolated read: no replacement objects, literal pathspecs, no hooks or filters. */
export const GIT_READ_ARGS = [
	'--no-replace-objects', '--literal-pathspecs', '-c', 'protocol.allow=never',
	'-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.attributesFile=/dev/null',
] as const;
