/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the surgical audit-correction loop.
 *
 *  - Orchestrator taxonomy: a scope-boundary hard-fail (s8 sbdry4) is now minted
 *    CORRECTABLE and carries structured findings (itemId + verdict + detail),
 *    instead of a terminal, detail-less retryable:false.
 *  - Runner helpers: the targeted correction directive + the re-audit call the
 *    daemon loop drives per round.
 *
 * The full recover-instead-of-throw loop runs against define/design.story, whose
 * step chain needs live analyze grounding (Ollama + graph), so it is verified
 * live via the dogfood re-run — not fakeable here without a real provider.
 *
 * Run: npx tsx --test src/daemon/__tests__/workflow-rpc-correction.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { finalizeArtifact } from '../../workflow/orchestrator.js';
import { correctionDirective, reAuditBoundary } from '../workflow-rpc.js';
import type { BoundaryFinding } from '../../workflow/synthesizer.js';
import type { WorkflowIntent } from '../../workflow/types.js';
import type { LLMProvider, LLMMessage, StructuredSchema } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// A minimal LldBody that satisfies isLldBody — just enough to reach the s8
// scope-boundary check (which precedes the standalone finalize + renderer).
// ---------------------------------------------------------------------------

function minimalLldBody(): Record<string, unknown> {
	return {
		hldContextSlice: { frameworkSummary: 'standalone', rolloutPhase: 'standalone', ownedContracts: [], consumedContracts: [], boundary: {}, nonFunctional: {} },
		contractDetails: { surfaceLevel: 'internal', api: [] },
		dataModelChanges: [],
		interactionWithShared: [],
		errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
		testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
		alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

function standaloneLldIntent(): WorkflowIntent {
	return {
		workflow: 'design.story', focus: 'x', repoPath: '/tmp/x', repoIndexedAt: null,
		params: { standalone: true, epicHash: 'b33a91366899e169', storyId: 'S001', sizeClass: 'feature' },
	};
}

// ---------------------------------------------------------------------------
// Orchestrator: correctable boundary failure with structured findings
// ---------------------------------------------------------------------------

test('finalizeArtifact: s8 sbdry4 hard-fail is now CORRECTABLE and carries structured findings', () => {
	const stepOutputs = {
		s8: { results: [{ itemId: 'sbdry4', verdict: 'missed', evidence: 'references src/foo/invented.ts which does not exist in the grounding' }] },
	};
	const artifact = { body: minimalLldBody(), citations: [{ id: 'c1', kind: 'file', ref: 'src/daemon/workflow-rpc.ts' }] };
	const result = finalizeArtifact(standaloneLldIntent(), stepOutputs, 'wf-t', 0, artifact, 'client');

	assert.equal(result.ok, false);
	if (result.ok) return;
	const f = result.failure;
	assert.equal(f.ok, false);
	if (f.ok) return;
	assert.equal(f.kind, 'boundary');
	assert.equal(f.retryable, false, 'a plain re-emit still cannot fix it');
	assert.equal(f.correctable, true, 'but the correction loop CAN');
	assert.ok(f.findings && f.findings.length === 1);
	assert.equal(f.findings![0]!.itemId, 'sbdry4');
	assert.equal(f.findings![0]!.verdict, 'missed');
	assert.match(f.findings![0]!.detail, /invented\.ts/, 'detail carries the auditor evidence, not just the id');
});

test('finalizeArtifact: a CLEAN s8 (all passed) yields no boundary failure', () => {
	const stepOutputs = { s8: { results: [{ itemId: 'sbdry4', verdict: 'passed', evidence: 'all references resolve' }] } };
	const artifact = { body: minimalLldBody(), citations: [{ id: 'c1', kind: 'file', ref: 'src/daemon/workflow-rpc.ts' }] };
	const result = finalizeArtifact(standaloneLldIntent(), stepOutputs, 'wf-t', 0, artifact, 'client');
	// It may still fail later checks, but NOT with a boundary failure.
	if (!result.ok && !result.failure.ok) {
		assert.notEqual(result.failure.kind, 'boundary', 'a passed audit must not trip the boundary hard-fail');
	}
});

// ---------------------------------------------------------------------------
// Runner helper: correctionDirective
// ---------------------------------------------------------------------------

test('correctionDirective: names each finding + demands change-nothing-else + grounding', () => {
	const findings: BoundaryFinding[] = [
		{ itemId: 'sbdry4', verdict: 'missed', detail: 'invented reference src/foo/nope.ts' },
		{ itemId: 'sbdry2', verdict: 'ambiguous', detail: 'a task list crept in' },
	];
	const d = correctionDirective(findings);
	assert.match(d, /sbdry4/);
	assert.match(d, /invented reference src\/foo\/nope\.ts/);
	assert.match(d, /sbdry2/);
	assert.match(d, /CHANGE NOTHING ELSE/i);
	assert.match(d, /grounded in s1|appears in the s1/i, 'directs replacements to real, grounded references');
});

// ---------------------------------------------------------------------------
// Runner helper: reAuditBoundary
// ---------------------------------------------------------------------------

class CapturingProvider implements LLMProvider {
	public lastMessages: LLMMessage[] = [];
	constructor(private readonly response: unknown) {}
	readonly supportsTools = false;
	get capabilities() { return { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false }; }
	async complete(): Promise<never> { throw new Error('unused'); }
	async *stream(): AsyncIterable<string> { throw new Error('unused'); }
	async embed(): Promise<number[]> { return []; }
	async completeStructured<T>(m: LLMMessage[], _s: StructuredSchema): Promise<T> {
		this.lastMessages = m;
		return this.response as T;
	}
}

test('reAuditBoundary: audits the CORRECTED artifact for the flagged items + returns fresh verdicts', async () => {
	const findings: BoundaryFinding[] = [{ itemId: 'sbdry4', verdict: 'missed', detail: 'invented reference X' }];
	const corrected = { body: { note: 'X removed, now cites src/daemon/workflow-rpc.ts' }, citations: [] };
	const provider = new CapturingProvider({ results: [{ itemId: 'sbdry4', verdict: 'passed', evidence: 'the invented reference is gone' }] });

	const fresh = await reAuditBoundary(provider, corrected, findings, {});
	assert.equal(fresh.results[0]!.itemId, 'sbdry4');
	assert.equal(fresh.results[0]!.verdict, 'passed');

	// The prompt must carry BOTH the corrected artifact and the flagged findings.
	const userMsg = provider.lastMessages.find(m => m.role === 'user')?.content ?? '';
	assert.match(userMsg, /X removed/, 'the corrected artifact is in the re-audit prompt');
	assert.match(userMsg, /invented reference X/, 'the prior findings are in the re-audit prompt');
});
