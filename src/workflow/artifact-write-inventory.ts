/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The inventory of artifact write paths (sc3) and the detector that checks it.
 *
 * Every production file that writes a file with `writeArtifact`, `writeAtomic`,
 * `writeFileSync` or `renameSync`, or passes one of them on as a value (a
 * default parameter such as `write: writeAtomic`, an alias, an argument), has
 * one entry in {@link ARTIFACT_WRITE_INVENTORY} saying what it writes. The
 * rules are enforced by `__tests__/artifact-write-inventory.test.ts`:
 *
 *  - a content, meta-only or mixed file calls `writeArtifact`;
 *  - every raw write in such a file carries a `raw-write: <why>` comment on the
 *    same or the previous line, naming why it is not an artifact JSON write;
 *  - a mixed file names each write site and the kind it writes with;
 *  - an entry must still use at least one of `writeArtifact`, a raw write or an
 *    injected writer (so a fully migrated file keeps a valid entry).
 *
 * The revision (`meta.revision`) is minted by `writeArtifact` on content writes
 * only, so anything written around it would leave a stale revision under a
 * signoff.
 */

export type WriteClass = 'content' | 'meta-only' | 'mixed' | 'render' | 'record' | 'migration' | 'non-artifact';
export type WriteVia = 'writeArtifact' | 'raw' | 'injected' | 'both';

export interface WriteSite {
	/** The exported function that holds the write. */
	readonly fn:   string;
	/** `content`, `meta-only`, or `content|meta-only` when the call chooses at run time. */
	readonly kind: 'content' | 'meta-only' | 'content|meta-only';
}

export interface InventoryEntry {
	/** Repo-relative path. */
	readonly file:  string;
	readonly class: WriteClass;
	readonly via:   WriteVia;
	/** A mixed entry names each site. */
	readonly sites?: readonly WriteSite[];
	readonly note:  string;
}

