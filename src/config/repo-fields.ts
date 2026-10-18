/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The repo-scoped tracker rows (Story s3): the ONE definition table that
 * `config.catalog` exposes as `repoFields` and that `repo.settings.*` validates
 * against, so every client learns the rows from the daemon and none keeps a copy.
 *
 * Row kinds:
 *   - `local`  — editable; stored in the repo's own entry of `~/.insrc/github.json`.
 *   - `status` — derived and read-only (sign-in status, the resolved target).
 *   - `policy` — read-only; comes from the team policy (sc2).
 *
 * The `branchPattern` row carries its grammar. The validator reads the grammar from
 * the table it is given, so the handoff story (s6) extends the grammar by changing
 * this row and nothing else.
 */

import type { GithubEntry } from '../workflow/config/github.js';
import { OWNER_NAME_RE, REPO_NAME_RE } from '../workflow/config/github.js';
import type { TeamPolicy } from '../workflow/team/types.js';

export type RepoFieldKind = 'local' | 'status' | 'policy';

/** The complete shape of a branch-name pattern: the validator and, later, s6 read every rule from here. */
export interface BranchPatternGrammar {
	/** Names allowed between braces, e.g. `id` for `{id}`. Any other brace use is rejected; there is no escaping. */
	readonly placeholders: readonly string[];
	readonly minLength: number;
	readonly maxLength: number;
	/** What may appear outside placeholders: letters and digits when true, plus each character of `extra`. */
	readonly literalChars: { readonly letters: boolean; readonly digits: boolean; readonly extra: string };
	/** Whether the pattern may start or end with a slash or hold two slashes in a row. */
	readonly slashes: { readonly leading: boolean; readonly trailing: boolean; readonly consecutive: boolean };
	/** Text the pattern may not contain, and text it may not end with. */
	readonly forbiddenSubstrings: readonly string[];
	readonly forbiddenSuffixes: readonly string[];
}

export interface RepoFieldDef {
	readonly key: string;
	readonly label: string;
	readonly type: 'string' | 'boolean' | 'enum';
	readonly enumValues?: readonly string[];
	readonly default?: string | boolean;
	readonly description: string;
	readonly group: 'Tracker';
	readonly kind: RepoFieldKind;
	readonly note?: string;
	readonly grammar?: BranchPatternGrammar;
}

const NOT_USED_YET = 'saved; not used yet';

/** Every team rule in TeamPolicy except its provenance (`source`); the compile-time check below keeps this list complete. */
const POLICY_KEYS = ['teamMode', 'signoffStages', 'claimsEnforced', 'claimUnits', 'administrators', 'forceTaskIssues'] as const;
const _policyKeysComplete: Exclude<keyof TeamPolicy, 'source'> extends (typeof POLICY_KEYS)[number] ? true : never = true;
void _policyKeysComplete;

const POLICY_ROWS: readonly RepoFieldDef[] = [
	{ key: 'teamMode',        label: 'Team mode',          type: 'boolean', description: 'Whether this repo runs in team mode.' },
	{ key: 'signoffStages',   label: 'Signoff stages',     type: 'string',  description: 'Stages that need a signoff before the next stage starts.' },
	{ key: 'claimsEnforced',  label: 'Claims enforced',    type: 'boolean', description: 'Whether only the assignee may change a stage unit.' },
	{ key: 'claimUnits',      label: 'Claim units',        type: 'string',  description: 'The artifacts each claim covers.' },
	{ key: 'administrators',  label: 'Administrators',     type: 'string',  description: 'People who may override a claim.' },
	{ key: 'forceTaskIssues', label: 'Task issues forced', type: 'boolean', description: 'Whether a tracker issue is created for every Task.' },
].map(r => ({ ...r, group: 'Tracker' as const, kind: 'policy' as const, note: 'set by the team policy' } as RepoFieldDef));

