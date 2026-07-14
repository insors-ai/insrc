/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Insrc MCP server.
 *
 * Exposes the analyze framework as an MCP tool surface so Claude
 * Code / Codex CLI (or any spec-conformant MCP client) can invoke
 * the deterministic exploration + synthesizer pipeline over the
 * `insrc_analyze` tool.
 *
 * The server runs IN PROCESS: it links the analyze module directly,
 * reads from the same LMDB the main daemon writes to, and threads
 * the calling client's `sampling/createMessage` capability through
 * to the shaper factory via a request-scoped
 * `runWithSamplerContext` scope. That means:
 *
 *   - No inner `claude --print` subprocess spawn (which would nest
 *     Claude inside Claude). The outer client's LLM session powers
 *     every inner analyze call.
 *   - No RPC bridge to the main daemon for LLM work; the analyze
 *     pipeline runs where the tool call arrives.
 *
 * The client's capability declaration at initialize decides which
 * path drives inner LLM calls:
 *
 *   - Client declares `sampling` -> use MCP sampling
 *   - Client doesn't declare sampling -> fall back to
 *     `AnalyzeConfig.shaperProvider` (subprocess CliProvider or
 *     Ollama). This lets the same binary work with clients that
 *     don't yet support sampling.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { buildRun } from '../daemon/analyze-rpc.js';
import { runWithSamplerContext, runWithClientProviderContext } from '../analyze/context/shaper-provider.js';
import type { AnalyzeShaperProviderKind } from '../config/analyze.js';
import { getLogger } from '../shared/logger.js';

import { handleAnalyzeStep } from './analyze-step/handler.js';
import { handleWorkflowStep } from './workflow-step/handler.js';
import { renderBundleAsMarkdown } from './bundle-md.js';
import { makeSamplerFromMcpServer } from './sampling-bridge.js';
import { WORKFLOW_NAMES } from '../workflow/types.js';

const log = getLogger('mcp:server');

const SERVER_INFO = {
	name:    'insrc-analyze',
	version: '0.1.0',
} as const;

// ---------------------------------------------------------------------------
// Tool input schema (zod)
// ---------------------------------------------------------------------------

/**
 * Input schema for `insrc_analyze`. Kept small on purpose -- most
 * runs need only `focus` + an inferred repo. Extra knobs
 * (`target`, `scope`, `answerType`) exist so a caller who knows
 * they want a specific recipe can bypass the classifier's inference.
 */
const ANALYZE_INPUT = {
	repo: z.string()
		.describe(
			'Absolute path (or registered repo name) the analyze framework ' +
			'should operate on. Must match a repo previously registered via ' +
			'`insrc repo add`. If unset, the daemon\'s default repo (from ' +
			'`INSRC_REPO` env / config) is used; when neither is set, the ' +
			'call fails with a repo-not-found error listing every registered ' +
			'repo.',
		)
		.optional(),
	focus: z.string()
		.min(1)
		.describe(
			'One-line natural-language framing of what to analyze. E.g. ' +
			'"map the payable extraction module", "does the CLAUDE.md Haiku ' +
			'rule hold?", or "list every registered data source". The ' +
			'framework\'s classifier turns this into a structured intent + ' +
			'picks a deterministic recipe.',
		),
	target: z.enum(['code', 'docs', 'data', 'infra', 'generic'])
		.describe(
			'Optional target hint. Skip the classifier\'s target inference ' +
			'when the caller already knows.',
		)
		.optional(),
	scope: z.enum(['XS', 'S', 'M', 'L', 'XL'])
		.describe(
			'Optional scope bucket. XS = single symbol; XL = entire ' +
			'workspace. Larger scopes take longer and produce bigger ' +
			'bundles. Defaults are computed from the intent.',
		)
		.optional(),
};

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Build the MCP server + register every tool. The caller connects
 * whatever transport it wants (stdio by default; tests use
 * `InMemoryTransport`).
 */
