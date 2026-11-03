/**
 * The subsystem pass (Epic c2ba6fa6, Story s8): a queued derived pass that
 * groups a graph-complete repository's code files into subsystems and writes
 * them, stamped with the generation it read.
 *
 * It runs only on a complete graph (lc1). It reads the whole repository only
 * when it must (no contribution rows, nothing grouped yet, or its first pass for
 * the repository in this process); otherwise it reads again only the files the
 * store's changed-file record names, and regroups in memory from the per-file
 * contribution rows only when one of them changed (ISSUE-7d42b5dc). The file graph comes from the stored relationships
 * between code entities of two files of the repository -- IMPORTS, CALLS,
 * INHERITS, IMPLEMENTS and REFERENCES -- each weighted by kind (inheritance 2,
 * the rest 1) and by how it was established (extracted 1, inferred or chosen
 * 0.8, unknown 0.6, model 0.5), plus an edge of 0.1 from each file to its
 * directory's hub node. A relationship to a module stub, an external endpoint or another
 * repository's entity is not an edge: its target is not one of the
 * repository's code entities.
 *
 * Then each subsystem without a summary (a membership not summarised before)
 * gets one from the cheap-tier model (buildSummariserProvider, as document
 * summaries do), one call at a time, each after queued code work (as the
 * document sweep waits). A failed call leaves that summary empty and the next
 * pass -- even at the same generation -- retries it; shutdown or a generation
 * that advances stops the loop. A large subsystem is summarised in parts.
 */

import type { DbClient } from '../db/client.js';
import { entityIdsByU64s, entityU64ForId, findEntitiesByFile, getEntitiesByIds, listEntitiesForRepo } from '../db/entities.js';
import { outNeighbors } from '../db/graph/edges.js';
import { readIndexState } from '../db/index-state.js';
import { readSubsystems, restampSubsystemsInTxn, writeSubsystemSummary, writeSubsystems, type SubsystemGroupRow, type SubsystemView } from '../db/subsystems.js';
import { getGraphStore, withWriteTxn } from '../db/graph/store.js';
import { lookupRepoId } from '../db/repos.js';
import {
	clearContributionsInTxn, consumeChangedFilesInTxn, readChangedFilesInTxn, readContributionsInTxn, writeContributionInTxn,
	type FileContributionRow,
} from '../db/subsystem-changes.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { buildSummariserProvider } from '../analyze/context/shaper-provider.js';
import { SUBSYSTEM_SUMMARISER_PROMPT_PATH } from '../analyze/summariser/subsystem-prompt.js';
import { getLogger } from '../shared/logger.js';
import type { Entity, EntityKind, LLMMessage, LLMProvider, RelationEvidence, RelationKind, StructuredSchema } from '../shared/types.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { directoryHubs, groupSubsystems, type FileEdge } from './subsystems.js';

const log = getLogger('subsystem-pass');

/** The entity kinds that make a file a code file, and are counted as its subsystem's entities. */
const CODE_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>(['function', 'method', 'class', 'interface', 'type', 'variable', 'table', 'view']);

/** The relationships that bind two files, and their weight by kind. */
const KIND_WEIGHT: Readonly<Partial<Record<RelationKind, number>>> = { IMPORTS: 1, CALLS: 1, INHERITS: 2, IMPLEMENTS: 2, REFERENCES: 1 };
const GROUPING_KINDS = Object.keys(KIND_WEIGHT) as RelationKind[];

/** How much a relationship counts, by how it was established (s7). */
const EVIDENCE_WEIGHT: Readonly<Record<RelationEvidence, number>> = { extracted: 1, inferred: 0.8, chosen: 0.8, unknown: 0.6, model: 0.5 };

/** How a pass obtained its groups (ISSUE-7d42b5dc). */
export type SubsystemPassMode = 'full' | 'incremental' | 'unchanged';

