/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * McpSamplingProvider -- forwards structured-output + text-completion
 * calls back to the MCP CLIENT that dispatched the tool call, via the
 * standard `sampling/createMessage` capability.
 *
 * Motivation: when the analyze framework is invoked as an MCP tool
 * (typically from Claude Code or Codex CLI), we do NOT want the
 * daemon to spawn `claude --print` subprocesses for its inner LLM
 * calls (decomposer, synthesizer, doc.decision.trace, etc.). Two
 * layers of `claude` in one flow reads as an anti-pattern -- MCP
 * defines `sampling` for exactly this: the server asks the client
 * to run the sample from its own LLM in the same session.
 *
 * The provider is transport-agnostic. Rather than reach for the MCP
 * SDK here, we take a `sampler` callback in the constructor -- a
 * plain function that translates a `SamplingRequest` into a
 * `SamplingResponse`. The MCP server layer wires up the callback to
 * whichever transport it's using (stdio, SSE, HTTP). Tests inject a
 * stub sampler; there's no coupling to a specific SDK.
 *
 * Capabilities:
 *   - structuredOutput: true  (via a prompt-side schema instruction +
 *                              JSON extraction + ajv retry -- MCP
 *                              sampling has no wire-level schema
 *                              enforcement, so we lean on the same
 *                              retry helper Ollama's Phase A rewrite
 *                              uses)
 *   - toolCalling:      false (daemon-side runners orchestrate every
 *                              tool call; the outer LLM is asked
 *                              only to reason, not to plan more tool
 *                              use)
 *   - vision:           false (deferred; sampling supports images but
 *                              the analyze framework has no vision
 *                              call sites)
 *   - webSearch:        false
 *   - streaming:        false (`stream()` throws; the analyze framework
 *                              never streams, and re-implementing
 *                              streaming through sampling is out of
 *                              scope for the MCP-integration path)
 *   - embeddings:       depends on `embedDelegate` (typically an
 *                              Ollama provider for indexer-time
 *                              embeddings; the sampling path never
 *                              embeds)
 *
 * The retry loop is delegated to `withStructuredRetry` (same helper
 * OllamaProvider uses) so the semantics are identical: at most
 * `maxAttempts` calls, each subsequent attempt receives the previous
 * validation errors as a corrective retry note.
 */

import type {
	CompletionOpts,
	LLMMessage,
	LLMProvider,
	LLMResponse,
	ProviderCapabilities,
	StructuredCompletionOpts,
	StructuredSchema,
} from '../../shared/types.js';
import { getLogger } from '../../shared/logger.js';
import {
	validateAgainstSchema,
	withStructuredRetry,
} from './structured-output.js';

const log = getLogger('mcp-sampling-provider');

// ---------------------------------------------------------------------------
// Sampling request / response shapes
// ---------------------------------------------------------------------------

/**
 * Role of a single message inside an MCP sampling request. The
 * protocol only recognises `user` and `assistant`; a `system` prompt
 * lives on the top-level `systemPrompt` field.
 */
export type SamplingRole = 'user' | 'assistant';

export interface SamplingMessage {
	readonly role:    SamplingRole;
	/** Plain-text content. The MCP spec's block union (text / image /
	 *  audio) is collapsed to text-only here -- the analyze framework
	 *  never emits non-text messages. */
	readonly content: string;
}

export interface SamplingRequest {
	readonly messages:      readonly SamplingMessage[];
	readonly systemPrompt?: string;
	readonly maxTokens?:    number;
	readonly temperature?:  number;
	/** Model-preference hints per the MCP spec. Clients honour these
	 *  best-effort. */
	readonly modelPreferences?: {
		readonly hints?: readonly string[];
		readonly costPriority?:         number;
		readonly speedPriority?:        number;
		readonly intelligencePriority?: number;
	};
	/** `stopReason` back-channel: the caller may signal it wants the
	 *  response to end at a specific stop sequence. Rarely used here. */
	readonly stopSequences?: readonly string[];
}

export interface SamplingResponse {
	readonly role:    SamplingRole;
	readonly content: string;
	readonly model?:  string;
	readonly stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens' | 'toolUse' | string;
	readonly usage?: {
		readonly inputTokens?:  number;
		readonly outputTokens?: number;
	};
}

/**
 * The transport-neutral sampling callback. The MCP server layer
 * translates this into a real `sampling/createMessage` request; tests
 * inject a synchronous stub.
 */
export type SamplingCallback = (request: SamplingRequest) => Promise<SamplingResponse>;

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

