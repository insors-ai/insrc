/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ts from 'typescript';


/**
 * The inventory of artifact write paths (sc3) and the detector that checks it.
 *
 * Every production file that writes a file with `writeArtifact`, `writeAtomic`,
 * `writeFileSync`, `renameSync`, `appendFileSync` or `appendSidecarLine`, calls the
 * artifact store's `write`, or passes one of them on as a value (a
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

export type WriteClass = 'content' | 'meta-only' | 'mixed' | 'render' | 'record' | 'migration' | 'store' | 'non-artifact';
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
	readonly sites?: readonly WriteSite[] | undefined;
	readonly note:  string;
}

export const ARTIFACT_WRITE_INVENTORY: readonly InventoryEntry[] = [
	// --- content: the body or something a signoff covers changes -------------------
	{ file: 'src/daemon/steps/workflow-step/phases/synthesize.ts', class: 'content', via: 'both', note: 'the draft pair: json is content, markdown a render' },
	{ file: 'src/daemon/workflow-rpc.ts', class: 'content', via: 'both', note: 'the server-side draft pair' },
	{ file: 'src/workflow/resolve-comment.ts', class: 'content', via: 'writeArtifact', note: 'appends the comment to body.openQuestions' },
	{ file: 'src/workflow/tracker/unit-head.ts', class: 'content', via: 'writeArtifact', note: 'makes the EPIC or STORY head of a unit that has none (a draft with an empty body, a lifecycle at revision 1 and its create entry); it never rewrites a head that exists' },
	{ file: 'src/workflow/runners/build/standalone-record.ts', class: 'content', via: 'both', note: 'the BUILD record is regenerated on each persist' },
	{ file: 'src/workflow/runners/build/test-record.ts', class: 'content', via: 'both', note: 'the TESTS record replaces body.tasks; its rollback restores the earlier bytes and revision' },
	{ file: 'src/daemon/steps/code-review-step/handler.ts', class: 'content', via: 'injected', note: 'injects the runner\'s revision-minting writer (writeRecordFile) into the runner; it has no raw writer of its own' },
	{ file: 'src/workflow/code-review/runner.ts', class: 'content', via: 'both', note: 'the code-review record is signoff-covered: its default writer (writeRecordFile) writes the json as content; the step handler uses the same writer' },

	// --- meta-only: stamps, review stamps, tracker patches, resolutions -------------
	{ file: 'src/workflow/questions.ts', class: 'meta-only', via: 'both', note: 'meta.questionResolutions only' },
	{ file: 'src/workflow/tracker/refs.ts', class: 'meta-only', via: 'writeArtifact', note: 'patchTrackerMeta' },
	{ file: 'src/workflow/tracker/binding.ts', class: 'meta-only', via: 'writeArtifact', note: 'the tracker binding: the one writer of meta.envelope.binding after creation; a synchronous patch that moves no revision, refused while the store has a write staged' },
	{ file: 'src/workflow/tracker/attach.ts', class: 'meta-only', via: 'writeArtifact', note: 'recordAttachment: the one writer of meta.envelope.attachments after creation; a synchronous patch that moves no revision, refused while the store has a write staged' },
	{ file: 'src/workflow/tasks/task-set.ts', class: 'content', via: 'injected', note: 'the Task set: writes the TASKS and TASK heads through ArtifactStore.write and update (a Task\'s own content, so each change mints a revision), and a build round or a pending close as a revision-less log entry through History' },
	{ file: 'src/workflow/bugfix/stamp.ts', class: 'meta-only', via: 'writeArtifact', note: 'single-field meta patch (meta.parentRef)' },
	{ file: 'src/workflow/orchestrator.ts', class: 'meta-only', via: 'both', note: 'tracker push and sync patch the Define meta; the scope-analyze cache is not an artifact' },

	// --- mixed: both kinds, each site named ---------------------------------------
	{
		file: 'src/workflow/gates.ts', class: 'mixed', via: 'both',
		sites: [
			{ fn: 'appendStoryToDefine', kind: 'content' },
			{ fn: 'approveArtifactByJsonPath', kind: 'meta-only' },
		],
		note: 'the extend path changes body.stories; approve stamps meta.rangeBase after the lifecycle approves (reject and ack-stale write no head)',
	},
	{ file: 'src/workflow/review/resolve.ts', class: 'mixed', via: 'both', sites: [{ fn: 'resolveReviewFinding', kind: 'content' }], note: 'apply changes the body; accept, override and defer append a resolution entry to the log (report-file.ts, through the sidecar store) and write no head' },

	// --- store: the artifact store itself ------------------------------------------
	{ file: 'src/workflow/artifact-core/lifecycle-service.ts', class: 'meta-only', via: 'injected', note: 'applies lifecycle operations through ArtifactStore.update: the content is never changed, so no revision is minted, and the store logs each operation' },
	{ file: 'src/workflow/artifact-core/store.ts', class: 'store', via: 'injected', note: 'ArtifactStore.write prepares the head with prepareArtifactWrite (the one revision rule) and replaces it with writeAtomic, after staging the operation in the journal and appending its change log entry' },

	// --- record: a change request, not a claim unit or a signoff-covered stage artifact ---

	// --- the conversion (s9): one-time writers that bring a repository onto the common model ----
	{ file: 'src/workflow/convert/migrated-head.ts', class: 'migration', via: 'raw', note: 'the migration write: replaces a head with its converted bytes under the artifact\'s lock, after the migrated log entries, and keeps meta.revision, the status and the approval as stored (the store would move the revision and return an approved head to draft)' },
	{ file: 'src/workflow/convert/rename.ts', class: 'migration', via: 'raw', note: 'renames the uppercase story ids of heads and rewrites the references to them, in heads and markdown' },
	{ file: 'src/workflow/convert/stamps.ts', class: 'migration', via: 'raw', note: 'stamps meta.epicCreatedAt on a head that lacks it' },
	{ file: 'src/workflow/convert/amendments.ts', class: 'migration', via: 'raw', note: 'writes each flat amendment record as a head' },
	{ file: 'src/workflow/convert/units.ts', class: 'migration', via: 'both', note: 'creates the EPIC and STORY heads through the store and moves the Epic and Story bindings and attachments with meta-only patches of meta.envelope; no revision moves' },
	{ file: 'src/workflow/convert/apply.ts', class: 'migration', via: 'raw', note: 'keeps the progress file (the before-snapshot) of an apply under .insrc' },

	// --- render: markdown only ----------------------------------------------------
	{ file: 'src/workflow/review/persist-review.ts', class: 'render', via: 'raw', note: 'writes the markdown of a reviewed artifact; the fix and the review record go through LifecycleService and the history' },
	{ file: 'src/workflow/tracker/link.ts', class: 'render', via: 'raw', note: 'writes the markdown of a document with its tracker link' },
	{ file: 'src/workflow/tracker-auto.ts', class: 'render', via: 'raw', note: 'the re-render of a document after its issue exists' },
	{ file: 'src/workflow/artifacts/companion/render.ts', class: 'render', via: 'raw', note: 'writes the companion diagram files' },

	// --- migration -----------------------------------------------------------------
	{ file: 'src/daemon/steps/workflow-step/resume.ts', class: 'migration', via: 'raw', note: 'a resume puts a parker\'s draft files back byte for byte, meta.revision included: it restores, it does not author, so it mints no revision' },

	// --- non-artifact: caches, configuration, logs, locks, the primitives themselves ---
	{ file: 'src/workflow/storage.ts', class: 'non-artifact', via: 'both', note: 'defines writeAtomic and writeArtifact; appendRunLog and appendProgressLog append to the jsonl run traces' },
	{ file: 'src/workflow/artifact-core/sidecar.ts', class: 'non-artifact', via: 'raw', note: 'appendSidecarLine, the one function that appends a history record as a JSON line to the path it is given; the lines are history, not an artifact head' },
	{ file: 'src/workflow/artifact-core/repo-schema.ts', class: 'non-artifact', via: 'raw', note: 'writeRepoSchema replaces .insrc/schema.json (the version marker) atomically; only the conversion calls it' },
	{ file: 'src/workflow/artifact-core/journal.ts', class: 'non-artifact', via: 'raw', note: 'the durable WriteJournal replaces .insrc/journal/<id>.json atomically: a staged operation is a pending write kept for crash recovery (not committed, listed in the ignore file), not an artifact head' },
	{ file: 'src/workflow/artifact-core/sidecar-store.ts', class: 'non-artifact', via: 'raw', note: 'the file SidecarStore appends history records through appendSidecarLine; its ensure step appends the missing merge rules to .gitattributes and the journal folder to .gitignore (repository configuration, never an artifact head)' },
	{ file: 'src/workflow/identity/identity-service.ts', class: 'non-artifact', via: 'raw', note: 'IdentityService.declare replaces ~/.insrc/identity.json atomically with writeAtomic: a person\'s self-declared ids, kept per user for attribution and display only, never an artifact head and never read by a gate' },
	{ file: 'src/daemon/fatal.ts', class: 'non-artifact', via: 'raw', note: 'appends the crash trace to daemon.crash.log' },
	{ file: 'src/daemon/shutdown.ts', class: 'non-artifact', via: 'raw', note: 'appends the last line (reason and health) to the shutdown record' },
	{ file: 'src/bin/insrc-shutdown-watchdog.ts', class: 'non-artifact', via: 'raw', note: 'appends independent shutdown deadline diagnostics, never artifact heads' },
	{ file: 'src/daemon/run-file-ownership.ts', class: 'non-artifact', via: 'raw', note: 'publishes daemon PID ownership and appends ownership-conflict diagnostics' },
	{ file: 'src/shared/daemon-run-files.ts', class: 'non-artifact', via: 'raw', note: 'writes run-file guard owner/nonce records, never workflow artifact heads' },
	{ file: 'src/daemon/steps/analyze-step/handler.ts', class: 'non-artifact', via: 'raw', note: 'appends the input and output of each step call to its trace file' },
	{ file: 'src/daemon/steps/build-step/handler.ts', class: 'non-artifact', via: 'raw', note: 'appends the input and output of each step call to its trace file' },
	{ file: 'src/daemon/steps/workflow-step/handler.ts', class: 'non-artifact', via: 'raw', note: 'appends the input and output of each step call to its trace file' },
	{ file: 'src/daemon/steps/review-step/handler.ts', class: 'non-artifact', via: 'raw', note: 'appends the input and output of each step call to its trace file' },
	{ file: 'src/config/feedback.ts', class: 'non-artifact', via: 'raw', note: 'appends feedback entries to the configuration feedback file' },
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
	{ file: 'src/daemon/handler-runtime.ts', class: 'non-artifact', via: 'raw', note: 'the config.write handler replaces ~/.insrc/config.json (the daemon configuration), never an artifact head' },
	{ file: 'src/daemon/steps/build-step/validation-checks.ts', class: 'non-artifact', via: 'raw', note: 'temporary validation output' },
	{ file: 'src/daemon/update-runner.ts', class: 'non-artifact', via: 'raw', note: 'daemon update state' },
	{ file: 'src/db/graph/store.ts', class: 'non-artifact', via: 'raw', note: 'graph store file moves' },
	{ file: 'src/indexer/repo-ignore-config.ts', class: 'non-artifact', via: 'raw', note: 'repo ignore configuration' },
	{ file: 'src/workflow/config/github-store.ts', class: 'non-artifact', via: 'raw', note: 'github.json, written only by the daemon' },
	{ file: 'src/workflow/runners/build/range-base.ts', class: 'non-artifact', via: 'raw', note: 'temporary git index for the range base' },
	{ file: 'src/workflow/team/create-only.ts', class: 'non-artifact', via: 'raw', note: 'the starter team policy file' },
	{ file: 'src/workflow/team/handoff.ts', class: 'non-artifact', via: 'raw', note: 'the handoff checkpoint, written into a temporary worktree and committed to the handoff branch' },
	{ file: 'src/workflow/team/sighting-store.ts', class: 'non-artifact', via: 'raw', note: 'the policy sighting store' },
	{ file: 'src/workflow/tracker/setup.ts', class: 'non-artifact', via: 'raw', note: 'tracker setup configuration' },
];

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

// writeRecordFile is the code-review runner's revision-minting writer (it calls writeArtifact).
// appendFileSync and appendSidecarLine (the sidecar history primitive) are raw appends.
const WRITER_NAMES = ['writeArtifact', 'writeRecordFile', 'writeAtomic', 'writeFileSync', 'renameSync', 'appendFileSync', 'appendSidecarLine'] as const;
type WriterName = (typeof WRITER_NAMES)[number];

export interface WriterCall  { readonly name: WriterName; readonly line: number; readonly annotated: boolean }
export interface WriterValue { readonly name: WriterName; readonly line: number }
export interface WriterScan {
	readonly calls:  readonly WriterCall[];
	readonly values: readonly WriterValue[];
	readonly usesWriteArtifact: boolean;
	readonly rawCalls: readonly WriterCall[];
	/** Calls of `.write(...)` or `.update(...)` on a value in a file that imports the artifact store (it mints revisions). */
	readonly storeWrites: readonly number[];
}