export interface SubsystemPassResult {
	readonly ran:              boolean;
	readonly reason?:          'graph-incomplete' | 'up-to-date' | undefined;
	readonly generation:       number;
	readonly subsystems:       number;
	readonly summariesWritten: number;
	readonly summariesFailed:  number;
	/** Shutdown, or a new generation, stopped the summaries; the rest wait for the next pass. */
	readonly stopped:          boolean;
	/** How the groups were obtained; absent when the graph is not complete. */
	readonly mode?:            SubsystemPassMode | undefined;
	/** The files whose contributions the pass computed. */
	readonly filesRead:        number;
	/** The grouping work's time, before the summaries. */
	readonly elapsedMs:        number;
	/** When the pass itself began (after any hand-over or wait): pacing measures from it. */
	readonly startedAt:        number;
}

/** What the pass runs with: the model and the queue it yields to (the indexer supplies the queue's). */
export interface SubsystemPassDeps {
	/** The cheap-tier summariser; defaults to buildSummariserProvider (tests inject one). */
	readonly provider?:        LLMProvider | undefined;
	/** Resolves when no code work is queued or running: a summary waits for it, as the document sweep does. */
	readonly waitForCodeIdle?: (() => Promise<void>) | undefined;
	readonly isCodeIdle?:      (() => boolean) | undefined;
	/** The daemon is stopping: no further model call. */
	readonly shouldStop?:      (() => boolean) | undefined;
}

const SUMMARY_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['summary'],
	properties: { summary: { type: 'string', minLength: 1 } },
} as unknown as StructuredSchema;

/** The prompt, under src/prompts so a built daemon ships it (copy-assets). */
function loadPrompt(): string {
	// .../indexer/subsystem-pass.js -> .../indexer -> the source (or out) root
	return readFileSync(resolve(fileURLToPath(import.meta.url), '..', '..', SUBSYSTEM_SUMMARISER_PROMPT_PATH), 'utf8');
}

/**
 * The size of one summariser message's content. A subsystem whose files do not
 * fit is summarised in parts that do, in file order (so by directory), and the
 * part summaries are combined: every file is read, none is dropped.
 */
export const SUMMARY_PART_CHARS = 24_000;

/** Lines split into runs whose joined size fits one message. */
function chunk(lines: readonly string[]): string[][] {
	const out: string[][] = [];
	let cur: string[] = [];
	let size = 0;
	for (const line of lines) {
		if (cur.length > 0 && size + line.length + 1 > SUMMARY_PART_CHARS) { out.push(cur); cur = []; size = 0; }
		cur.push(line);
		size += line.length + 1;
	}
	if (cur.length > 0) out.push(cur);
	return out;
}

/** Asks the model for one summary from one message's content. */
export type SummaryAsk = (content: string) => Promise<string>;

/**
 * One subsystem's summary: from one message when its files fit, otherwise from
 * summaries of its parts (combined again while they do not fit), then one
 * message with the part summaries and the connections.
 */
export async function summariseSubsystem(
	sub:       SubsystemView,
	exportsOf: ReadonlyMap<string, readonly string[]>,
	nameOf:    ReadonlyMap<string, string>,
	ask:       SummaryAsk,
): Promise<string> {
	const fileLines = sub.files.map(f => `- ${f}: ${(exportsOf.get(f) ?? []).join(', ') || '(no exported names)'}`);
	const conns = sub.connections.length === 0 ? '(none)'
		: sub.connections.map(c => `- ${nameOf.get(c.to) ?? c.to}: ${Object.entries(c.kinds).map(([k, n]) => `${n} ${k}`).join(', ')}`).join('\n');
	const whole = `Subsystem: ${sub.name}\n\nFiles and their exported names:\n${fileLines.join('\n')}\n\nConnections to other subsystems:\n${conns}`;
	if (whole.length <= SUMMARY_PART_CHARS) return ask(whole);

	const parts = chunk(fileLines);
	let summaries: string[] = [];
	for (const [i, part] of parts.entries()) {
		summaries.push(`- part ${i + 1} of ${parts.length}: ${await ask(`Subsystem: ${sub.name} -- part ${i + 1} of ${parts.length} of its files\n\nFiles and their exported names:\n${part.join('\n')}`)}`);
	}
	while (summaries.join('\n').length > SUMMARY_PART_CHARS) {
		const next: string[] = [];
		const groups = chunk(summaries);
		// A round that cannot put two summaries in one message would only
		// rewrite them one by one: combine them as they are instead.
		if (groups.length >= summaries.length) break;
		for (const group of groups) next.push(`- ${await ask(`Subsystem: ${sub.name} -- summaries of some of its parts\n\n${group.join('\n')}`)}`);
		summaries = next;
	}
	return ask(`Subsystem: ${sub.name}\n\nIts files, summarised in parts:\n${summaries.join('\n')}\n\nConnections to other subsystems:\n${conns}`);
}

