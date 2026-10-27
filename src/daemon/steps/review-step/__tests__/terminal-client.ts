/** t11 terminal fixtures: seed the new protected terminal protocol explicitly.
 * This is not a production token migration; t12 connects real start/extraction emissions. */
import { randomUUID } from 'node:crypto';
import { handleReviewStep } from '../handler.js';
import type { ReviewStepDeps, ReviewStepMcpEnvelope, ReviewStepStatePayload, RawVerdict } from '../types.js';
import { createStepCallHandler } from '../../host.js';
import type { IpcStreamMessage } from '../../../../shared/types.js';
import { getStepStateStore } from '../../../threads/step-state.js';
import { controllerPolicy } from '../../../../workflow/review-pipeline/controller.js';
import { CONTROLLER_DECLARATION } from '../../code-review-step/__tests__/controller-client.js';
import { reviewTemplateFor, TEMPLATE_ANSWER_SCHEMA } from '../../../../workflow/review/template.js';
import { VERDICTS_SCHEMA } from '../schema.js';
import type { ReviewTerminalProtocol } from '../terminal.js';

export { CONTROLLER_DECLARATION };
export async function rawReviewCall(input: unknown, deps: ReviewStepDeps = {}): Promise<ReviewStepMcpEnvelope> {
	const host = createStepCallHandler({ insrc_review_step: async args => handleReviewStep(args, deps) });
	const frames: IpcStreamMessage[] = [];
	await host({ tool: 'insrc_review_step', args: input, context: { cwd: '/tmp' } }, frame => frames.push(frame), deps.signal ?? new AbortController().signal);
	const last = frames.at(-1)!;
	if (last.stream === 'done') return last.data as ReviewStepMcpEnvelope;
	throw new Error(`test review host failed: ${JSON.stringify(last.data)}`);
}
export async function seedTerminalFixture(payload: ReviewStepStatePayload, phase: 'findings' | 'verdicts', overrides: Partial<ReviewTerminalProtocol> = {}) {
	const policy = controllerPolicy(CONTROLLER_DECLARATION).policy;
	const ids = payload.claims?.map(claim => claim.id) ?? [];
	const protocol: ReviewTerminalProtocol = { version: 1, generation: 0, callId: randomUUID(), policy, phase,
		schema: (phase === 'findings' ? TEMPLATE_ANSWER_SCHEMA : VERDICTS_SCHEMA) as Record<string, unknown>, deadlineAt: Date.now() + 600000, budgetMs: 600000,
		...(phase === 'findings' && payload.templateIntent !== undefined ? { expectedItemIds: reviewTemplateFor(payload.templateIntent).items.map(item => item.id) } : {}),
		...(phase === 'verdicts' ? { expectedClaimIds: ids, assignedClaimIds: ids, completedVerdicts: [] as RawVerdict[], extractionComplete: payload.claims !== undefined } : {}), ...overrides };
	const token = await getStepStateStore().mintReviewState('review', { ...payload, controller: protocol }, protocol);
	return { token, protocol, input: (answer: unknown) => ({ phase, state: token, reviewBudget: CONTROLLER_DECLARATION, reply: { version: 1, generation: protocol.generation, callId: protocol.callId, answer } }) };
}
const frames = new Map<string, Record<string, unknown>>();
function remember(envelope: ReviewStepMcpEnvelope): ReviewStepMcpEnvelope {
	const frame = JSON.parse(envelope.content[0]!.text) as Record<string, unknown>;
	if (typeof frame['state'] === 'string') frames.set(frame['state'], frame);
	return envelope;
}
export async function fixtureReviewClient(input: unknown, deps: ReviewStepDeps = {}): Promise<ReviewStepMcpEnvelope> {
	if (!input || typeof input !== 'object') return rawReviewCall(input, deps);
	const p = input as { phase?: string; state?: string; findings?: unknown; verdicts?: { verdicts?: RawVerdict[] }; claims?: unknown };
	if (p.phase === 'start') return remember(await rawReviewCall({ ...input, reviewBudget: CONTROLLER_DECLARATION }, deps));
	if (!p.state || !['claims', 'verdicts', 'findings'].includes(p.phase ?? '')) return rawReviewCall(input, deps);
	let frame = frames.get(p.state);
	if (!frame) return rawReviewCall({ ...input, reviewBudget: CONTROLLER_DECLARATION, reply: { version: 1, generation: 0, callId: randomUUID(), answer: {} } }, deps);
	for (let turns = 0; turns < 100; turns++) {
		const call = frame['call'] as { generation: number; callId: string; assignedClaimIds?: string[] };
		const answer = p.phase === 'findings' ? p.findings : p.phase === 'claims' ? p.claims : {
			verdicts: p.verdicts?.verdicts?.filter(verdict => call.assignedClaimIds?.includes(verdict.claimId)),
		};
		const result = remember(await rawReviewCall({ phase: p.phase, state: p.state, reviewBudget: CONTROLLER_DECLARATION,
			reply: { version: 1, generation: call?.generation ?? 0, callId: call?.callId ?? randomUUID(), answer },
		}, deps));
		const next = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
		if (p.phase !== 'verdicts' || next['next'] !== 'emit_verdicts') return result;
		frame = next;
	}
	throw new Error('review fixture exceeded its verification turns');
}
