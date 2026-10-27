/** Test client for the versioned protocol. It executes real per-call continuations,
 * translating these tests' final dimension fixtures into the model's answer schema. */
import { handleCodeReviewStep } from '../handler.js';
import type { CodeReviewStepDeps } from '../handler.js';
import type { CodeReviewStepMcpEnvelope, CodeReviewStepOutput } from '../types.js';
import type { DimensionResult } from '../../../../workflow/code-review/types.js';
import type { ReviewControllerBudgetDeclaration } from '../../../../shared/review-budget.js';
import { createStepCallHandler } from '../../host.js';
import type { IpcStreamMessage } from '../../../../shared/types.js';

export const CONTROLLER_DECLARATION: ReviewControllerBudgetDeclaration = {
	version: 1, hostContextReserveTokens: 1000, profile: {
		profileVersion: 1, providerId: 'test-controller', transport: 'controller', transportVersion: 'test-v1',
		schemaDialect: 'controller-json-v1', promptDialect: 'controller-frame-v1', qualification: 'controller-reserved', declaredToolsJson: '[]',
		nativeReserveTokens: 16384, transportReserveTokens: 1024, completionReserveTokens: 8192, inspectionReserveTokens: 24576,
	},
};
export async function rawControllerCall(input: unknown, deps: CodeReviewStepDeps): Promise<CodeReviewStepMcpEnvelope> {
	const host = createStepCallHandler({ insrc_code_review_step: async args => handleCodeReviewStep(args, deps) });
	const frames: IpcStreamMessage[] = [];
	await host({ tool: 'insrc_code_review_step', args: input, context: { cwd: '/tmp' } }, f => frames.push(f), new AbortController().signal);
	const last = frames.at(-1)!;
	if (last.stream === 'done') return last.data as CodeReviewStepMcpEnvelope;
	throw new Error(`test host failed: ${JSON.stringify(last.data)}`);
}
export const controllerFixtureFrames: Extract<CodeReviewStepOutput, { next: 'emit_judgements' | 'confirm_wait' }>[] = [];
const frames = new Map<string, Extract<CodeReviewStepOutput, { next: 'emit_judgements' | 'confirm_wait' }>>();
const parse = (envelope: CodeReviewStepMcpEnvelope) => JSON.parse(envelope.content[0]!.text) as CodeReviewStepOutput;
function remember(envelope: CodeReviewStepMcpEnvelope): CodeReviewStepMcpEnvelope {
	const frame = parse(envelope);
	if (frame.next === 'emit_judgements' || frame.next === 'confirm_wait') { frames.set(frame.state, frame); controllerFixtureFrames.push(frame); }
	return envelope;
}
export async function fixtureCodeReviewClient(input: unknown, deps: CodeReviewStepDeps): Promise<CodeReviewStepMcpEnvelope> {
	if (!input || typeof input !== 'object') return rawControllerCall(input, deps);
	const p = input as { phase?: string; state?: string; proceed?: boolean; judgements?: { judgements?: DimensionResult[] } };
	if (p.phase === 'start') {
		const previous = p.state ? frames.get(p.state) : undefined;
		return remember(await rawControllerCall({ ...input, reviewBudget: CONTROLLER_DECLARATION,
			...(previous?.next === 'confirm_wait' && previous.call !== undefined ? { reply: { version: 1, generation: previous.call!['generation'], callId: previous.call!['callId'], answer: { proceed: p.proceed === true } } } : {}),
		}, deps));
	}
	if (p.phase !== 'judgements' || !p.state) return rawControllerCall(input, deps);
	let current = frames.get(p.state);
	if (!current || current.next !== 'emit_judgements') return rawControllerCall({ ...input, reviewBudget: CONTROLLER_DECLARATION, reply: { version: 1, generation: 0, callId: '00000000-0000-0000-0000-000000000000', answer: {} } }, deps);
	for (let turns = 0; turns < 100; turns++) {
		const call = current.call!;
		const supplied = p.judgements?.judgements?.find(j => j.dimension === call['dimension']);
		if (!supplied) return rawControllerCall(input, deps); // legacy/malformed aggregate is never smuggled through
		const findings = supplied.findings.map(({ dimension: _dimension, ...finding }) => ({ ...finding,
			...(call['dimension'] === 'adherence' ? { confidence: finding.confidence ?? 'breach' } : {}),
			...(call['dimension'] === 'coverage' ? { findingKind: finding.findingKind ?? 'other' } : {}),
		}));
		const envelope = remember(await rawControllerCall({ phase: 'judgements', state: current.state, reviewBudget: CONTROLLER_DECLARATION,
			reply: { version: 1, generation: call['generation'], callId: call['callId'], answer: { findings } },
		}, deps));
		const next = parse(envelope);
		if (next.next !== 'emit_judgements') return envelope;
		current = next;
	}
	throw new Error('test client exceeded required model turns');
}
