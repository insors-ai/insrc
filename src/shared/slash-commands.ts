/**
 * Registered chat slash commands.
 *
 * Single source of truth on the daemon side for:
 *   - the family-direct dispatcher's regex match (`/code-analyze`),
 *   - the dispatcher's fuzzy "did you mean ..." fallback (Phase 4
 *     follow-up: typo'd `/code-analyzer` shouldn't misroute as
 *     research),
 *   - the intent classifier's system prompt (so the classifier knows
 *     to recognise `/<name>` literals as slash-command attempts
 *     instead of topic-classifying them).
 *
 * The workbench-side autocomplete consumes a duplicated copy of this
 * list at `vs/workbench/contrib/insrc/common/slashCommands.ts` --
 * cheap to keep in sync at the current size; revisit if the list
 * grows past ~5 entries.
 */

export interface SlashCommand {
	/** Token after `/`. e.g. `code-analyze`. */
	readonly id: string;
	/** One-sentence description for autocomplete + classifier prompt. */
	readonly description: string;
	/** Example invocation rendered in the autocomplete preview. */
	readonly example: string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
	{
		id: 'code-analyze',
		description: 'Run a structural code analysis against the active repo.',
		example: '/code-analyze how does the auth middleware work?',
	},
	{
		id: 'data-analyze',
		description: 'Run a read-only data analysis against the active repo\'s registered DB connections (schema, samples, drift, lineage).',
		example: '/data-analyze find pii columns in production',
	},
	// Intent shortcuts -- bypass the topic classifier and route directly
	// to the matching agent family. Useful when the user knows what they
	// want and doesn't want the classifier guessing (or guessing wrong).
	{
		id: 'design',
		description: 'Designer agent -- iterative per-requirement design with validation gates.',
		example: '/design a token-bucket rate limiter for the public API',
	},
	{
		id: 'plan',
		description: 'Planner agent -- 8-step implementation plan generation.',
		example: '/plan migrate auth from session cookies to JWT',
	},
	{
		id: 'brainstorm',
		description: 'Brainstorm agent -- iterative spec-building from a fuzzy idea.',
		example: '/brainstorm options for cross-region failover',
	},
	{
		id: 'implement',
		description: 'Implement an approved plan or a single-shot change (Pair / Delegate).',
		example: '/implement the rate limiter from the plan',
	},
	{
		id: 'refactor',
		description: 'Refactor existing code without changing behaviour.',
		example: '/refactor extract the retry loop into a helper',
	},
	{
		id: 'test',
		description: 'Tester agent -- write or run tests; never modifies impl code.',
		example: '/test add coverage for the token-bucket edge cases',
	},
	{
		id: 'debug',
		description: 'Pair agent in debug mode -- investigate + fix a specific failure.',
		example: '/debug the 500 on POST /v1/sessions',
	},
	{
		id: 'review',
		description: 'Review a diff, branch, or recent change.',
		example: '/review the last commit',
	},
	{
		id: 'document',
		description: 'Generate or update documentation for a module / API.',
		example: '/document the auth middleware',
	},
	{
		id: 'research',
		description: 'Research agent -- web + external sources, no code modifications.',
		example: '/research current best practices for token-bucket rate limiting',
	},
	{
		id: 'requirements',
		description: 'Requirements agent -- capture acceptance criteria from a fuzzy ask.',
		example: '/requirements the new billing dashboard',
	},
	// User-preferences curation surface (memory-context M1.7). Reads /
	// edits / discards entries the chat-side classifier wrote into
	// substrate `agent:chat/user-assertions/...`. Not an agent -- a
	// CRUD slash dispatcher rendered as markdown.
	{
		id: 'prefs',
		description: 'List, edit, or discard captured user preferences.',
		example: '/prefs list',
	},
];

/**
 * Subset of SLASH_COMMANDS whose `id` is a registered intent (per
 * `Intent` in shared/types.ts) -- the dispatcher uses this set to
 * recognise `/<intent> <message>` and force-classify the turn,
 * bypassing the topic classifier. `code-analyze` is excluded
 * because it routes through its own family-direct path
 * (`runCodeAnalyzerSlash`), not the classified-intent flow.
 */
export const INTENT_SLASH_NAMES: ReadonlySet<string> = new Set([
	'design', 'plan', 'brainstorm', 'implement', 'refactor', 'test',
	'debug', 'review', 'document', 'research', 'requirements',
]);

export function isIntentSlashCommand(name: string): boolean {
	return INTENT_SLASH_NAMES.has(name);
}

/**
 * Map a slash-command id to the canonical Intent name, where they
 * differ. Today only `code-analyze` -> `code-analysis` differs;
 * every other intent slash uses its own intent name verbatim.
 */
export function slashIdToIntent(id: string): string {
	if (id === 'code-analyze') {
		return 'code-analysis';
	}
	if (id === 'data-analyze') {
		return 'data-analysis';
	}
	return id;
}

const SLASH_NAMES: ReadonlySet<string> = new Set(SLASH_COMMANDS.map(c => c.id));

export function isRegisteredSlashCommand(name: string): boolean {
	return SLASH_NAMES.has(name);
}

/**
 * Find the closest registered slash command to a typo'd token via
 * Levenshtein distance. Returns the match when within `maxDistance`,
 * otherwise undefined. Threshold is tighter for short names (≤1 for
 * names < 10 chars) and looser for long names (≤2 for ≥ 10 chars)
 * so we don't accept surprising matches on short tokens.
 */
export function findClosestSlashCommand(
	typedName: string,
	maxDistance: number = 2,
): SlashCommand | undefined {
	const normalised = typedName.trim().toLowerCase();
	if (normalised.length === 0) {
		return undefined;
	}
	let best: { command: SlashCommand; distance: number } | undefined;
	for (const cmd of SLASH_COMMANDS) {
		const cap = cmd.id.length >= 10 ? maxDistance : Math.min(1, maxDistance);
		const d = levenshtein(normalised, cmd.id);
		if (d > cap) {
			continue;
		}
		if (best === undefined || d < best.distance) {
			best = { command: cmd, distance: d };
		}
	}
	return best?.command;
}

/**
 * Standard Levenshtein distance. Iterative two-row implementation --
 * O(m * n) time, O(min(m, n)) space. Good enough for the tiny strings
 * the slash registry compares (single-token names, < 30 chars).
 */
function levenshtein(a: string, b: string): number {
	if (a === b) {
		return 0;
	}
	if (a.length === 0) {
		return b.length;
	}
	if (b.length === 0) {
		return a.length;
	}
	let prev = new Array<number>(b.length + 1);
	let curr = new Array<number>(b.length + 1);
	for (let j = 0; j <= b.length; j++) {
		prev[j] = j;
	}
	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
			curr[j] = Math.min(
				curr[j - 1]! + 1,        // insertion
				prev[j]! + 1,            // deletion
				prev[j - 1]! + cost,     // substitution
			);
		}
		[prev, curr] = [curr, prev];
	}
	return prev[b.length]!;
}