export const ARTIFACT_WRITE_INVENTORY: readonly InventoryEntry[] = [
	// --- content: the body or something a signoff covers changes -------------------
	{ file: 'src/daemon/steps/workflow-step/phases/synthesize.ts', class: 'content', via: 'both', note: 'the draft pair: json is content, markdown a render' },
	{ file: 'src/daemon/workflow-rpc.ts', class: 'content', via: 'both', note: 'the server-side draft pair' },
	{ file: 'src/workflow/resolve-comment.ts', class: 'content', via: 'writeArtifact', note: 'appends the comment to body.openQuestions' },
	{ file: 'src/workflow/runners/build/standalone-record.ts', class: 'content', via: 'both', note: 'the BUILD record is regenerated on each persist' },
	{ file: 'src/workflow/runners/build/test-record.ts', class: 'content', via: 'both', note: 'the TESTS record replaces body.tasks; its rollback restores the earlier bytes and revision' },
	{ file: 'src/workflow/code-review/runner.ts', class: 'content', via: 'both', note: 'the code-review record is signoff-covered: its default writer (writeRecordFile) writes the json as content; the step handler uses the same writer' },

	// --- meta-only: stamps, review stamps, tracker patches, resolutions -------------
	{ file: 'src/workflow/artifacts/provenance/writer.ts', class: 'meta-only', via: 'writeArtifact', note: 'feedback is human provenance, not the stage content: appending it never mints a revision' },
	{ file: 'src/workflow/questions.ts', class: 'meta-only', via: 'both', note: 'meta.questionResolutions only' },
	{ file: 'src/daemon/steps/review-step/phases/findings.ts', class: 'meta-only', via: 'both', note: 'meta.review only; the body is written back untouched' },
	{ file: 'src/workflow/tracker/refs.ts', class: 'meta-only', via: 'writeArtifact', note: 'patchTrackerMeta' },
	{ file: 'src/workflow/bugfix/stamp.ts', class: 'meta-only', via: 'writeArtifact', note: 'single-field meta patch (meta.parentRef)' },
	{ file: 'src/workflow/orchestrator.ts', class: 'meta-only', via: 'both', note: 'tracker push and sync patch the Define meta; the scope-analyze cache is not an artifact' },

	// --- mixed: both kinds, each site named ---------------------------------------
	{
		file: 'src/workflow/gates.ts', class: 'mixed', via: 'both',
		sites: [
			{ fn: 'appendStoryToDefine', kind: 'content' },
			{ fn: 'ackStaleArtifact', kind: 'meta-only' },
			{ fn: 'approveArtifactByJsonPath', kind: 'meta-only' },
			{ fn: 'rejectArtifactByJsonPath', kind: 'meta-only' },
		],
		note: 'the extend path changes body.stories; approve, reject and ack-stale change only meta',
	},
	{ file: 'src/workflow/review/resolve.ts', class: 'mixed', via: 'both', sites: [{ fn: 'resolveReviewFinding', kind: 'content|meta-only' }], note: 'apply changes the body; accept, override and defer change only meta' },
	{ file: 'src/workflow/review/run-artifact.ts', class: 'mixed', via: 'both', sites: [{ fn: 'reviewArtifactFile', kind: 'content|meta-only' }], note: 'auto-fixes change the body; a report-only review changes only meta' },
	{ file: 'src/daemon/steps/review-step/phases/verdicts.ts', class: 'mixed', via: 'both', sites: [{ fn: 'handleVerdicts', kind: 'content|meta-only' }], note: 'auto-fixes change the body; a report-only review changes only meta' },

	// --- record: a change request, not a claim unit or a signoff-covered stage artifact ---
	{ file: 'src/workflow/amendments/store.ts', class: 'record', via: 'raw', note: 'an amendment is a change request against the HLD; no signoff binds to its revision. If amendments are ever put under signoff this entry becomes content' },

	// --- render: markdown only ----------------------------------------------------
	{ file: 'src/workflow/tracker/link.ts', class: 'render', via: 'raw', note: 'writes the markdown of a document with its tracker link' },
	{ file: 'src/workflow/tracker-auto.ts', class: 'render', via: 'raw', note: 'the re-render of a document after its issue exists' },
	{ file: 'src/workflow/artifacts/companion/render.ts', class: 'render', via: 'raw', note: 'writes the companion diagram files' },

	// --- migration -----------------------------------------------------------------
	{ file: 'src/workflow/migrate-docs-tree.ts', class: 'migration', via: 'raw', note: 'moves the docs tree to the nested layout; rewrites files in place once' },

	// --- non-artifact: caches, configuration, logs, locks, the primitives themselves ---
	{ file: 'src/workflow/storage.ts', class: 'non-artifact', via: 'both', note: 'defines writeAtomic and writeArtifact' },
	{ file: 'src/workflow/artifact-write-inventory.ts', class: 'non-artifact', via: 'writeArtifact', note: 'this inventory and its detector name the writers in patterns; it writes nothing' },
	{ file: 'src/agent/providers/cli-provider.ts', class: 'non-artifact', via: 'raw', note: 'temporary prompt and schema files for the CLI subprocess' },
	{ file: 'src/analyze/context/cache.ts', class: 'non-artifact', via: 'raw', note: 'analyze context cache' },
	{ file: 'src/analyze/context/driver.ts', class: 'non-artifact', via: 'raw', note: 'analyze context scratch output' },
	{ file: 'src/analyze/executor/cache.ts', class: 'non-artifact', via: 'raw', note: 'analyze executor cache' },
	{ file: 'src/analyze/orchestrator/persistence.ts', class: 'non-artifact', via: 'raw', note: 'analyze run persistence' },
	{ file: 'src/analyze/planner/cache.ts', class: 'non-artifact', via: 'raw', note: 'analyze planner cache' },
	{ file: 'src/analyze/runtimes/shared/adherence-topic-constraints.ts', class: 'non-artifact', via: 'raw', note: 'adherence topic cache' },
	{ file: 'src/cli/services/setup.ts', class: 'non-artifact', via: 'raw', note: 'setup configuration' },
	{ file: 'src/config/reconcile-io.ts', class: 'non-artifact', via: 'both', note: 'configuration file reconcile, with injectable writers' },
	{ file: 'src/config/templates.ts', class: 'non-artifact', via: 'raw', note: 'configuration templates' },
	{ file: 'src/daemon/index.ts', class: 'non-artifact', via: 'raw', note: 'daemon pid and status files' },
	{ file: 'src/daemon/lifecycle.ts', class: 'non-artifact', via: 'raw', note: 'daemon lifecycle files' },
	{ file: 'src/daemon/steps/build-step/validation-checks.ts', class: 'non-artifact', via: 'raw', note: 'temporary validation output' },
	{ file: 'src/daemon/update-runner.ts', class: 'non-artifact', via: 'raw', note: 'daemon update state' },
	{ file: 'src/db/graph/store.ts', class: 'non-artifact', via: 'raw', note: 'graph store file moves' },
	{ file: 'src/indexer/repo-ignore-config.ts', class: 'non-artifact', via: 'raw', note: 'repo ignore configuration' },
	{ file: 'src/workflow/config/github-store.ts', class: 'non-artifact', via: 'raw', note: 'github.json, written only by the daemon' },
	{ file: 'src/workflow/runners/build/range-base.ts', class: 'non-artifact', via: 'raw', note: 'temporary git index for the range base' },
	{ file: 'src/workflow/team/create-only.ts', class: 'non-artifact', via: 'raw', note: 'the starter team policy file' },
	{ file: 'src/workflow/team/sighting-store.ts', class: 'non-artifact', via: 'raw', note: 'the policy sighting store' },
	{ file: 'src/workflow/tracker/setup.ts', class: 'non-artifact', via: 'raw', note: 'tracker setup configuration' },
];

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

const WRITER_NAMES = ['writeArtifact', 'writeAtomic', 'writeFileSync', 'renameSync'] as const;
type WriterName = (typeof WRITER_NAMES)[number];

export interface WriterCall  { readonly name: WriterName; readonly line: number; readonly annotated: boolean }
export interface WriterValue { readonly name: WriterName; readonly line: number }
export interface WriterScan {
	readonly calls:  readonly WriterCall[];
	readonly values: readonly WriterValue[];
	readonly usesWriteArtifact: boolean;
	readonly rawCalls: readonly WriterCall[];
}