export function buildInsrcMcpServer(): McpServer {
	const server = new McpServer(SERVER_INFO, {
		capabilities: {
			tools:     {},
			resources: {},
			// We do not declare `sampling` -- that's a CLIENT capability;
			// the server merely uses it when the client declares it.
		},
	});

	server.registerTool(
		'insrc_analyze',
		{
			title: 'insrc analyze',
			description:
				'One-shot analyze: runs the full insrc pipeline server-side and ' +
				'returns a verified, citation-grounded 7-layer bundle (system, ' +
				'focus, summary, structure, surface, artefacts, upstream) in a ' +
				'single tool call. Prefer this variant for STRUCTURAL-MAP ' +
				'questions (module maps, tree layout, entity counts) where no ' +
				'narrow-LLM reasoning is needed; inner LLM calls (if any) go to ' +
				'the daemon\'s configured shaperProvider (Ollama by default).\n\n' +
				'For adherence-check, capability-discovery, or prose-retrieval ' +
				'intents, prefer the sibling tool `insrc_analyze_step` -- it ' +
				'hands narrow-LLM reasoning to YOUR model in-session (better ' +
				'accuracy, no subprocess spawns, no separate billing).\n\n' +
				'Prefer either analyze tool over Read/Grep/Glob for:\n' +
				'  - "map / explore <module>"\n' +
				'  - "does the codebase already do <X>?"\n' +
				'  - "how does <Y> work?"\n' +
				'  - "does the code follow <rule> from <doc>?"\n' +
				'  - "what conventions does <module> follow?"\n' +
				'  - "list every registered <data source | infra manifest>"\n' +
				'  - Any question where you\'d otherwise grep + read to answer.\n\n' +
				'Call again with a narrower `focus` to drill down. Fall back ' +
				'to Read/Grep/Glob only when the tool returns an empty or ' +
				'clearly off-topic bundle.',
			annotations: {
				readOnlyHint:   true,
				idempotentHint: false,   // running twice can pick a new plan; not idempotent
				openWorldHint:  false,   // scope is the indexed repo, not the open web
			},
			inputSchema: ANALYZE_INPUT,
		},
		async (rawArgs, _extra) => {
			const args = rawArgs as {
				repo?:   string;
				focus:   string;
				target?: 'code' | 'docs' | 'data' | 'infra' | 'generic';
				scope?:  'XS' | 'S' | 'M' | 'L' | 'XL';
			};
			return handleAnalyze(server, args);
		},
	);

	// -------------------------------------------------------------------
	// insrc_analyze_step -- multi-turn variant (plans/mcp-multi-turn-
	// analyze.md). Runs alongside the one-shot tool; the client picks
	// which to invoke. The multi-turn form keeps every LLM reasoning
	// turn in the outer client's session, so no subprocess spawn / no
	// sampling dependency. Phase A supports structural-map fully;
	// narrow-LLM recipes (adherence-check, prose-retrieval, capability-
	// discovery) still fire their inner LLM calls through the daemon's
	// shaperProvider until Phase B lands.
	// -------------------------------------------------------------------
	server.registerTool(
		'insrc_analyze_step',
		{
			title: 'insrc analyze (multi-turn)',
			description:
				'Phase-driven multi-turn context analyzer. Alternative to ' +
				'`insrc_analyze` for clients that want to keep every LLM ' +
				'reasoning turn in-session (no subprocess spawn, no MCP sampling ' +
				'required). Use when:\n\n' +
				'  - The user asks about a repository\'s code structure, ' +
				'conventions, adherence, reuse candidates, or design decisions.\n' +
				'  - You want to answer using the citation-grounded analyze ' +
				'framework rather than manual grep + read.\n\n' +
				'Multi-turn loop:\n\n' +
				'  1. Call phase=\'start\' with the user\'s focus. Server returns\n' +
				'     { next: \'emit_plan\', prompt, schema, state }.\n' +
				'  2. Follow the prompt to emit a JSON object matching the schema\n' +
				'     (the ExplorationPlan). Then call phase=\'plan\' with your\n' +
				'     plan + state.\n' +
				'  3. If the server returns { next: \'emit_narrow\', prompt, schema,\n' +
				'     state, explorationId }, emit the JSON matching the schema and\n' +
				'     call phase=\'narrow\' with your JSON + explorationId + state.\n' +
				'     Repeat until the server returns emit_bundle instead.\n' +
				'  4. Server returns { next: \'emit_bundle\', prompt, schema, state }.\n' +
				'     Emit the bundle JSON, then call phase=\'bundle\' with your\n' +
				'     bundle + state.\n' +
				'  5. Server returns { next: \'done\', markdown } -- render this\n' +
				'     to the user.\n\n' +
				'The `guidance` field on each response explains what to do next ' +
				'in one sentence; the `prompt` + `schema` fields are the ' +
				'authoritative instructions. Preserve `state` verbatim between ' +
				'calls.',
			annotations: {
				readOnlyHint:   true,
				idempotentHint: false,
				openWorldHint:  false,
			},
			inputSchema: {
				phase: z.enum(['start', 'plan', 'narrow', 'bundle'])
					.describe(
						'Which turn of the loop this call carries. Start a new run ' +
						'with `start`, then walk through `plan` -> optional ' +
						'`narrow` (one or more) -> `bundle`. The `narrow` phase is ' +
						'ONLY needed when the prior response was next="emit_narrow"; ' +
						'the server tells you which via the `next` field.',
					),
				// start-only inputs
				focus: z.string().min(1)
					.describe('Only for phase=start. Natural-language framing of what to analyze.')
					.optional(),
				repo: z.string()
					.describe('Only for phase=start. Absolute repo path; falls back to INSRC_REPO env.')
					.optional(),
				target: z.enum(['code', 'docs', 'data', 'infra', 'generic'])
					.describe('Only for phase=start. Optional target hint.')
					.optional(),
				scope: z.enum(['XS', 'S', 'M', 'L', 'XL'])
					.describe('Only for phase=start. Optional scope bucket.')
					.optional(),
				// plan-phase inputs. We type this loosely as an object with
				// the three known top-level fields; ajv still runs a strict
				// pass server-side. Untyped `z.unknown()` compiles to a
				// JSON schema with NO `type` field, which Claude Code's
				// tool-call validator refuses to emit -- observed live on
				// 2026-06-23 when Claude reported "parameter validation is
				// blocking structured plan submission" after repeated
				// retries at phase=start.
				plan: z.object({
					answerType:    z.string(),
					synthesisHint: z.string(),
					explorations:  z.array(z.record(z.string(), z.unknown())),
				})
					.passthrough()
					.describe(
						'Only for phase=plan. The ExplorationPlan JSON your LLM ' +
						'emitted from the prior emit_plan response.',
					)
					.optional(),
				// narrow-phase inputs. Explicit object so the outer LLM's
				// tool-call validator has a shape to satisfy.
				narrow: z.record(z.string(), z.unknown())
					.describe(
						'Only for phase=narrow. The JSON your LLM emitted matching ' +
						'the schema from the prior emit_narrow response (finalizes ' +
						'one narrow-LLM exploration).',
					)
					.optional(),
				explorationId: z.string()
					.describe(
						'Only for phase=narrow. Echo the explorationId from the ' +
						'prior emit_narrow response so the server can cross-check ' +
						'which exploration this narrow output finalizes.',
					)
					.optional(),
				// bundle-phase inputs. Same reasoning: give a typed object
				// with the seven bundle layer keys so the outer LLM's
				// tool-call validator has a shape to satisfy.
				bundle: z.object({
					system:    z.string(),
					focus:     z.string(),
					summary:   z.string(),
					structure: z.string(),
					surface:   z.string(),
					artefacts: z.string(),
					upstream:  z.string(),
				})
					.passthrough()
					.describe(
						'Only for phase=bundle. The AnalyzeContextBundle JSON your ' +
						'LLM emitted from the prior emit_bundle response.',
					)
					.optional(),
				// carried state
				state: z.string()
					.describe(
						'Opaque continuation token from the prior tool response. ' +
						'Required for phase=\'plan\' and phase=\'bundle\'; server ' +
						'generates it on phase=\'start\'.',
					)
					.optional(),
			},
		},
		async (rawArgs, _extra) => handleAnalyzeStep(rawArgs),
	);

	// -------------------------------------------------------------------
	// insrc_workflow_step — multi-turn workflow runner
	// (plans/workflow-implementation.md). Same multi-turn shape as
	// insrc_analyze_step: server holds state under a 22-char opaque
	// token, hands prompts + schemas to the outer LLM turn by turn.
	// -------------------------------------------------------------------
	server.registerTool(
		'insrc_workflow_step',
		{
			title: 'insrc workflow (multi-turn)',
			description:
				'Phase-driven multi-turn workflow runner. Supports:\n\n' +
				'  - `define`        — Epic + Stories with citations (Phase B)\n' +
				'  - `design.epic`   — HLD: framework + shared contracts + rollout (Phase C)\n' +
				'  - `design.story`  — LLD: Story contract + tests + optional migration (Phase D)\n' +
				'  - `tracker.push`  — push Epic+Stories to GitHub Issues (Phase F)\n' +
				'  - `tracker.sync`  — pull GitHub Issue status back into artifact meta\n' +
				'  - `tracker.post`  — post HLD/LLD/amendment summary as issue comment\n' +
				'  - `stub`          — Phase A test workflow (echo/echo/echo)\n\n' +
				'Chain: define → design.epic → design.story (per Story) → tracker.*.\n' +
				'Each gate requires human approval via `insrc workflow approve <path>`.\n' +
				'Amendments to the HLD are typed proposals from downstream steps; ' +
				'review with `insrc workflow amend <slug> --list`. Use `insrc workflow ' +
				'chain <slug>` at any time to see status + the exact next command.\n\n' +
				'Multi-turn loop:\n\n' +
				'  1. phase=\'start\' with { workflow, focus, params? }. Server returns\n' +
				'     { next: \'emit_plan\', prompt, schema, state }.\n' +
				'  2. Emit the plan JSON matching the schema, then phase=\'plan\'\n' +
				'     with plan=<your JSON> + state.\n' +
				'  3. If the server returns { next: \'emit_step\', stepId, prompt,\n' +
				'     schema, state }, emit the JSON matching the schema and call\n' +
				'     phase=\'step\' with stepId + response + state. Repeat until\n' +
				'     you receive emit_synthesize.\n' +
				'  4. Server returns { next: \'emit_synthesize\', prompt, schema, state }.\n' +
				'     Emit the artifact JSON, then phase=\'synthesize\' with artifact + state.\n' +
				'  5. Server returns { next: \'done\', path, markdown, artifact } once\n' +
				'     the artifact has been written to disk.\n\n' +
				'Common params:\n' +
				'  - design.epic:  { epicSlug }\n' +
				'  - design.story: { epicSlug, storyId }\n' +
				'  - tracker.push: { epicSlug, force? }\n' +
				'  - tracker.sync: { epicSlug }\n' +
				'  - tracker.post: { epicSlug, target: { kind: hld|lld|amendment, storyId?, amendmentId? } }\n\n' +
				'The `guidance` field on each response explains what to do next in ' +
				'one sentence; the `prompt` + `schema` fields are the authoritative ' +
				'instructions. Preserve `state` verbatim between calls.',
			annotations: {
				readOnlyHint:   false,   // writes artifacts to disk
				idempotentHint: false,
				openWorldHint:  false,
			},
			inputSchema: {
				phase: z.enum(['start', 'plan', 'step', 'synthesize'])
					.describe('Which turn of the loop this call carries.'),
				workflow: z.enum(WORKFLOW_NAMES)
					.describe('Only for phase=start. Which workflow to run.')
					.optional(),
				focus: z.string().min(1)
					.describe('Only for phase=start. Natural-language framing of the ask.')
					.optional(),
				repo: z.string()
					.describe('Only for phase=start. Absolute repo path; falls back to INSRC_REPO env.')
					.optional(),
				params: z.record(z.string(), z.unknown())
					.describe('Only for phase=start. Optional workflow-specific parameters.')
					.optional(),
				plan: z.object({
					workflow: z.string(),
					steps:    z.array(z.record(z.string(), z.unknown())),
					rationale: z.string().optional(),
				})
					.passthrough()
					.describe('Only for phase=plan. The WorkflowPlan JSON your LLM emitted.')
					.optional(),
				stepId: z.string()
					.describe('Only for phase=step. Echo the stepId from the prior emit_step response.')
					.optional(),
				response: z.record(z.string(), z.unknown())
					.describe('Only for phase=step. The JSON your LLM emitted matching the emit_step schema.')
					.optional(),
				artifact: z.record(z.string(), z.unknown())
					.describe('Only for phase=synthesize. The artifact JSON matching the emit_synthesize schema.')
					.optional(),
				state: z.string()
					.describe('Opaque continuation token from the prior response. Required after phase=start.')
					.optional(),
			},
		},
		async (rawArgs, _extra) => handleWorkflowStep(rawArgs),
	);

	return server;
}