export const REPO_TRACKER_FIELDS: readonly RepoFieldDef[] = [
	{ key: 'type', label: 'Tracker', type: 'enum', enumValues: ['github', 'none'], description: 'Which tracker this repo uses; none turns tracker integration off.', group: 'Tracker', kind: 'local' },
	{ key: 'owner', label: 'Owner', type: 'string', description: 'GitHub owner. Empty means the origin remote.', group: 'Tracker', kind: 'local' },
	{ key: 'repo', label: 'Repository', type: 'string', description: 'GitHub repository name. Empty means the origin remote.', group: 'Tracker', kind: 'local' },
	{ key: 'ghPath', label: 'gh program', type: 'string', description: 'Where the gh program lives.', group: 'Tracker', kind: 'local', note: NOT_USED_YET },
	{ key: 'ghHost', label: 'GitHub host', type: 'string', default: 'github.com', description: 'The host gh signs in to.', group: 'Tracker', kind: 'local', note: NOT_USED_YET },
	{
		key: 'branchPattern', label: 'Branch pattern', type: 'string',
		description: 'Branch name pattern with {id}, {slug} and {type}; a parked draft goes to this branch. {id} is required.',
		default: 'insrc/handoff/{type}-{id}',
		group: 'Tracker', kind: 'local',
		grammar: {
			placeholders: ['id', 'slug', 'type'], minLength: 1, maxLength: 200,
			literalChars: { letters: true, digits: true, extra: '/-_.' },
			slashes: { leading: false, trailing: false, consecutive: false },
			forbiddenSubstrings: ['..'], forbiddenSuffixes: ['.lock'],
		},
	},
	{ key: 'signin', label: 'Sign-in', type: 'string', description: 'Who gh is signed in as, read live.', group: 'Tracker', kind: 'status' },
	{ key: 'target', label: 'Resolved target', type: 'string', description: 'The owner and repository the tracker calls go to, and where that came from.', group: 'Tracker', kind: 'status' },
	...POLICY_ROWS,
];

// Compile-time: every local key is a GithubEntry field.
const _localKeys = ['type', 'owner', 'repo', 'ghPath', 'ghHost', 'branchPattern'] as const satisfies readonly (keyof GithubEntry)[];
void _localKeys;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type BranchPatternRule =
	| 'length' | 'unmatched-brace' | 'placeholder' | 'characters'
	| 'leading-slash' | 'trailing-slash' | 'consecutive-slashes' | 'forbidden-text' | 'forbidden-suffix';

export type PatternCheck = { readonly ok: true } | { readonly ok: false; readonly rule: BranchPatternRule; readonly message: string };

function isAllowedLiteral(c: string, g: BranchPatternGrammar): boolean {
	return (g.literalChars.letters && /[A-Za-z]/.test(c)) || (g.literalChars.digits && /[0-9]/.test(c)) || g.literalChars.extra.includes(c);
}

function rowOf(table: readonly RepoFieldDef[], key: string): RepoFieldDef | undefined {
	return table.find(r => r.key === key);
}

const fail = (rule: BranchPatternRule, message: string): PatternCheck => ({ ok: false, rule, message });