/** Blank out block comments, line comments and string contents, keeping line numbers. */
function neutralise(source: string): string {
	let s = source.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
	s = s.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (_m, pre: string) => pre);
	s = s.replace(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g, m => m[0] + ' '.repeat(Math.max(0, m.length - 2)) + m[m.length - 1]);
	return s;
}

/** Remove import statements (multi-line included), keeping line numbers. */
function withoutImports(s: string): string {
	return s.replace(/(^|\n)\s*import\s+(?:type\s+)?[^;]*?from\s*['"][^'"]+['"]\s*;?/g, m => m.replace(/[^\n]/g, ' '));
}

/** Find the writers a source file calls, passes on as a value, or defines. */
export function scanWriters(source: string): WriterScan {
	const original = source.split('\n');
	const code = withoutImports(neutralise(source)).split('\n');
	const calls: WriterCall[] = [];
	const values: WriterValue[] = [];
	code.forEach((text, i) => {
		for (const name of WRITER_NAMES) {
			const re = new RegExp(`\\b${name}\\b(\\s*\\()?`, 'g');
			let m: RegExpExecArray | null;
			while ((m = re.exec(text)) !== null) {
				const before = text.slice(0, m.index);
				if (/\bfunction\s+$/.test(before) || /\.\s*$/.test(before)) continue;   // a definition, or a member of another object
				if (/\bexport\s*\{[^}]*$/.test(before)) continue;                         // a re-export list
				if (m[1] !== undefined) {
					const noted = /raw-write:/.test(original[i] ?? '') || /raw-write:/.test(original[i - 1] ?? '');
					calls.push({ name, line: i + 1, annotated: noted });
				} else {
					values.push({ name, line: i + 1 });
				}
			}
		}
	});
	const rawCalls = calls.filter(c => c.name !== 'writeArtifact');
	const usesWriteArtifact = calls.some(c => c.name === 'writeArtifact') || values.some(v => v.name === 'writeArtifact');
	return { calls, values, usesWriteArtifact, rawCalls };
}

/** True when the file calls a raw writer, or passes a writer on as a value. */
export function writesAnything(scan: WriterScan): boolean {
	return scan.calls.length > 0 || scan.values.length > 0;
}

/** The text of one top-level function, from its declaration to the next one. */
export function functionBody(source: string, fn: string): string | undefined {
	const start = source.search(new RegExp(`(?:^|\\n)(?:export\\s+)?(?:async\\s+)?function\\s+${fn}\\b`));
	if (start < 0) return undefined;
	const rest = source.slice(start + 1);
	const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+/);
	return next < 0 ? rest : rest.slice(0, next);
}

/** The kind literals a function's `writeArtifact(...)` calls pass. */
export function writeKindsIn(body: string): Set<'content' | 'meta-only'> {
	const kinds = new Set<'content' | 'meta-only'>();
	const re = /writeArtifact\(/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(body)) !== null) {
		const args = body.slice(m.index, body.indexOf(';', m.index));
		if (/'content'/.test(args)) kinds.add('content');
		if (/'meta-only'/.test(args)) kinds.add('meta-only');
	}
	return kinds;
}

/**
 * The rule violations of one source file against its inventory entry (or the
 * lack of one). Empty means the file is in order.
 */
export function checkInventoryEntry(source: string, entry: InventoryEntry | undefined): string[] {
	const scan = scanWriters(source);
	const problems: string[] = [];
	if (entry === undefined) {
		if (writesAnything(scan)) problems.push('writes artifacts or passes a writer on but has no inventory entry');
		return problems;
	}
	if (!writesAnything(scan)) problems.push('the entry names a file that uses none of writeArtifact, a raw write or an injected writer');
	const artifactClass = entry.class === 'content' || entry.class === 'meta-only' || entry.class === 'mixed';
	if (artifactClass) {
		if (!scan.usesWriteArtifact) problems.push(`a ${entry.class} file must call writeArtifact`);
		for (const c of scan.rawCalls) {
			if (!c.annotated) problems.push(`line ${c.line}: raw ${c.name} without a 'raw-write: <why>' comment`);
		}
	}
	if (entry.class === 'mixed') {
		if (entry.sites === undefined || entry.sites.length === 0) problems.push('a mixed entry must name its write sites');
		for (const site of entry.sites ?? []) {
			const body = functionBody(source, site.fn);
			if (body === undefined) { problems.push(`site ${site.fn}: no such function`); continue; }
			const kinds = writeKindsIn(body);
			const want = site.kind === 'content|meta-only' ? ['content', 'meta-only'] : [site.kind];
			for (const k of want) if (!kinds.has(k as 'content' | 'meta-only')) problems.push(`site ${site.fn}: expected a writeArtifact with kind '${k}'`);
			if (site.kind !== 'content|meta-only') for (const k of kinds) if (k !== site.kind) problems.push(`site ${site.fn}: writes with kind '${k}', the entry says '${site.kind}'`);
		}
	}
	return problems;
}
