/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cross-stage open-question resolution — the shared machinery behind the
 * `insrc_workflow_step` open-question gate.
 *
 * Any artifact carrying `body.openQuestions: string[]` (DEF / HLD / LLD)
 * participates. Answers persist to the artifact's SHARED
 * `meta.questionResolutions` (`ArtifactMetaBase`). The gate:
 *
 *   - derives a STABLE id per open question (a leading `[id / verdict]`
 *     tag if present, else a short sha of the text);
 *   - computes which questions are still `open` (no resolution recorded);
 *   - formalizes each open question into concrete options + a
 *     recommendation via the daemon's shaper LLM;
 *   - records a resolution (`resolved` | `ignored` | `deferred`) into the
 *     right artifact's meta, re-renders its markdown (adding a
 *     "## Resolved questions" section), and best-effort commits + comments
 *     on the artifact's tracker issue;
 *   - enumerates every `deferred` question across an Epic for the dedicated
 *     review flow (`deferred` items never auto-resurface at a stage
 *     boundary).
 *
 * Lifted + generalized from the former `src/mcp/build-step/{questions,
 * resolutions}.ts` (which scoped only the Story LLD at build time).
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildShaperProvider } from '../analyze/context/shaper-provider.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { getLogger } from '../shared/logger.js';
import type { LLMProvider, StructuredSchema } from '../shared/types.js';
import type { QuestionResolution, QuestionResolutionStatus } from './types.js';
import { renderDefineMarkdown, type DefineArtifact } from './artifacts/define.js';
import { renderHldMarkdown, type HldArtifact } from './artifacts/hld.js';
import { renderLldMarkdown, type LldArtifact } from './artifacts/lld.js';
import { resolveGithubConfig } from './config/github.js';
import { renderCitationBlock } from './synthesizer.js';
import {
	ARTIFACTS_DIR,
	defineArtifactPaths,
	hldArtifactPaths,
	lldArtifactPaths,
	lldFilenamePrefix,
	writeAtomic,
} from './storage.js';
import { commitAndPushArtifacts, ghComment } from './tracker/github.js';

const log = getLogger('workflow:questions');

// ---------------------------------------------------------------------------
// Which artifact kinds carry open questions
// ---------------------------------------------------------------------------

/** The artifact kinds that carry `body.openQuestions`. PLAN does not. */
export type QuestionArtifactKind = 'define' | 'hld' | 'lld';

// ---------------------------------------------------------------------------
// questionId derivation
// ---------------------------------------------------------------------------

/** Leading `[id / verdict]` tag (e.g. `[sc2 / missed] ...` → `sc2`). */
const TAG_RE = /^\s*\[\s*([^\]\s/]+)\s*\//;

/** Derive a STABLE id for an open question: the leading `[id / verdict]`
 *  tag if present, else a short sha of the trimmed text. */
export function questionId(text: string): string {
	const m = TAG_RE.exec(text);
	if (m !== null && m[1]!.length > 0) return m[1]!;
	return 'q' + createHash('sha256').update(text.trim()).digest('hex').slice(0, 8);
}

/** Back-compat alias for the former build-step name. */
export const deriveQuestionId = questionId;

// ---------------------------------------------------------------------------
// Status computation
// ---------------------------------------------------------------------------

export type OpenQuestionStatus = 'open' | QuestionResolutionStatus;

export interface OpenQuestionView {
	readonly id:     string;
	readonly text:   string;
	readonly status: OpenQuestionStatus;
}

/** Every open question with its current status. A question with no
 *  recorded resolution is `open`; otherwise it carries the recorded
 *  status (`resolved` | `ignored` | `deferred`). */
export function openQuestions(
	texts:       readonly string[],
	resolutions: Readonly<Record<string, QuestionResolution>> | undefined,
): OpenQuestionView[] {
	const res = resolutions ?? {};
	return texts.map(text => {
		const id = questionId(text);
		const r = res[id];
		return { id, text, status: r?.status ?? 'open' as const };
	});
}

