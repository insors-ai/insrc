/**
 * The shared builder of the analyzer's intent from a structured analyze
 * request (Story 65b643840a294422/s1, task t2).
 *
 * Both MCP analyze tools build their intent here. The builder is synchronous
 * and reads neither the file system nor the index: it builds and checks
 * fields. The scope itself is validated later, by the one hook both
 * resolution paths call.
 */

import {
	MAX_REQUEST_CONTEXT_CHARS,
	type AnalyzeRequest,
	type AnalyzeScope,
	type AnalyzeScopeRef,
	type AnalyzeTarget,
} from '../../shared/analyze-types.js';
import type { UnsizedIntent } from '../measure.js';

const TARGETS: readonly AnalyzeTarget[] = ['code', 'data', 'infra', 'generic', 'docs'];
const SCOPE_KINDS: readonly AnalyzeScopeRef['kind'][] = ['repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir', 'workspace'];
const SIZES: readonly AnalyzeScope[] = ['XS', 'S', 'M', 'L', 'XL'];

export interface RequestInput {
	readonly request?: AnalyzeRequest | undefined;
	readonly focus?:   string | undefined;
	readonly target?:  AnalyzeTarget | undefined;
	readonly scope?:   AnalyzeScope | undefined;
}

export interface BuiltIntent {
	readonly intent:    UnsizedIntent;
	readonly sizeHint?: AnalyzeScope | undefined;
}

/**
 * The unsized intent for a structured request, or, for the old flat prompt
 * fields, for the workspace scope at `repoPath`. With a request, the flat
 * `target` and `scope` are ignored.
 *
 * @throws Error when neither a request nor a non-empty focus is given, when
 *   the request is malformed, or when a request and a differing focus are given.
 */
export function buildIntentFromRequest(input: RequestInput, repoPath: string): BuiltIntent {
	const focus = input.focus?.trim();
	const { request } = input;
	if (request === undefined) {
		if (focus === undefined || focus.length === 0) {
			throw new Error('an analyze request needs either `request` or a non-empty `focus`');
		}
		return {
			intent: {
				target:      input.target ?? 'code',
				focused:     true,
				focus:       input.focus!,
				scopeRef:    { kind: 'workspace', value: repoPath },
				reasoning:   `MCP invocation: ${input.focus!}`,
				scopeSource: 'prompt',
			},
			...(input.scope !== undefined ? { sizeHint: input.scope } : {}),
		};
	}
	checkRequest(request);
	const question = request.question.trim();
	if (focus !== undefined && focus.length > 0 && focus !== question) {
		throw new Error(`send either \`request\` or \`focus\`: the focus ${JSON.stringify(focus)} differs from the request's question ${JSON.stringify(question)}`);
	}
	return {
		intent: {
			target:      request.target ?? 'code',
			focused:     true,
			focus:       request.question,
			scopeRef:    { kind: request.scopeRef.kind, value: request.scopeRef.value },
			reasoning:   `MCP structured request: ${request.question}`,
			scopeSource: 'request',
			...(request.context !== undefined ? { context: request.context } : {}),
		},
		...(request.sizeHint !== undefined ? { sizeHint: request.sizeHint } : {}),
	};
}

/** The fields a request must carry; a message names the first bad one. */
function checkRequest(request: AnalyzeRequest): void {
	if (typeof request.question !== 'string' || request.question.trim().length === 0) {
		throw new Error('request.question must be a non-empty string');
	}
	const ref = request.scopeRef as Partial<AnalyzeScopeRef> | undefined;
	if (ref === undefined || ref === null || typeof ref !== 'object' || !SCOPE_KINDS.includes(ref.kind as AnalyzeScopeRef['kind'])) {
		throw new Error(`request.scopeRef.kind must be one of ${SCOPE_KINDS.join(', ')}`);
	}
	if (typeof ref.value !== 'string' || ref.value.length === 0) {
		throw new Error('request.scopeRef.value must be a non-empty string');
	}
	if (request.target !== undefined && !TARGETS.includes(request.target)) {
		throw new Error(`request.target must be one of ${TARGETS.join(', ')}`);
	}
	if (request.sizeHint !== undefined && !SIZES.includes(request.sizeHint)) {
		throw new Error(`request.sizeHint must be one of ${SIZES.join(', ')}`);
	}
	if (request.context !== undefined) {
		if (typeof request.context !== 'string') throw new Error('request.context must be a string');
		if (request.context.length > MAX_REQUEST_CONTEXT_CHARS) {
			throw new Error(`request.context must be at most ${MAX_REQUEST_CONTEXT_CHARS} characters; got ${request.context.length}`);
		}
	}
}