/**
 * Wire the built server to stdio + block until the transport
 * closes. Used by `bin/insrc-mcp`.
 */
export async function runInsrcMcpStdio(): Promise<void> {
	// Register the unified tool set + data drivers BEFORE serving any
	// tool call. The analyze framework's freeform.probe fallback needs
	// the read-only tool surface at runtime; without this the shaper
	// crashes with ReadOnlyToolRegistryMismatch listing every allow-
	// listed tool as unregistered (observed 2026-07-11 when the docs
	// adherence-check plan fell back to freeform.probe on the Ollama
	// path). Mirrors what the main daemon does at boot -- see
	// daemon/index.ts phase 6b/6c.
	const [
		{ registerBuiltinTools },
		{ registerBuiltinDataDrivers },
		{ registerWorkflowRunners },
	] = await Promise.all([
		import('../daemon/tools/builtins/index.js'),
		import('../daemon/db/drivers/index.js'),
		import('../workflow/index.js'),
	]);
	registerBuiltinTools();
	registerBuiltinDataDrivers();
	registerWorkflowRunners();

	const server = buildInsrcMcpServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
	log.info({}, 'insrc-mcp: stdio server connected');
	// The transport will keep the process alive until stdin closes.
}

// ---------------------------------------------------------------------------
// insrc_analyze handler
// ---------------------------------------------------------------------------

