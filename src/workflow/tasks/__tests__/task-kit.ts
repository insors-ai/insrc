import type { PlanTask } from '../../artifacts/plan.js';

export const row = (id: string, order: number, over: Partial<PlanTask> = {}): PlanTask => ({
	id, title: `Task ${id}`, summary: `does ${id}`, size: 'S', order, dependsOn: order > 1 ? [`t${order - 1}`] : [],
	acceptanceChecks: ['it works'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: `${id}.test.ts: works` }], ...over,
});

export const citations = [{ id: 'c1', kind: 'prior-artifact' as const, ref: 'LLD s7' }];