/** The questions with NO resolution recorded (status `open`). These fire
 *  the mandatory stage-start gate. A `deferred` question is NOT open, so
 *  it does not re-trigger — only the review flow resurfaces it. */
export function unresolvedOpen(
	texts:       readonly string[],
	resolutions: Readonly<Record<string, QuestionResolution>> | undefined,
): OpenQuestionView[] {
	return openQuestions(texts, resolutions).filter(q => q.status === 'open');
}

// ---------------------------------------------------------------------------
// Option generation (daemon-side LLM call)
// ---------------------------------------------------------------------------

export interface QuestionOption {
	readonly label:  string;
	readonly detail: string;
}

export interface QuestionWithOptions {
	readonly questionId:     string;
	readonly text:           string;
	readonly options:        readonly QuestionOption[];
	readonly recommendation: string;
}

const OPTIONS_SCHEMA: StructuredSchema = {
	type: 'object',
	required: ['options', 'recommendation'],
	additionalProperties: false,
	properties: {
		options: {
			type: 'array',
			minItems: 2,
			maxItems: 4,
			items: {
				type: 'object',
				required: ['label', 'detail'],
				additionalProperties: false,
				properties: {
					label:  { type: 'string', minLength: 1 },
					detail: { type: 'string', minLength: 1 },
				},
			},
		},
		recommendation: { type: 'string', minLength: 1 },
	},
};

interface GeneratedOptions {
	readonly options:        readonly QuestionOption[];
	readonly recommendation: string;
}

/** Test seam: inject a fake provider for option generation so the gate is
 *  exercised without a live LLM. */
let providerOverride: LLMProvider | undefined;
export function _setQuestionProviderForTests(p: LLMProvider | undefined): void {
	providerOverride = p;
}

function optionProvider(): LLMProvider {
	if (providerOverride !== undefined) return providerOverride;
	return buildShaperProvider(loadAnalyzeConfig(), {});
}

/** Formalize ONE open question into 2-4 concrete options + a one-line
 *  recommendation. */
export async function generateQuestionOptions(
	question:    string,
	contextText: string,
	provider:    LLMProvider = optionProvider(),
): Promise<GeneratedOptions> {
	const systemPrompt = [
		'You are helping resolve an OPEN DESIGN QUESTION before the next stage of work proceeds.',
		'Formalize the question below into 2-4 CONCRETE, mutually-distinct solution options,',
		'each with a short label and a one-to-two sentence detail, plus a one-line recommendation',
		'naming the option you would pick and why. Do not invent facts outside the given context.',
	].join('\n');
	const userTurn = [
		`Context: ${contextText}`,
		'',
		`Open question: ${question}`,
		'',
		'Emit the options JSON now.',
	].join('\n');
	return provider.completeStructured<GeneratedOptions>(
		[{ role: 'system', content: systemPrompt }, { role: 'user', content: userTurn }],
		OPTIONS_SCHEMA,
	);
}

/** Formalize EACH open question into options + a recommendation. SERIAL by
 *  construction — never `Promise.all` over provider calls (CLAUDE.md). */