/** Thrown inside a summary to stop the loop: shutdown, or a new generation. */
class SummaryStop extends Error {}

/**
 * Repositories that had a full pass in this process (ISSUE-7d42b5dc): the first
 * pass for a repository in a process is full, so a store left behind by an older
 * daemon, a restore or any unrecorded change is corrected once per start.
 */
const fullPassDone = new Set<string>();

/** Test seam: forget which repositories had a full pass in this process. */
export function _forgetFullPassesForTest(): void {
	fullPassDone.clear();
}

/** A source or target of the file graph: a code entity or a file entity (the full pass's fileOfU64 rule). */
const isEndpoint = (e: Entity): boolean => CODE_KINDS.has(e.kind) || e.kind === 'file';

/**
 * The contribution rows of `files` (repo-relative file -> its entities): each
 * file's code-entity count and its outgoing grouping edges, aggregated per
 * target file by kind and evidence weight, to code or file entities of OTHER
 * files of the repository -- whatever the target file's code status, which the
 * regroup applies. A file with no code entity has no row (undefined).
 */
async function contributionsOf(
	files:      ReadonlyMap<string, readonly Entity[]>,
	targetFile: (u64s: readonly bigint[]) => Promise<Map<bigint, string>>,
): Promise<Map<string, FileContributionRow | undefined>> {
	const out = new Map<string, FileContributionRow | undefined>();
	for (const file of [...files.keys()].sort()) {
		const entities = files.get(file)!;
		const entityCount = entities.filter(e => CODE_KINDS.has(e.kind)).length;
		if (entityCount === 0) { out.set(file, undefined); continue; }
		const neighbours: { u64: bigint; kind: RelationKind; evidence: RelationEvidence }[] = [];
		for (const e of entities) {
			if (!isEndpoint(e)) continue;
			const u64 = await entityU64ForId(e.id);
			if (u64 === undefined) continue;
			for (const n of await outNeighbors(u64, { kindFilter: GROUPING_KINDS, withEvidence: true })) {
				neighbours.push({ u64: n.u64, kind: n.kind as RelationKind, evidence: n.evidence });
			}
		}
		const fileOf = await targetFile([...new Set(neighbours.map(n => n.u64))]);
		const byTarget = new Map<string, { weight: number; kinds: Partial<Record<RelationKind, number>> }>();
		for (const n of neighbours) {
			const to = fileOf.get(n.u64);
			if (to === undefined || to === file) continue;
			const edge = byTarget.get(to) ?? { weight: 0, kinds: {} };
			edge.weight += (KIND_WEIGHT[n.kind] ?? 0) * EVIDENCE_WEIGHT[n.evidence];
			edge.kinds[n.kind] = (edge.kinds[n.kind] ?? 0) + 1;
			byTarget.set(to, edge);
		}
		out.set(file, { entityCount, out: [...byTarget.keys()].sort().map(to => ({ to, ...byTarget.get(to)! })) });
	}
	return out;
}

/**
 * The groups of a repository's contribution rows: its code files (rows with
 * entityCount > 0), the edges between two of them, and the directory hubs --
 * the same graph the whole-repository read builds, in one deterministic order.
 */
function regroup(rows: ReadonlyMap<string, FileContributionRow>): SubsystemGroupRow[] {
	// Only code files have rows (a file with no code entity has none), so the rows' files are the nodes.
	const files = [...rows.keys()].sort();
	const code = new Set(files);
	const edges: FileEdge[] = [];
	for (const a of files) {
		for (const e of rows.get(a)!.out) if (code.has(e.to)) edges.push({ a, b: e.to, weight: e.weight, kinds: e.kinds });
	}
	const directories = directoryHubs(files);
	return groupSubsystems({ files, edges: [...edges, ...directories.edges], hubs: directories.hubs }).map(g => ({
		...g, entityCount: g.files.reduce((n, f) => n + (rows.get(f)?.entityCount ?? 0), 0),
	}));
}

