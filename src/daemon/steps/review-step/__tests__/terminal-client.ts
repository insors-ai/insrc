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
const aliases = new Map<string, Awaited<ReturnType<typeof seedTerminalFixture>>>();
export async function fixtureReviewClient(input: unknown, deps: ReviewStepDeps = {}): Promise<ReviewStepMcpEnvelope> {
	if (!input || typeof input !== 'object') return rawReviewCall(input, deps);
	const p = input as { phase?: string; state?: string; findings?: unknown; verdicts?: unknown };
	if ((p.phase === 'findings' || p.phase === 'verdicts') && p.state) {
		let seeded = aliases.get(p.state);
		if (!seeded) {
			const entry = await getStepStateStore().read<ReviewStepStatePayload>('review', p.state);
			if (!entry) return rawReviewCall({ ...input, reviewBudget: CONTROLLER_DECLARATION, reply: { version: 1, generation: 0, callId: randomUUID(), answer: {} } }, deps);
			seeded = await seedTerminalFixture(entry.payload, p.phase); aliases.set(p.state, seeded);
		}
		return rawReviewCall(seeded.input(p.phase === 'findings' ? p.findings : p.verdicts), deps);
	}
	return rawReviewCall(input, deps);
}