async function handleAnalyze(
	server: McpServer,
	args:   {
		repo?:   string;
		focus:   string;
		target?: 'code' | 'docs' | 'data' | 'infra' | 'generic';
		scope?:  'XS' | 'S' | 'M' | 'L' | 'XL';
	},
): Promise<{
	content:  { type: 'text'; text: string }[];
	isError?: boolean;
}> {
	// Resolve the repo path. Explicit param > INSRC_REPO env > fail.
	const repoPath = resolveRepoPath(args.repo);
	if (repoPath === undefined) {
		return errorResult(
			'no repo -- pass the `repo` param or set INSRC_REPO in the ' +
			'MCP server\'s environment. The insrc daemon must have this repo ' +
			'registered (see `insrc repo add`).',
		);
	}

	// Assemble the intent. This mirrors the shape the daemon's
	// `analyze.context.buildRun` RPC accepts (see daemon/analyze-rpc.ts).
	const runId  = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const intent = {
		target:    args.target ?? 'code',
		scope:     args.scope ?? 'M',
		focused:   true,
		focus:     args.focus,
		scopeRef:  { kind: 'workspace', value: repoPath },
		reasoning: `MCP invocation: ${args.focus}`,
	};

	// Provider routing for the in-process analyze pipeline:
	//   1. Client declared `sampling` -> route inner calls back to it.
	//   2. Else default to the CLI that invoked us (Claude Code ->
	//      cli-claude, Codex -> cli-codex) so `claude`/`codex` power the
	//      shaper without any config. An explicit config `shaperProvider`
	//      still overrides this (handled in buildShaperProvider).
	//   3. Unknown client -> the analyze factory's config default.
	const clientCaps = server.server.getClientCapabilities();
	const samplingSupported = clientCaps?.sampling !== undefined;
	const clientDefault = detectClientProvider(server.server.getClientVersion()?.name);

	log.info(
		{
			runId,
			repoPath,
			target: intent.target,
			scope:  intent.scope,
			focus:  intent.focus.slice(0, 80),
			client: server.server.getClientVersion()?.name ?? '(unknown)',
			samplingSupported,
			clientDefault: clientDefault ?? '(none)',
		},
		'insrc_analyze: dispatching',
	);

	const rpcParams = { runId, intent };
	const rpc = samplingSupported
		? runWithSamplerContext(
			makeSamplerFromMcpServer(server.server),
			[],
			() => buildRun(rpcParams),
		)
		: clientDefault !== undefined
			? runWithClientProviderContext(clientDefault, () => buildRun(rpcParams))
			: buildRun(rpcParams);

	const result = await rpc;
	if (!result.ok) {
		return errorResult(
			`analyze.context.buildRun failed: ${result.error.code} -- ${result.error.message}`,
		);
	}

	const markdown = renderBundleAsMarkdown(result.bundle);
	return {
		content: [{ type: 'text', text: markdown }],
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map an MCP client's initialize `clientInfo.name` to the CLI shaper
 *  provider it implies: Claude Code → 'cli-claude', Codex → 'cli-codex'.
 *  Undefined for unknown clients (analyze then uses the config default).
 *  An explicit `models.analyze.shaperProvider` overrides this downstream. */
function detectClientProvider(name: string | undefined): AnalyzeShaperProviderKind | undefined {
	if (name === undefined) return undefined;
	const n = name.toLowerCase();
	if (n.includes('codex'))  return 'cli-codex';
	if (n.includes('claude')) return 'cli-claude';
	return undefined;
}

function resolveRepoPath(explicit: string | undefined): string | undefined {
	if (explicit !== undefined && explicit.length > 0) return explicit;
	const env = process.env['INSRC_REPO'];
	if (env !== undefined && env.length > 0) return env;
	return undefined;
}

function errorResult(message: string): {
	content: { type: 'text'; text: string }[];
	isError: true;
} {
	return {
		content: [{ type: 'text', text: message }],
		isError: true,
	};
}
