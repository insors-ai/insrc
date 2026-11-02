/**
 * The subsystem pass (Epic c2ba6fa6, Story s8): a queued derived pass that
 * groups a graph-complete repository's code files into subsystems and writes
 * them, stamped with the generation it read.
 *
 * It runs only on a complete graph (lc1) and only when the stored subsystems
 * are older than the graph. The file graph comes from the stored relationships
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
import { entityU64ForId, listEntitiesForRepo } from '../db/entities.js';
import { outNeighbors } from '../db/graph/edges.js';
import { readIndexState } from '../db/index-state.js';
import { readSubsystems, writeSubsystemSummary, writeSubsystems, type SubsystemGroupRow, type SubsystemView } from '../db/subsystems.js';
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

export interface SubsystemPassResult {
	readonly ran:              boolean;
	readonly reason?:          'graph-incomplete' | 'up-to-date' | undefined;
	readonly generation:       number;
	readonly subsystems:       number;
	readonly summariesWritten: number;
	readonly summariesFailed:  number;
	/** Shutdown, or a new generation, stopped the summaries; the rest wait for the next pass. */
	readonly stopped:          boolean;
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
		for (const group of chunk(summaries)) next.push(`- ${await ask(`Subsystem: ${sub.name} -- summaries of some of its parts\n\n${group.join('\n')}`)}`);
		summaries = next;
	}
	return ask(`Subsystem: ${sub.name}\n\nIts files, summarised in parts:\n${summaries.join('\n')}\n\nConnections to other subsystems:\n${conns}`);
}

/** Thrown inside a summary to stop the loop: shutdown, or a new generation. */
class SummaryStop extends Error {}

/** Group a graph-complete repository's code files into subsystems, store them, and summarise new ones. */
export async function runSubsystemPass(opts: { readonly db: DbClient; readonly repoPath: string } & SubsystemPassDeps): Promise<SubsystemPassResult> {
	const { db, repoPath } = opts;
	const none = { subsystems: 0, summariesWritten: 0, summariesFailed: 0, stopped: false };
	const state = await readIndexState(repoPath);
	const generation = state?.generation ?? 0;
	if (state === undefined || !state.graphComplete) {
		log.info({ repo: repoPath, generation }, 'subsystem pass: the graph is not complete; nothing grouped');
		return { ran: false, reason: 'graph-incomplete', generation, ...none };
	}
	if ((await readSubsystems(repoPath)).computedAtGeneration === generation) {
		// The groups are current; a summary that failed or was stopped is retried here.
		const summaries = await summarise(db, repoPath, generation, undefined, opts);
		return { ran: false, reason: 'up-to-date', generation, subsystems: 0, ...summaries };
	}

	const entities = await listEntitiesForRepo(db, repoPath);
	const rel = (file: string) => file.startsWith(repoPath + '/') ? file.slice(repoPath.length + 1) : file;
	const code = entities.filter(e => CODE_KINDS.has(e.kind));
	const codeFiles = new Set(code.map(e => rel(e.file)));
	const entityCount = new Map<string, number>();
	for (const e of code) entityCount.set(rel(e.file), (entityCount.get(rel(e.file)) ?? 0) + 1);

	// Every relationship source of a code file (its code entities and its file entity), by u64.
	const fileOfU64 = new Map<bigint, string>();
	const sources: Entity[] = [];
	for (const e of entities) {
		if (!codeFiles.has(rel(e.file)) || !(CODE_KINDS.has(e.kind) || e.kind === 'file')) continue;
		const u64 = await entityU64ForId(e.id);
		if (u64 === undefined) continue;
		fileOfU64.set(u64, rel(e.file));
		sources.push(e);
	}

	const byPair = new Map<string, { a: string; b: string; weight: number; kinds: Partial<Record<RelationKind, number>> }>();
	for (const [u64, a] of fileOfU64) {
		for (const n of await outNeighbors(u64, { kindFilter: GROUPING_KINDS, withEvidence: true })) {
			const b = fileOfU64.get(n.u64);
			if (b === undefined || b === a) continue;
			const key = `${a}\u0000${b}`;
			const edge = byPair.get(key) ?? { a, b, weight: 0, kinds: {} };
			const kind = n.kind as RelationKind;   // one of GROUPING_KINDS: the read is filtered to them
			edge.weight += (KIND_WEIGHT[kind] ?? 0) * EVIDENCE_WEIGHT[n.evidence];
			edge.kinds[kind] = (edge.kinds[kind] ?? 0) + 1;
			byPair.set(key, edge);
		}
	}
	const files = [...codeFiles].sort();
	const directories = directoryHubs(files);
	const edges: FileEdge[] = [...byPair.values(), ...directories.edges];
	const groups = groupSubsystems({ files, edges, hubs: directories.hubs });

	const rows: SubsystemGroupRow[] = groups.map(g => ({
		...g, entityCount: g.files.reduce((n, f) => n + (entityCount.get(f) ?? 0), 0),
	}));
	await writeSubsystems(repoPath, generation, rows);
	log.info({ repo: repoPath, generation, files: files.length, subsystems: rows.length, sources: sources.length }, 'subsystem pass: grouped');

	const summaries = await summarise(db, repoPath, generation, entities, opts);
	return { ran: true, generation, subsystems: rows.length, ...summaries };
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