const sameRow = (a: FileContributionRow | undefined, b: FileContributionRow | undefined): boolean =>
	JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Group a graph-complete repository's code files into subsystems, store them,
 * and summarise new ones (ISSUE-7d42b5dc: incrementally). Mode 'full' -- no
 * contribution rows, groups never stored, or the first pass for the repository
 * in this process -- reads the whole repository; otherwise only the files the
 * changed-file record names are read again, and the groups are recomputed in
 * memory from the contribution rows only when one of them changed ('incremental')
 * or merely restamped ('unchanged').
 */
export async function runSubsystemPass(opts: { readonly db: DbClient; readonly repoPath: string } & SubsystemPassDeps): Promise<SubsystemPassResult> {
	const { db, repoPath } = opts;
	const startedAt = Date.now();
	const none = { subsystems: 0, summariesWritten: 0, summariesFailed: 0, stopped: false, filesRead: 0, elapsedMs: 0, startedAt };
	const state = await readIndexState(repoPath);
	const generation = state?.generation ?? 0;
	if (state === undefined || !state.graphComplete) {
		log.info({ repo: repoPath, generation }, 'subsystem pass: the graph is not complete; nothing grouped');
		return { ran: false, reason: 'graph-incomplete', generation, ...none };
	}
	const repoId = await lookupRepoId(repoPath);
	if (repoId === undefined) return { ran: false, reason: 'graph-incomplete', generation, ...none };
	const store = await getGraphStore();
	const rel = (file: string) => file.startsWith(repoPath + '/') ? file.slice(repoPath.length + 1) : file;

	const record = readChangedFilesInTxn(store, repoId);
	const stored = await readSubsystems(repoPath);
	const storedRows = readContributionsInTxn(store, repoId);
	const full = storedRows.size === 0 || stored.computedAtGeneration === null || !fullPassDone.has(repoPath);

	let computed: Map<string, FileContributionRow | undefined>;
	let entities: Entity[] | undefined;
	if (full) {
		entities = await listEntitiesForRepo(db, repoPath);
		const byFile = new Map<string, Entity[]>();
		const fileOfU64 = new Map<bigint, string>();
		for (const e of entities) {
			const f = rel(e.file);
			const list = byFile.get(f);
			if (list === undefined) byFile.set(f, [e]); else list.push(e);
			if (!isEndpoint(e)) continue;
			const u64 = await entityU64ForId(e.id);
			if (u64 !== undefined) fileOfU64.set(u64, f);
		}
		computed = await contributionsOf(byFile, async u64s => new Map(u64s.filter(u => fileOfU64.has(u)).map(u => [u, fileOfU64.get(u)!])));
	} else {
		const byFile = new Map<string, Entity[]>();
		for (const { file } of record) byFile.set(file, await findEntitiesByFile(db, `${repoPath}/${file}`));
		computed = await contributionsOf(byFile, async u64s => {
			const ids = await entityIdsByU64s(u64s);
			const byId = new Map((await getEntitiesByIds(db, [...ids.values()])).map(e => [e.id, e]));
			const out = new Map<bigint, string>();
			for (const [u64, id] of ids) {
				const e = byId.get(id);
				if (e !== undefined && e.repo === repoPath && isEndpoint(e)) out.set(u64, rel(e.file));
			}
			return out;
		});
	}

	const changed = full || [...computed].some(([file, row]) => !sameRow(row, storedRows.get(file)));
	const mode: SubsystemPassMode = full ? 'full' : changed ? 'incremental' : 'unchanged';
	const rows = new Map(full ? [] : storedRows);
	for (const [file, row] of computed) { if (row === undefined) rows.delete(file); else rows.set(file, row); }
	const groups = changed ? regroup(rows) : undefined;

	await withWriteTxn(s => {
		if (full) clearContributionsInTxn(s, repoId);
		for (const [file, row] of computed) writeContributionInTxn(s, repoId, file, row);
		consumeChangedFilesInTxn(s, repoId, record);
		if (groups === undefined) restampSubsystemsInTxn(s, repoId, generation);
	});
	if (groups !== undefined) await writeSubsystems(repoPath, generation, groups);
	fullPassDone.add(repoPath);
	const elapsedMs = Date.now() - startedAt;
	const subsystems = groups?.length ?? stored.subsystems.length;
	log.info({ repo: repoPath, generation, mode, filesRead: computed.size, files: rows.size, subsystems, elapsedMs }, 'subsystem pass: grouped');

	const summaries = await summarise(db, repoPath, generation, entities, opts);
	log.info({ repo: repoPath, generation, mode, filesRead: computed.size, elapsedMs, subsystems, ...summaries }, 'subsystem pass: done');
	return {
		ran: groups !== undefined, ...(groups === undefined && { reason: 'up-to-date' as const }),
		generation, subsystems, ...summaries, mode, filesRead: computed.size, elapsedMs, startedAt,
	};
}