/** An import specifier that names the artifact store module; inside artifact-core itself that is `./store.js`. */
const STORE_MODULE = /(?:^|\/)artifact-core\/store(?:\.js)?$/;
const SIBLING_STORE = /^\.\/store(?:\.js)?$/;
const IN_ARTIFACT_CORE = /(?:^|\/)artifact-core\//;

/** Find the writers a source file calls, passes on as a value, or aliases. Syntax-aware:
 *  it follows `import { writeAtomic as save }`, `const w = writeAtomic`, namespace
 *  imports (`fs.writeFileSync`) and writers passed as arguments or defaults. */
export function scanWriters(source: string, file = ''): WriterScan {
	const sf = ts.createSourceFile('scan.ts', source, ts.ScriptTarget.Latest, true);
	const original = source.split('\n');
	const lineOf = (node: ts.Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
	const names = new Map<string, WriterName>();          // local name -> the writer it stands for
	const namespaces = new Set<string>();                 // `import * as fs` / `import fs from`, for fs.writeFileSync
	const isWriter = (n: string): n is WriterName => (WRITER_NAMES as readonly string[]).includes(n);
	let importsStore = false;

	for (const o of WRITER_NAMES) names.set(o, o);
	// imports: a renamed writer keeps its meaning, and the original name stops standing for it
	sf.forEachChild(function visitImports(node) {
		if (ts.isImportDeclaration(node)) {
			if (ts.isStringLiteral(node.moduleSpecifier) && (STORE_MODULE.test(node.moduleSpecifier.text) || (SIBLING_STORE.test(node.moduleSpecifier.text) && IN_ARTIFACT_CORE.test(file)))) importsStore = true;
			const clause = node.importClause;
			if (clause?.name !== undefined) namespaces.add(clause.name.text);
			const nb = clause?.namedBindings;
			if (nb !== undefined && ts.isNamespaceImport(nb)) namespaces.add(nb.name.text);
			if (nb !== undefined && ts.isNamedImports(nb)) {
				for (const el of nb.elements) {
					const imported = (el.propertyName ?? el.name).text;
					if (el.propertyName !== undefined && isWriter(imported)) {
						names.delete(imported);
						names.set(el.name.text, imported);
					}
				}
			}
		}
	});
	// aliases: `const w = writeAtomic` (repeat until stable so chains are followed)
	for (let changed = true; changed;) {
		changed = false;
		const walk = (node: ts.Node): void => {
			if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && ts.isIdentifier(node.initializer)) {
				const target = names.get(node.initializer.text);
				if (target !== undefined && !names.has(node.name.text)) { names.set(node.name.text, target); changed = true; }
			}
			ts.forEachChild(node, walk);
		};
		walk(sf);
	}

	const calls: WriterCall[] = [];
	const values: WriterValue[] = [];
	const storeWrites: number[] = [];
	const noted = (line: number): boolean => /raw-write:/.test(original[line] ?? '') || /raw-write:/.test(original[line - 1] ?? '');
	const seenCallees = new Set<ts.Node>();

	const walk = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node) || ts.isTypeNode(node)) return;
		if (ts.isCallExpression(node)) {
			const callee = node.expression;
			let name: WriterName | undefined;
			if (ts.isIdentifier(callee)) name = names.get(callee.text);
			else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text) && isWriter(callee.name.text)) name = callee.name.text;
			if (importsStore && ts.isPropertyAccessExpression(callee) && (callee.name.text === 'write' || callee.name.text === 'update')) storeWrites.push(lineOf(node) + 1);
			if (name !== undefined) {
				seenCallees.add(callee);
				const line = lineOf(node);
				calls.push({ name, line: line + 1, annotated: noted(line) });
			}
		}
		if (ts.isIdentifier(node) && !seenCallees.has(node)) {
			const name = names.get(node.text);
			const parent = node.parent;
			const definesIt = (ts.isFunctionDeclaration(parent) && parent.name === node)
				|| (ts.isVariableDeclaration(parent) && parent.name === node)
				|| (ts.isPropertyAccessExpression(parent) && parent.name === node)
				|| (ts.isPropertyAssignment(parent) && parent.name === node)
				|| ts.isExportSpecifier(parent) || ts.isImportSpecifier(parent) || ts.isImportClause(parent);
			if (name !== undefined && !definesIt && !(ts.isCallExpression(parent) && parent.expression === node)) {
				values.push({ name, line: lineOf(node) + 1 });
			}
		}
		if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && namespaces.has(node.expression.text) && isWriter(node.name.text)
			&& !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
			values.push({ name: node.name.text, line: lineOf(node) + 1 });
		}
		ts.forEachChild(node, walk);
	};
	walk(sf);

	const mints = (n: WriterName): boolean => n === 'writeArtifact' || n === 'writeRecordFile';
	const rawCalls = calls.filter(c => !mints(c.name));
	const usesWriteArtifact = calls.some(c => mints(c.name)) || values.some(v => mints(v.name)) || storeWrites.length > 0;
	return { calls, values, usesWriteArtifact, rawCalls, storeWrites };
}

/** True when the file calls a raw writer, calls the store's write, or passes a writer on as a value. */
export function writesAnything(scan: WriterScan): boolean {
	return scan.calls.length > 0 || scan.values.length > 0 || scan.storeWrites.length > 0;
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
export function checkInventoryEntry(source: string, entry: InventoryEntry | undefined, file: string = entry?.file ?? ''): string[] {
	const scan = scanWriters(source, file);
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
	if (entry.class === 'store' && !/\bprepareArtifactWrite\b/.test(source)) {
		problems.push('a store file must prepare its heads with prepareArtifactWrite so the revision rule has one implementation');
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
