import { captureAnalysisDiagnostics } from '../../connection-access.js';
import { assertConnectionProviderAdmission } from '../../../shared/connection-provider.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Aggregator base runner.
 *
 * Every per-target aggregator runtime delegates to runAggregator()
 * for the LLM call -- target-specific runtimes only construct the
 * args (their per-target prompt path + the upstreamOutputs the
 * executor handed them). This keeps the prompt path + provider
 * construction + structured-output retry + error classification +
 * metadata stamping in one place.
 *
 * Failure modes (thrown as plain Error so the executor's
 * runtime-threw path captures them; callers don't need to typed-
 * dispatch on these):
 *   - prompt-missing      : prompt file ENOENT on disk
 *   - llm-unavailable     : Ollama down / model not pulled / connection lost
 *   - schema-unrecoverable: provider.completeStructured retries exhausted
 */

import { buildCompleteness } from '../../completeness.js';
import type { Completeness } from '../../completeness.js';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAnalyzeConfig } from '../../../config/analyze.js';
import { resolveRoleProvider } from '../../context/shaper-provider.js';
import { getLogger } from '../../../shared/logger.js';
import { isModelCallFailure, modelCallFailureDetail } from '../../context/model-failure.js';
import type {
	AnalyzeScope,
	AnalyzeTarget,
} from '../../../shared/analyze-types.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import type { HandlingReport } from '../../completeness.js';
import { ShaperAnswerStepFailedError } from '../../context/answer-step-error.js';
import type { AnswerStepFound } from '../../context/driver.js';
import type { AggregateInputRecord } from '../../context/failure-data.js';
import { assembleAggregate } from '../../context/handling-adapters.js';
import { runHandled } from '../../context/handling-parts.js';
import type { PartAdapter } from '../../context/handling-parts.js';
import { renderSection, upstreamBlocks } from '../../context/sections.js';
import type { EvidenceBlock } from '../../context/sections.js';
import { admissionTargetOf } from '../../context/synthesizer.js';
import type { AbsentInput, UpstreamOutput } from '../../executor/types.js';

import {
	AGGREGATE_LLM_SCHEMA,
	type AggregateLLMOutput,
	type AggregateReport,
} from './aggregate-types.js';

const log = getLogger('analyze:runtimes:shared:aggregator');

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface RunAggregatorArgs {
	readonly connectionExecution?: import('../../../shared/step-context.js').ConnectionExecutionContext | undefined;
	/** Path (relative to insrc root) to the per-target prompt .md file. */
	readonly promptRelPath: string;
	readonly target:        AnalyzeTarget;
	readonly scope:         AnalyzeScope;
	readonly runId:         string;
	/**
	 * Upstream output map (from the executor's TemplateExecuteArgs.upstreamOutputs):
	 * every output produced under each consumed name, in plan order.
	 */
	readonly upstreamOutputs: ReadonlyMap<string, readonly UpstreamOutput[]>;
	/**
	 * Optional human-readable goal / focus to prepend to the user
	 * message (e.g., intent.focus for focused intents). Aggregators
	 * that don't carry a focus omit this.
	 */
	readonly focus?: string;
	/** Optional provider override (tests only -- production uses analyze config). */
	readonly provider?: LLMProvider;
	/**
	 * What the plan did not produce. Written into the prompt as its own
	 * section after the outputs that exist, so the model knows what it has
	 * NOT been given and states nothing about it. Absent or empty: the
	 * prompt is as it always was.
	 */
	readonly absentInputs?: readonly AbsentInput[] | undefined;
}

/**
 * The completeness record of an aggregate-report task. The report is a
 * summary a model wrote from the other tasks' results: it has no findings of
 * its own, so it can neither be incomplete nor vouch for the tasks it
 * summarises. The answer report is derived from THEIR records and leaves
 * this task out.
 */
export function aggregateReportCompleteness(): Completeness {
	return buildCompleteness({
		returned:  1,
		basis:     'model-directed',
		basisNote: "a summary written by a model from the other tasks' results; its completeness is that of the tasks it summarises",
	});
}

/**
 * Run the aggregator LLM call + stamp the runtime metadata. Returns
 * the full AggregateReport. Caller wraps it in TemplateExecuteResult.outputs.
 */