export interface McpSamplingProviderOpts {
	readonly sampler:        SamplingCallback;
	/** Model-preference hints forwarded on every request. The client
	 *  ultimately picks the model; this is a suggestion. */
	readonly modelHints?:    readonly string[];
	/** Provider that handles `embed()`. Usually an Ollama provider. */
	readonly embedDelegate?: Pick<LLMProvider, 'embed' | 'capabilities'>;
	/** Default max output tokens forwarded on every request when the
	 *  caller doesn't override. Optional; the client's default applies
	 *  when neither this nor the caller sets one. */
	readonly maxTokens?:     number;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class McpSamplingProvider implements LLMProvider {
	readonly supportsTools = false;
	readonly capabilities: ProviderCapabilities;

	private readonly sampler:       SamplingCallback;
	private readonly modelHints:    readonly string[];
	private readonly embedDelegate: Pick<LLMProvider, 'embed' | 'capabilities'> | undefined;
	private readonly defaultMaxTokens: number | undefined;

	constructor(opts: McpSamplingProviderOpts) {
		this.sampler          = opts.sampler;
		this.modelHints       = opts.modelHints ?? [];
		this.embedDelegate    = opts.embedDelegate;
		this.defaultMaxTokens = opts.maxTokens;
		this.capabilities = {
			structuredOutput: true,
			toolCalling:      false,
			vision:           false,
			webSearch:        false,
			streaming:        false,
			embeddings:       opts.embedDelegate !== undefined,
		};
	}

	// -- complete -------------------------------------------------------

	async complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse> {
		if (opts?.tools !== undefined && opts.tools.length > 0) {
			throw new Error(
				'McpSamplingProvider: tool_use requests are not supported. ' +
				'The analyze framework\'s tool-loop callers (freeform.probe, ' +
				'classification, task) must be routed through an ' +
				'Ollama-family provider.',
			);
		}
		const req = this.buildRequest(messages, opts);
		const t0 = Date.now();
		const res = await this.sampler(req);
		log.debug(
			{
				elapsedMs:    Date.now() - t0,
				inputTokens:  res.usage?.inputTokens ?? undefined,
				outputTokens: res.usage?.outputTokens ?? undefined,
				model:        res.model,
				stopReason:   res.stopReason,
			},
			'mcp-sampling: complete',
		);
		return {
			text:       res.content,
			toolCalls:  [],
			stopReason: mapStopReason(res.stopReason),
			usage: {
				inputTokens:  res.usage?.inputTokens ?? 0,
				outputTokens: res.usage?.outputTokens ?? 0,
			},
		};
	}

	// -- completeStructured ---------------------------------------------

	async completeStructured<T>(
		messages: LLMMessage[],
		schema:   StructuredSchema,
		opts?:    StructuredCompletionOpts,
	): Promise<T> {
		const maxAttempts = opts?.maxAttempts ?? 3;
		return withStructuredRetry<T>(
			async (retryNote) => {
				const augmented = augmentForSchema(messages, schema, retryNote);
				const req = this.buildRequest(augmented, {
					...(opts?.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
					...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
				});
				const t0 = Date.now();
				const res = await this.sampler(req);
				log.debug(
					{
						elapsedMs:    Date.now() - t0,
						model:        res.model,
						stopReason:   res.stopReason,
						outputTokens: res.usage?.outputTokens ?? undefined,
					},
					'mcp-sampling: completeStructured turn',
				);
				return extractJsonPayload(res.content);
			},
			(raw) => validateAgainstSchema<T>(schema, raw),
			maxAttempts,
		);
	}

	// -- stream ---------------------------------------------------------

	stream(_messages: LLMMessage[], _opts?: CompletionOpts): AsyncIterable<string> {
		// The analyze framework never streams; no callers currently
		// invoke this on any provider (streaming was carried in
		// LLMProvider for the memory-shape extractor, which was
		// removed in the cleanup). Left as an explicit throw so a new
		// caller can't silently hang.
		throw new Error(
			'McpSamplingProvider: stream() is not implemented. Use complete() or ' +
			'completeStructured() instead. If a caller needs streaming here, it ' +
			'should be added intentionally + tested end-to-end against the client.',
		);
	}

	// -- embed ----------------------------------------------------------

	async embed(text: string): Promise<number[]> {
		if (this.embedDelegate === undefined) {
			throw new Error(
				'McpSamplingProvider: embed() called but no embedDelegate is wired. ' +
				'Pass one (usually an OllamaProvider) if the pipeline needs ' +
				'embeddings alongside sampling.',
			);
		}
		return this.embedDelegate.embed(text);
	}

	// -- internals ------------------------------------------------------

	private buildRequest(
		messages: readonly LLMMessage[],
		opts?:    CompletionOpts,
	): SamplingRequest {
		// The MCP sampling protocol places system content on a top-level
		// field, not inside the messages array. Extract the first system
		// message (if any) + drop remaining system messages -- multi-
		// system inputs concatenate into a single systemPrompt so the
		// client's LLM sees the same tail-order the caller intended.
		const systemParts: string[] = [];
		const forwarded:   SamplingMessage[] = [];
		for (const m of messages) {
			const content = normaliseMessageContent(m.content);
			if (m.role === 'system') {
				systemParts.push(content);
				continue;
			}
			if (m.role === 'user' || m.role === 'assistant') {
				forwarded.push({ role: m.role, content });
			}
			// The `tool` role is silently dropped -- MCP sampling has no
			// notion of tool results (we already asserted no tools on
			// the complete() path; on the structured-output path this
			// case cannot arise).
		}
		const maxTokens = opts?.maxTokens ?? this.defaultMaxTokens;
		const systemPrompt = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
		return {
			messages: forwarded,
			...(systemPrompt !== undefined ? { systemPrompt } : {}),
			...(maxTokens !== undefined ? { maxTokens } : {}),
			...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
			...(this.modelHints.length > 0
				? { modelPreferences: { hints: this.modelHints } }
				: {}),
		};
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an `LLMMessage` content field into a single string. The
 * project uses two shapes: plain string (Ollama, most CLI paths) and
 * a `ContentBlock[]` union (Anthropic-style multi-block). The
 * sampling path only forwards text, so extract text blocks and
 * concatenate; drop tool_use / tool_result / image blocks.
 */
function normaliseMessageContent(content: LLMMessage['content']): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	const parts: string[] = [];
	for (const block of content) {
		if ((block as { type?: string }).type === 'text'
			&& typeof (block as { text?: string }).text === 'string') {
			parts.push((block as { text: string }).text);
		}
	}
	return parts.join('\n');
}

/**
 * Append a schema-instruction to the message list so the model
 * knows to emit JSON matching the schema. The retry helper's
 * corrective note (when present) is appended as an additional user
 * turn -- mirrors the pattern the Ollama provider uses.
 *
 * The schema instruction goes AT THE TAIL of the conversation so
 * qwen3.6-style recency-weighted models see it right before they
 * emit. Non-Ollama models (Claude, GPT) still benefit from tail
 * placement -- the schema is the last thing they read.
 */
function augmentForSchema(
	messages:  readonly LLMMessage[],
	schema:    StructuredSchema,
	retryNote: string | undefined,
): LLMMessage[] {
	const out: LLMMessage[] = [...messages];
	const schemaText = JSON.stringify(schema);
	const instruction =
		'Respond with ONLY a JSON object matching this schema (no markdown ' +
		'fence, no prose):\n' +
		'```json\n' + schemaText + '\n```';
	out.push({ role: 'user', content: instruction });
	if (retryNote !== undefined && retryNote.length > 0) {
		out.push({ role: 'user', content: retryNote });
	}
	return out;
}

/**
 * Extract the JSON payload from the sampled response text. Clients
 * usually honour the "no markdown fence" instruction but not always
 * -- strip a leading ```json fence + trailing ``` if present, then
 * JSON.parse. Failure throws a plain error the retry helper
 * classifies as a validation failure + issues a corrective retry.
 */
function extractJsonPayload(raw: string): unknown {
	let s = raw.trim();
	// Strip a markdown JSON fence if the model added one.
	if (s.startsWith('```')) {
		const end = s.lastIndexOf('```');
		if (end > 3) {
			// Skip past the opening fence's first newline.
			const firstNl = s.indexOf('\n');
			if (firstNl !== -1 && firstNl < end) {
				s = s.slice(firstNl + 1, end).trim();
			}
		}
	}
	try {
		return JSON.parse(s);
	} catch (err) {
		throw new Error(
			`McpSamplingProvider: response was not valid JSON: ${(err as Error).message}. ` +
			`text=${raw.slice(0, 300)}`,
		);
	}
}

/**
 * Map MCP sampling's `stopReason` field to the framework's stopReason
 * shape. MCP names differ slightly from Anthropic's / Ollama's.
 */
function mapStopReason(stopReason: string | undefined): LLMResponse['stopReason'] {
	switch (stopReason) {
		case 'endTurn':      return 'end_turn';
		case 'maxTokens':    return 'max_tokens';
		case 'toolUse':      return 'tool_use';
		// MCP's 'stopSequence' has no direct counterpart in the
		// framework's stopReason union; collapse to 'end_turn' since
		// the model reached a caller-supplied stop.
		case 'stopSequence': return 'end_turn';
		default:             return 'end_turn';
	}
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

export const _augmentForSchemaForTest  = augmentForSchema;
export const _extractJsonPayloadForTest = extractJsonPayload;
export const _mapStopReasonForTest     = mapStopReason;