/** Checks a branch pattern against the grammar on the `branchPattern` row of `table`. */
export function validateBranchPattern(pattern: string, table: readonly RepoFieldDef[] = REPO_TRACKER_FIELDS): PatternCheck {
	const grammar = rowOf(table, 'branchPattern')?.grammar;
	if (grammar === undefined) return fail('length', 'the branchPattern row has no grammar');
	if (pattern.length < grammar.minLength || pattern.length > grammar.maxLength) {
		return fail('length', `must be ${grammar.minLength} to ${grammar.maxLength} characters, found ${pattern.length}`);
	}

	// Brace tokens: every '{' must close with '}' and name an allowed placeholder; a stray '}' is unmatched.
	let literal = '';
	for (let i = 0; i < pattern.length; i++) {
		const c = pattern.charAt(i);
		if (c === '}') return fail('unmatched-brace', `unmatched '}' at position ${i}`);
		if (c !== '{') { literal += c; continue; }
		const close = pattern.indexOf('}', i + 1);
		const open = pattern.indexOf('{', i + 1);
		if (close === -1 || (open !== -1 && open < close)) return fail('unmatched-brace', `unmatched '{' at position ${i}`);
		const name = pattern.slice(i + 1, close);
		if (!grammar.placeholders.includes(name)) {
			return fail('placeholder', `'{${name}}' is not an allowed placeholder (allowed: ${grammar.placeholders.map(p => `{${p}}`).join(', ')})`);
		}
		i = close;
	}
	if (![...literal].every(c => isAllowedLiteral(c, grammar))) {
		const allowed = [grammar.literalChars.letters ? 'letters' : '', grammar.literalChars.digits ? 'digits' : '', ...[...grammar.literalChars.extra].map(c => `'${c}'`)].filter(x => x !== '');
		return fail('characters', `outside placeholders only ${allowed.join(', ')} are allowed`);
	}

	if (!grammar.slashes.leading && pattern.startsWith('/')) return fail('leading-slash', 'must not start with a slash');
	if (!grammar.slashes.trailing && pattern.endsWith('/')) return fail('trailing-slash', 'must not end with a slash');
	if (!grammar.slashes.consecutive && pattern.includes('//')) return fail('consecutive-slashes', 'must not contain two consecutive slashes');
	const sub = grammar.forbiddenSubstrings.find(f => pattern.includes(f));
	if (sub !== undefined) return fail('forbidden-text', `must not contain '${sub}'`);
	const suf = grammar.forbiddenSuffixes.find(f => pattern.endsWith(f));
	if (suf !== undefined) return fail('forbidden-suffix', `must not end with '${suf}'`);
	return { ok: true };
}

export type RepoSettingCheck =
	| { readonly ok: true; readonly value: string | boolean | null }
	| { readonly ok: false; readonly code: 'unknown-key' | 'read-only-key' | 'invalid-value'; readonly message: string; readonly rule?: BranchPatternRule };

const MAX_TEXT = 1024;
const hasControlChar = (s: string): boolean => /[\u0000-\u001f\u007f]/.test(s);

/** Checks a value for a key against its row. `null` clears a local row. Never throws. */
export function validateRepoSetting(key: string, value: unknown, table: readonly RepoFieldDef[] = REPO_TRACKER_FIELDS): RepoSettingCheck {
	const row = rowOf(table, key);
	if (row === undefined) return { ok: false, code: 'unknown-key', message: `'${key}' is not a repo tracker setting` };
	if (row.kind !== 'local') return { ok: false, code: 'read-only-key', message: `'${key}' is read-only (${row.kind})` };
	if (value === null) return { ok: true, value: null };

	const bad = (message: string, rule?: BranchPatternRule): RepoSettingCheck =>
		rule === undefined ? { ok: false, code: 'invalid-value', message } : { ok: false, code: 'invalid-value', message, rule };

	if (row.type === 'boolean') return typeof value === 'boolean' ? { ok: true, value } : bad(`'${key}' must be true or false`);
	if (typeof value !== 'string') return bad(`'${key}' must be a string`);

	if (row.type === 'enum') {
		return row.enumValues?.includes(value) === true ? { ok: true, value } : bad(`'${key}' must be one of ${(row.enumValues ?? []).join(', ')}`);
	}
	if (key === 'owner') return OWNER_NAME_RE.test(value) ? { ok: true, value } : bad(`'${value}' is not a valid GitHub owner`);
	if (key === 'repo') return REPO_NAME_RE.test(value) ? { ok: true, value } : bad(`'${value}' is not a valid GitHub repository name`);
	if (key === 'branchPattern') {
		const c = validateBranchPattern(value, table);
		return c.ok ? { ok: true, value } : bad(`branchPattern ${c.message}`, c.rule);
	}
	if (value.length === 0 || value.length > MAX_TEXT || hasControlChar(value)) {
		return bad(`'${key}' must be 1 to ${MAX_TEXT} characters with no line breaks or control characters`);
	}
	return { ok: true, value };
}