export async function runAggregator(args: RunAggregatorArgs): Promise<AggregateReport> {
	assertConnectionProviderAdmission(args.connectionExecution);
	const cfg = loadAnalyzeConfig();

	const promptContent = loadPromptFile(args.promptRelPath);
	const provider = args.provider ?? resolveRoleProvider('analyze.aggregate', cfg, undefined, args.connectionExecution);

	const messages = buildMessages({
		promptContent,
		target:          args.target,
		scope:           args.scope,
		focus:           args.focus,
		upstreamOutputs: args.upstreamOutputs,
		absentInputs:    args.absentInputs,
	});

	// The upstream outputs as records, kept on a typed failure: its `found.results` holds lookup results only.
	const upstream: AggregateInputRecord[] = [...args.upstreamOutputs.values()].flat()
		.map(o => ({ taskId: o.taskId, template: o.template, params: o.params, value: o.value }));
	const found: AnswerStepFound = { results: [], report: { completeness: { complete: false, incomplete: [], failed: [] } } };

	let llmOutput: AggregateLLMOutput;
	let handling: HandlingReport;
	try {
		const handled = await runHandled<AggregateLLMOutput, { summary: string }>({
			provider, target: admissionTargetOf(provider, cfg.shaper.ollamaNumPredict), adapter: aggregateAdapter(promptContent, args),
			blocks: upstreamBlocksOf(args.upstreamOutputs), reference: [], found, upstream,
			maxAttempts: cfg.shaper.structuredOutputRetries, connectionExecution: args.connectionExecution,
			// The report's size is the request's: an undetermined one divides.
			size: args.scope, singleMessages: messages, singleSchema: AGGREGATE_LLM_SCHEMA as Record<string, unknown>,
		});
		if (handled.kind === 'single') llmOutput = handled.reply;
		else llmOutput = assembleAggregate(handled.covered, handled.combine);
		handling = handled.handling;
	} catch (err) {
		// A divided call ends in its own typed failure, which keeps the results, the upstream inputs and every part's cause.
		// A single pass keeps the legacy classification, with the original error as the cause.
		if (err instanceof ShaperAnswerStepFailedError) throw err;
		throw classifyError(err);
	}

	captureAnalysisDiagnostics(log, args.connectionExecution).emit('info', () => [{
			runId:         args.runId,
			target:        args.target,
			scope:         args.scope,
			findingCount:  llmOutput.findings.length,
			upstreamTasks: countOutputs(args.upstreamOutputs),
	}, 'aggregator: LLM call ok']);

	return {
		summary:  llmOutput.summary,
		findings: llmOutput.findings,
		metadata: {
			target:        args.target,
			scope:         args.scope,
			runId:         args.runId,
			tasksAnalyzed: countOutputs(args.upstreamOutputs),
			handling,
		},
	};
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

const SUMMARY_CAP = 2_000;

/** The upstream outputs as blocks of evidence, in the order they are rendered. */
function upstreamBlocksOf(map: ReadonlyMap<string, readonly UpstreamOutput[]>): readonly EvidenceBlock[] {
	return Array.from(map.keys()).filter(name => (map.get(name) ?? []).length > 0).sort()
		.flatMap(name => (map.get(name) ?? []).flatMap(o => upstreamBlocks({ taskId: o.taskId, template: o.template, params: o.params, value: o.value })));
}

/** A combine reply holds one summary, capped like a part's so a staged combine stays inside its call. */
export const AGGREGATE_COMBINE_SCHEMA: StructuredSchema = {
	type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string', minLength: 20, maxLength: 2_000 } },
} as unknown as StructuredSchema;

/**
 * The prompts of a report written in parts. The absent-input section is part
 * of every part and every combine call, so a part never speaks of an input it
 * was not given and the admission counts it.
 */
function aggregateAdapter(promptContent: string, args: RunAggregatorArgs): PartAdapter<AggregateLLMOutput, { summary: string }> {
	const system = promptContent.trimEnd();
	const absent = renderAbsentSection(args.absentInputs, args.upstreamOutputs);
	const focus = args.focus !== undefined && args.focus.length > 0 ? `\nFocus: ${args.focus}\n` : '';
	const head = `Target: ${args.target}\nScope:  ${args.scope}\n${focus}\n`;
	const partSchema = structuredClone(AGGREGATE_LLM_SCHEMA) as unknown as { properties: { summary: Record<string, unknown> } };
	partSchema.properties.summary = { ...partSchema.properties.summary, maxLength: SUMMARY_CAP };
	return {
		partSchema: partSchema as unknown as StructuredSchema,
		combineSchema: AGGREGATE_COMBINE_SCHEMA,
		renderPart: (part) => [
			{ role: 'system', content: system },
			{ role: 'user', content: head + `Upstream task outputs of this part (${part.id}); the report is written in parts and this is one of them:\n\n`
				+ part.sections.map(renderSection).join('\n\n') + absent + '\n\n'
				+ `Compose the aggregate report for THIS PART only. Respond with ONLY the JSON object matching the schema; keep summary under ${SUMMARY_CAP} characters.` },
		],
		renderCombine: (summaries) => [
			{ role: 'system', content: system },
			{ role: 'user', content: head + 'The report was written in parts. Part summaries:\n\n' + summaries.map(s => `### ${s.id}\n${s.summary}`).join('\n\n')
				+ absent + '\n\nWrite the executive summary of the whole report as JSON {summary}. The findings are assembled from the parts; do not write them.' },
		],
		summaryOf: r => r.summary, summaryOfCombine: c => c.summary,
		mergeRounds: rs => ({ summary: rs.map(r => r.summary).join(' ').slice(0, SUMMARY_CAP), findings: rs.flatMap(r => r.findings) }),
	};
}

// ---------------------------------------------------------------------------
// Message composition
// ---------------------------------------------------------------------------

interface BuildMessagesArgs {
	readonly promptContent:   string;
	readonly target:          AnalyzeTarget;
	readonly scope:           AnalyzeScope;
	readonly focus?:          string | undefined;
	readonly upstreamOutputs: ReadonlyMap<string, readonly UpstreamOutput[]>;
	readonly absentInputs?:   readonly AbsentInput[] | undefined;
}

/** The number of outputs handed to the report task, summed over the names. */
function countOutputs(map: ReadonlyMap<string, readonly UpstreamOutput[]>): number {
	let n = 0;
	for (const list of map.values()) n += list.length;
	return n;
}

function buildMessages(args: BuildMessagesArgs): LLMMessage[] {
	const upstreamSection = renderUpstreamSection(args.upstreamOutputs, args.absentInputs);
	const focusSection = args.focus !== undefined && args.focus.length > 0
		? `\nFocus: ${args.focus}\n`
		: '';

	const userContent =
		`Target: ${args.target}\n` +
		`Scope:  ${args.scope}\n` +
		focusSection +
		`\n` +
		upstreamSection +
		renderAbsentSection(args.absentInputs, args.upstreamOutputs) +
		`\n\n` +
		`Compose the aggregate report. Respond with ONLY the JSON object ` +
		`matching the schema -- no markdown fences, no prose outside the JSON body.`;

	return [
		{ role: 'system', content: args.promptContent.trimEnd() },
		{ role: 'user',   content: userContent },
	];
}

/**
 * The outputs the report is written from. A name one task produced is one
 * block, `### <name>` and the value. A name several tasks produced is a
 * heading and one sub-block per task, in plan order, each titled with its
 * task id and template and carrying the task's params, so that the model can
 * tell the outputs apart. Names are in sorted order.
 *
 * A name whose one output is all that is left of several (a sibling producer
 * of the name is in `absent`) is rendered in the per-task form too: the model
 * is told that another task's output under the name is absent, and must be
 * able to say which task the output it has came from.
 */
function renderUpstreamSection(
	map:     ReadonlyMap<string, readonly UpstreamOutput[]>,
	absent?: readonly AbsentInput[] | undefined,
): string {
	const partlyAbsent = new Set((absent ?? []).filter(a => a.producedBy !== null).map(a => a.name));
	// A name with no output is not in the map; an empty list is read the same way.
	const names = Array.from(map.keys()).filter(name => (map.get(name) ?? []).length > 0).sort();
	if (names.length === 0) {
		return 'No upstream outputs were available -- the aggregator must reflect this in its summary.';
	}
	const blocks: string[] = ['Upstream task outputs:'];
	for (const name of names) {
		const list = map.get(name)!;
		if (list.length === 1 && !partlyAbsent.has(name)) {
			blocks.push(`### ${name}\n` + renderValue(list[0]!.value, name));
			continue;
		}
		blocks.push(`### ${name} (${list.length} ${list.length === 1 ? 'output' : 'outputs'}, one per task)`);
		for (const out of list) {
			blocks.push(
				`#### ${name} from task ${out.taskId} (${out.template})\n` +
					`params: ${stableStringify(out.params, 0)}\n` +
					renderValue(out.value, out.taskId),
			);
		}
	}
	return blocks.join('\n\n');
}

/** One output's value as stable JSON, or the line that says it is unavailable. */
function renderValue(value: unknown, producer: string): string {
	if (value === null || value === undefined) {
		return (
			`[unavailable: upstream task ${producer} produced no output; ` +
			`reflect this gap in the report rather than fabricating.]`
		);
	}
	return '```json\n' + stableStringify(value) + '\n```';
}

/**
 * The inputs the plan did not produce, as their own section after the outputs
 * that exist. Empty when nothing is absent, so the prompt is then unchanged.
 * Each line carries the whole reason: nothing is shortened.
 *
 * A name may be absent for one task and present for its siblings (one of
 * several producers failed). Such a line speaks of that task's output, not of
 * the name, and says the other outputs under the name are available: the
 * model was just given them. When no absent name has an output the section
 * is worded by name, as it always was.
 */
function renderAbsentSection(
	absent:   readonly AbsentInput[] | undefined,
	upstream?: ReadonlyMap<string, readonly UpstreamOutput[]> | undefined,
): string {
	if (absent === undefined || absent.length === 0) return '';
	const partly = (a: AbsentInput): boolean =>
		a.producedBy !== null && (upstream?.get(a.name) ?? []).length > 0;
	const lines = absent.map(a => {
		if (partly(a)) {
			return `- ${a.name}: the output of task ${a.producedBy} under this name is absent; ` +
				`the other outputs under ${a.name} are available. Reason: ${a.reason}`;
		}
		const producer = a.producedBy === null
			? 'no task of the plan produces it'
			: `task ${a.producedBy} should have produced it`;
		return `- ${a.name}: ${producer}. Reason: ${a.reason}`;
	});
	if (absent.some(partly)) {
		return (
			`\n\nAbsent inputs (NOT available to you):\n` +
			lines.join('\n') +
			`\n\n` +
			`These outputs were not produced, so you have nothing about them. Where a line above says ` +
			`that the output of one task under a name is absent, only that task's output is missing: the ` +
			`other outputs given to you under the same name are available and the report covers them. In ` +
			`the summary and in the findings, state nothing about an absent output except that it is ` +
			`absent, with the task that should have produced it and the reason given above. Do not infer, ` +
			`estimate or describe what it would have held, and do not present the report as covering it.`
		);
	}
	return (
		`\n\nAbsent inputs (NOT available to you):\n` +
		lines.join('\n') +
		`\n\n` +
		`These inputs were not produced, so you have nothing about them. In the summary and in the ` +
		`findings, state nothing about an absent input except that it is absent, with the task that ` +
		`should have produced it and the reason given above. Do not infer, estimate or describe what ` +
		`it would have held, and do not present the report as covering it.`
	);
}

/**
 * Sort object keys + Map entries deterministically so prompt content
 * is stable across runs (helps cache + debug diffing).
 */
function stableStringify(value: unknown, indent = 2): string {
	return JSON.stringify(value, (_k, v) => {
		if (v instanceof Map) {
			const obj: Record<string, unknown> = {};
			const entries: [string, unknown][] = [];
			for (const [k, val] of v.entries()) entries.push([String(k), val]);
			entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
			for (const [k, val] of entries) obj[k] = val;
			return obj;
		}
		if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
			const sorted: Record<string, unknown> = {};
			const keys = Object.keys(v as Record<string, unknown>).sort();
			for (const k of keys) sorted[k] = (v as Record<string, unknown>)[k];
			return sorted;
		}
		return v;
	}, indent);
}