export async function questionsWithOptions(
	views:       readonly OpenQuestionView[],
	contextText: string,
): Promise<QuestionWithOptions[]> {
	const provider = optionProvider();
	const out: QuestionWithOptions[] = [];
	for (const q of views) {
		const gen = await generateQuestionOptions(q.text, contextText, provider);
		out.push({ questionId: q.id, text: q.text, options: gen.options, recommendation: gen.recommendation });
	}
	log.info({ count: out.length }, 'workflow:questions: generated options for open questions');
	return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** The `{{resolvedDecisions}}` block: lists each recorded resolution. A
 *  `resolved` question carries its decision; `ignored` is left to
 *  implementer judgment; `deferred` is parked with no decision yet. */
export function renderResolvedDecisions(
	resolutions: Readonly<Record<string, QuestionResolution>> | undefined,
): string {
	const res = resolutions ?? {};
	const lines: string[] = [];
	for (const [, r] of Object.entries(res)) {
		if (r.status === 'ignored') {
			lines.push(`- **${r.question}** — left to implementer judgment${r.rationale ? ` (${r.rationale})` : ''}.`);
		} else if (r.status === 'deferred') {
			lines.push(`- **${r.question}** — deferred (no decision recorded yet)${r.rationale ? ` (${r.rationale})` : ''}.`);
		} else {
			lines.push(`- **${r.question}** — ${r.choice ?? '(no choice recorded)'}${r.rationale ? ` (${r.rationale})` : ''}.`);
		}
	}
	return lines.join('\n');
}

/** The "## Resolved questions" markdown section appended to an artifact md. */
export function renderResolvedQuestionsSection(
	resolutions: Readonly<Record<string, QuestionResolution>>,
): string {
	const entries = Object.entries(resolutions);
	if (entries.length === 0) return '';
	const lines: string[] = ['', '## Resolved questions', ''];
	for (const [id, r] of entries) {
		const decision = r.status === 'ignored'
			? 'left to implementer judgment'
			: r.status === 'deferred'
				? 'deferred for review'
				: (r.choice ?? '(no choice)');
		lines.push(`- \`${id}\` — ${r.question}`);
		lines.push(`  - **${r.status}**: ${decision}${r.rationale ? ` — ${r.rationale}` : ''} _(${r.resolvedAt})_`);
	}
	lines.push('');
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Artifact I/O per kind
// ---------------------------------------------------------------------------

/** A generic artifact carrying `body.openQuestions` + shared meta. */
interface QuestionArtifact {
	readonly meta:      {
		readonly epicSlug?: string;
		readonly tracker?:  { readonly epicRef?: string; readonly storyRef?: string };
		readonly questionResolutions?: Readonly<Record<string, QuestionResolution>>;
	} & Record<string, unknown>;
	readonly body:      { readonly openQuestions?: readonly string[] } & Record<string, unknown>;
	readonly citations: readonly { readonly id: string; readonly kind: string; readonly ref: string }[];
}

interface ArtifactLocation {
	readonly artifact:  QuestionArtifact;
	readonly jsonPath:  string;
	readonly mdPath:    string;
	readonly trackerRef: string | undefined;
	readonly renderMd:  (a: QuestionArtifact, resolutions: Readonly<Record<string, QuestionResolution>>) => string;
}

/** Resolve the on-disk artifact + its renderer for a kind. `epicSlug` and
 *  the tracker ref are read from the artifact's own meta. */
function locateArtifact(
	repoPath:     string,
	kind:         QuestionArtifactKind,
	epicHash:     string,
	storyId:      string | undefined,
): ArtifactLocation {
	if (kind === 'lld' && (storyId === undefined || storyId.length === 0)) {
		throw new Error(`workflow:questions: kind='lld' requires a storyId`);
	}
	const jsonPath = kind === 'define'
		? defineArtifactPaths(repoPath, epicHash).json
		: kind === 'hld'
			? hldArtifactPaths(repoPath, epicHash).json
			: lldArtifactPaths(repoPath, epicHash, storyId!).json;
	const artifact = JSON.parse(readFileSync(jsonPath, 'utf8')) as QuestionArtifact;
	const epicSlug = artifact.meta.epicSlug;
	const tracker = artifact.meta.tracker;
	if (kind === 'define') {
		return {
			artifact,
			jsonPath,
			mdPath:     defineArtifactPaths(repoPath, epicHash, epicSlug).md,
			trackerRef: tracker?.epicRef,
			renderMd:   (a, res) => {
				const art = a as unknown as DefineArtifact;
				return renderDefineMarkdown(art) + renderResolvedQuestionsSection(res) + renderCitationBlock(art.citations);
			},
		};
	}
	if (kind === 'hld') {
		return {
			artifact,
			jsonPath,
			mdPath:     hldArtifactPaths(repoPath, epicHash, epicSlug).md,
			trackerRef: tracker?.epicRef,
			renderMd:   (a, res) => {
				const art = a as unknown as HldArtifact;
				return renderHldMarkdown(art) + renderResolvedQuestionsSection(res) + renderCitationBlock(art.citations);
			},
		};
	}
	return {
		artifact,
		jsonPath,
		mdPath:     lldArtifactPaths(repoPath, epicHash, storyId!, epicSlug).md,
		trackerRef: tracker?.storyRef,
		renderMd:   (a, res) => {
			const art = a as unknown as LldArtifact;
			return renderLldMarkdown(art) + renderResolvedQuestionsSection(res) + renderCitationBlock(art.citations);
		},
	};
}

/** The open-question texts of an artifact (empty when it carries none). */
export function artifactOpenQuestions(
	repoPath: string,
	kind:     QuestionArtifactKind,
	epicHash: string,
	storyId?: string,
): { readonly texts: readonly string[]; readonly resolutions: Readonly<Record<string, QuestionResolution>> } {
	const loc = locateArtifact(repoPath, kind, epicHash, storyId);
	return {
		texts:       loc.artifact.body.openQuestions ?? [],
		resolutions: loc.artifact.meta.questionResolutions ?? {},
	};
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface RecordResolutionResult {
	readonly jsonPath:      string;
	readonly mdPath:        string;
	readonly resolution:    QuestionResolution;
	readonly remainingOpen: OpenQuestionView[];
}

/** Record ONE resolution into the right artifact's `meta.questionResolutions`,
 *  re-render its md (with a "## Resolved questions" section), write both back
 *  atomically, then best-effort commit+push + comment on the artifact's
 *  tracker issue (epic issue for DEF/HLD, story issue for LLD). Tracker side
 *  effects never throw — a resolution is recorded locally even when git/gh is
 *  unavailable.
 *
 *  Reads the RAW artifact JSON (no approval gate) so the resolution is
 *  additive to whatever is on disk. Throws when the questionId names no open
 *  question on the artifact. */
export function recordResolution(
	repoPath:   string,
	kind:       QuestionArtifactKind,
	epicHash:   string,
	storyId:    string | undefined,
	qId:        string,
	status:     QuestionResolutionStatus,
	choice?:    string,
	rationale?: string,
): RecordResolutionResult {
	const loc = locateArtifact(repoPath, kind, epicHash, storyId);
	const texts = loc.artifact.body.openQuestions ?? [];
	const questionText = texts.find(t => questionId(t) === qId);
	if (questionText === undefined) {
		throw new Error(
			`workflow:questions: no open question with id '${qId}' on the ${kind.toUpperCase()} artifact ` +
			`for Epic '${epicHash}'${storyId ? ` Story '${storyId}'` : ''}.`,
		);
	}
	const resolution: QuestionResolution = {
		question:   questionText,
		status,
		...(status === 'resolved' && typeof choice === 'string' && choice.length > 0 ? { choice } : {}),
		...(typeof rationale === 'string' && rationale.length > 0 ? { rationale } : {}),
		resolvedAt: new Date().toISOString(),
	};
	const nextResolutions: Record<string, QuestionResolution> = {
		...(loc.artifact.meta.questionResolutions ?? {}),
		[qId]: resolution,
	};
	const next: QuestionArtifact = {
		...loc.artifact,
		meta: { ...loc.artifact.meta, questionResolutions: nextResolutions },
	};
	writeAtomic(loc.jsonPath, JSON.stringify(next, null, 2) + '\n');
	writeAtomic(loc.mdPath, loc.renderMd(next, nextResolutions));

	const summary = resolutionSummary(kind, epicHash, storyId, qId, resolution);
	commitAndComment(repoPath, loc.jsonPath, loc.mdPath, loc.trackerRef, summary);

	log.info({ kind, epicHash, storyId, questionId: qId, status }, 'workflow:questions: resolution recorded');

	return {
		jsonPath:      loc.jsonPath,
		mdPath:        loc.mdPath,
		resolution,
		remainingOpen: unresolvedOpen(texts, nextResolutions),
	};
}

function resolutionSummary(
	kind:       QuestionArtifactKind,
	epicHash:   string,
	storyId:    string | undefined,
	qId:        string,
	resolution: QuestionResolution,
): string {
	const where = storyId !== undefined ? `Story ${storyId}` : `Epic ${epicHash}`;
	const scope = `${kind.toUpperCase()} open question \`${qId}\` for ${where}`;
	if (resolution.status === 'ignored') {
		return `${scope} left to implementer judgment${resolution.rationale ? `: ${resolution.rationale}` : '.'}`;
	}
	if (resolution.status === 'deferred') {
		return `${scope} deferred for review${resolution.rationale ? `: ${resolution.rationale}` : '.'}`;
	}
	return `${scope} resolved: ${resolution.choice}${resolution.rationale ? ` (${resolution.rationale})` : '.'}`;
}

/** Best-effort commit+push of the artifact files + a tracker-issue comment.
 *  Never throws — a missing git tree, an unconfigured tracker, or a `gh`
 *  failure just leaves the resolution recorded locally. */
function commitAndComment(
	repoPath:   string,
	jsonPath:   string,
	mdPath:     string,
	trackerRef: string | undefined,
	summary:    string,
): void {
	try {
		commitAndPushArtifacts(repoPath, [jsonPath, mdPath], summary);
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'resolution: commit/push failed (best-effort)');
	}
	if (trackerRef === undefined || !trackerRef.includes('#')) return;
	try {
		const cfg = resolveGithubConfig(repoPath);
		if (cfg.type !== 'github') return;
		ghComment(cfg.owner, cfg.repo, trackerRef, summary);
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'resolution: tracker comment failed (best-effort)');
	}
}

// ---------------------------------------------------------------------------
// Deferred review
// ---------------------------------------------------------------------------

export interface DeferredQuestion {
	readonly kind:       QuestionArtifactKind;
	readonly epicHash:   string;
	readonly storyId?:   string;
	readonly questionId: string;
	readonly text:       string;
	readonly resolution: QuestionResolution;
}

/** Every `deferred` question across an Epic's DEF + HLD + all LLDs, each with
 *  its artifact location — the input to the deferred-review flow. `deferred`
 *  items surface ONLY here; they never auto-re-trigger at a stage boundary. */
export function listDeferred(repoPath: string, epicHash: string): DeferredQuestion[] {
	const out: DeferredQuestion[] = [];
	collectDeferred(repoPath, 'define', epicHash, undefined, out);
	collectDeferred(repoPath, 'hld', epicHash, undefined, out);
	for (const storyId of enumerateLldStoryIds(repoPath, epicHash)) {
		collectDeferred(repoPath, 'lld', epicHash, storyId, out);
	}
	return out;
}

function collectDeferred(
	repoPath: string,
	kind:     QuestionArtifactKind,
	epicHash: string,
	storyId:  string | undefined,
	out:      DeferredQuestion[],
): void {
	let loc: ArtifactLocation;
	try {
		loc = locateArtifact(repoPath, kind, epicHash, storyId);
	} catch {
		return;  // artifact absent — nothing to collect
	}
	const resolutions = loc.artifact.meta.questionResolutions ?? {};
	const texts = loc.artifact.body.openQuestions ?? [];
	for (const text of texts) {
		const id = questionId(text);
		const r = resolutions[id];
		if (r !== undefined && r.status === 'deferred') {
			out.push({ kind, epicHash, ...(storyId !== undefined ? { storyId } : {}), questionId: id, text, resolution: r });
		}
	}
}

/** The Story ids of every LLD JSON under the Epic (`LLD-<hash>-<storyId>.json`). */
function enumerateLldStoryIds(repoPath: string, epicHash: string): string[] {
	const artifactsDir = join(repoPath, ARTIFACTS_DIR);
	if (!existsSync(artifactsDir)) return [];
	const prefix = lldFilenamePrefix(epicHash);
	const ids: string[] = [];
	for (const name of readdirSync(artifactsDir).sort()) {
		if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
		ids.push(name.slice(prefix.length, -'.json'.length));
	}
	return ids;
}