/** Summaries for the subsystems that have none, one model call at a time, each after code work. */
async function summarise(
	db:         DbClient,
	repoPath:   string,
	generation: number,
	known:      readonly Entity[] | undefined,
	deps:       SubsystemPassDeps,
): Promise<{ summariesWritten: number; summariesFailed: number; stopped: boolean }> {
	const { subsystems } = await readSubsystems(repoPath);
	const pending = subsystems.filter(s => s.summary === null);
	if (pending.length === 0) return { summariesWritten: 0, summariesFailed: 0, stopped: false };

	const cfg = loadAnalyzeConfig();
	const provider = deps.provider ?? buildSummariserProvider(cfg);
	const prompt = loadPrompt();
	const rel = (file: string) => file.startsWith(repoPath + '/') ? file.slice(repoPath.length + 1) : file;
	const exportsOf = new Map<string, string[]>();
	for (const e of known ?? await listEntitiesForRepo(db, repoPath)) {
		if (e.isExported !== true || !CODE_KINDS.has(e.kind)) continue;
		const list = exportsOf.get(rel(e.file));
		if (list === undefined) exportsOf.set(rel(e.file), [e.name]); else list.push(e.name);
	}
	const nameOf = new Map(subsystems.map(s => [s.id, s.name]));

	// Each model call: after code work (waitForCodeIdle), unless the daemon is
	// stopping or the graph moved on; no await between the last idle check and
	// the call, as in the document sweep. One call at a time: each is awaited.
	const ask: SummaryAsk = async (content) => {
		for (;;) {
			await deps.waitForCodeIdle?.();
			if (deps.shouldStop?.() === true) throw new SummaryStop('stopping');
			if (((await readIndexState(repoPath))?.generation ?? generation) !== generation) throw new SummaryStop('new generation');
			if (deps.isCodeIdle?.() === false) continue;
			break;
		}
		const out = await provider.completeStructured<{ summary: string }>([
			{ role: 'system', content: prompt },
			{ role: 'user', content },
		] satisfies LLMMessage[], SUMMARY_SCHEMA, { maxAttempts: cfg.shaper.structuredOutputRetries, disableThinking: true, maxTokens: 1_024 });
		return out.summary.trim();
	};

	let written = 0, failed = 0;
	for (const sub of pending) {
		let summary: string;
		try {
			summary = await summariseSubsystem(sub, exportsOf, nameOf, ask);
		} catch (err) {
			if (err instanceof SummaryStop) return { summariesWritten: written, summariesFailed: failed, stopped: true };
			failed++;
			log.warn({ repo: repoPath, subsystem: sub.id, name: sub.name, err: err instanceof Error ? err.message : String(err) }, 'subsystem pass: a summary call failed; it stays empty until the next pass');
			continue;
		}
		// The id is the membership: the summary holds while a row with that id exists.
		if (await writeSubsystemSummary(repoPath, sub.id, summary, cfg.summariserModel)) written++;
	}
	log.info({ repo: repoPath, generation, written, failed }, 'subsystem pass: summaries written');
	return { summariesWritten: written, summariesFailed: failed, stopped: false };
}