// ---------------------------------------------------------------------------
// Prompt loading + provider construction
// ---------------------------------------------------------------------------

function loadPromptFile(relPath: string): string {
	const abs = isAbsolute(relPath) ? relPath : resolveRelativeToInsrcRoot(relPath);
	try {
		return readFileSync(abs, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(`aggregator prompt missing: ${abs}`);
		}
		throw err;
	}
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../analyze/runtimes/shared/aggregator.js -> ... -> .../insrc
	return resolve(thisFile, '..', '..', '..', '..', relativePath);
}

// ---------------------------------------------------------------------------
// Error classification (mirrors planner/driver.ts + shaper patterns)
// ---------------------------------------------------------------------------

function classifyError(err: unknown): Error {
	if (!(err instanceof Error)) return new Error(`aggregator-internal: ${String(err)}`, { cause: err });
	// The original error is kept as the cause, so the stored failure can say what the provider said.
	if (isModelCallFailure(err)) return new Error(`aggregator-llm-unavailable: ${modelCallFailureDetail(err)}`, { cause: err });
	return new Error(`aggregator-schema-unrecoverable: ${err.message}`, { cause: err });
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const _buildMessagesForTest        = buildMessages;
export const _renderUpstreamSectionForTest = renderUpstreamSection;
export const _renderAbsentSectionForTest   = renderAbsentSection;
export const _stableStringifyForTest       = stableStringify;
export const _classifyErrorForTest         = classifyError;
