/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { after as afterAll } from 'node:test';
import { mkdtempSync as mkdtempSyncRaw, rmSync as rmSyncForStore } from 'node:fs';
import { tmpdir as tmpdirForStore } from 'node:os';
import { join as joinForStore } from 'node:path';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';

// This file reaches the graph store through code that takes no path. Give it a
// temporary one: the store at the default path belongs to the daemon alone
// (Epic c2ba6fa6, Story s4).
const STORE_DIR = mkdtempSyncRaw(joinForStore(tmpdirForStore(), 'insrc-test-store-'));
setGraphStorePath(joinForStore(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmSyncForStore(STORE_DIR, { recursive: true, force: true });
});

import type {
	LLMMessage, LLMProvider, LLMResponse, StructuredCompletionOpts, StructuredSchema,
} from '../../../shared/types.js';
import { gatherEvidence } from '../probe.js';
import { runReview } from '../review.js';
import { renderReviewReport } from '../report.js';
import type { Claim } from '../types.js';
import { VERIFY_CALL_TIMEOUT_MS } from '../verify.js';
import { envelopeProvider } from '../../review-pipeline/__tests__/enveloped.js';

// The probe uses the shared `runGrepSearch` backend (ripgrep when present,
// Node walk otherwise), so these tests run everywhere — no rg guard needed.

// ---------------------------------------------------------------------------
// Fixture repo
// ---------------------------------------------------------------------------

/** A repo whose `src/foo.ts` has THREE exported constants (not two). */
function makeRepo(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-review-'));
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(
		join(repo, 'src', 'foo.ts'),
		[
			'export const alpha = 1;',
			'export const beta = 2;',
			'export const gamma = 3;',
			'',
		].join('\n'),
	);
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// The artifact under review — every auto-fix `find` must be a substring here.
// ---------------------------------------------------------------------------

const ARTIFACT = [
	'# Story s1',
	'',
	'- t1: extend the two exported constants in foo.',
	'- t2: beta constant defined at src/foo.ts:2.',
	'- t3: TokenProgressEvent holds the token count.',
	'',
].join('\n');

// ---------------------------------------------------------------------------
// Canned LLM responses (extract + per-premise verify)
// ---------------------------------------------------------------------------

const EXTRACT_JSON = {
	claims: [
		{
			id: 'c-inv', ref: 's1/t1', kind: 'inventory',
			text: 'There are exactly two exported constants in foo.',
			anchors: ['src/foo.ts'],
			probe: { greps: ['^export const'] },
		},
		{
			id: 'c-cite', ref: 's1/t2', kind: 'citation',
			text: 'beta constant defined at src/foo.ts:2.',
			anchors: ['src/foo.ts:2'],
			probe: { reads: ['src/foo.ts:2'] },
		},
		{
			id: 'c-sem', ref: 's1/t3', kind: 'semantic',
			text: 'TokenProgressEvent holds the token count.',
			anchors: ['TokenProgressEvent'],
			probe: { greps: ['TokenProgressEvent'] },
		},
	],
};

// Route a verify call to the right canned finding by the premise text.
function verifyFor(content: string, inventoryLow: boolean): unknown {
	if (content.includes('exported constants')) {
		return inventoryLow
			? { severity: 'LOW', evidence: 'ok', action: 'none — verified sound', fixability: 'manual' }
			: {
				severity: 'HIGH',
				evidence: 'ripgrep re-derived THREE `export const` sites, not two.',
				action: 'Correct the count to three.',
				fixability: 'auto',
				proposedFix: {
					rationale: 'Grep found three exported constants.',
					artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }],
				},
			};
	}
	if (content.includes('beta constant')) {
		return {
			severity: 'LOW',
			evidence: 'read src/foo.ts:2 → `export const beta = 2;` confirms the citation.',
			action: 'none — verified sound',
			fixability: 'manual',
		};
	}
	// semantic → manual, options only, no artifactEdits.
	return {
		severity: 'MED',
		evidence: 'Cannot confirm the type carries a count from the evidence.',
		action: 'Decide the token-count type model.',
		fixability: 'manual',
		proposedFix: {
			rationale: 'Semantic gap — needs a design decision.',
			options: ['Add a count field to TokenProgressEvent', 'Introduce a separate event type'],
		},
	};
}

/** A fake provider that returns canned structured JSON. */
function makeProvider(opts: { inventoryLow: boolean }): LLMProvider {
	const p: LLMProvider = {
		supportsTools: false,
		capabilities: {
			structuredOutput: true, toolCalling: false, vision: false,
			webSearch: false, streaming: false, embeddings: false,
		},
		async complete(): Promise<LLMResponse> {
			return { text: '', stopReason: 'end_turn' };
		},
		async *stream(): AsyncIterable<string> { /* unused */ },
		async embed(): Promise<number[]> { return []; },
		async completeStructured<T>(
			messages: LLMMessage[],
			schema: StructuredSchema,
			_opts?: StructuredCompletionOpts,
		): Promise<T> {
			const props = (schema as { properties?: Record<string, unknown> }).properties ?? {};
			if ('claims' in props) {
				return EXTRACT_JSON as unknown as T;
			}
			const content = messages.map(m => (typeof m.content === 'string' ? m.content : '')).join('\n');
			return verifyFor(content, opts.inventoryLow) as T;
		},
	};
	return envelopeProvider(p);
}

const BASE_OPTS = { model: 'fake-model', reviewedAt: '2026-07-20T00:00:00.000Z' } as const;

// ---------------------------------------------------------------------------
// (a) HIGH inventory finding when the claim says "two" but rg finds three
// ---------------------------------------------------------------------------

test('HIGH inventory finding when claim says two but ripgrep finds three', async () => {
	const { repo, cleanup } = makeRepo();
	try {
		const report = await runReview(ARTIFACT, {
			repo, stage: 'plan', provider: makeProvider({ inventoryLow: false }), ...BASE_OPTS,
		});
		const inv = report.findings.find(f => f.claimId === 'c-inv');
		assert.ok(inv, 'inventory finding present');
		assert.equal(inv.severity, 'HIGH');
		assert.equal(inv.kind, 'inventory');
		assert.equal(report.counts.high, 1);
	} finally {
		cleanup();
	}
});

// ---------------------------------------------------------------------------
// (b) citation whose path:line read confirms → LOW
// ---------------------------------------------------------------------------

test('citation confirmed by path:line read is LOW', async () => {
	const { repo, cleanup } = makeRepo();
	try {
		// Confirm the deterministic read actually found the real line first.
		const claim: Claim = {
			id: 'c-cite', kind: 'citation', text: 'x', anchors: ['src/foo.ts:2'],
			probe: { reads: ['src/foo.ts:2'] },
		};
		const [ev] = await gatherEvidence([claim], repo);
		assert.ok(ev);
		assert.equal(ev.reads[0]?.found, true);
		assert.match(ev.reads[0]?.line ?? '', /beta = 2/);

		const report = await runReview(ARTIFACT, {
			repo, stage: 'plan', provider: makeProvider({ inventoryLow: true }), ...BASE_OPTS,
		});
		const cite = report.findings.find(f => f.claimId === 'c-cite');
		assert.ok(cite);
		assert.equal(cite.severity, 'LOW');
	} finally {
		cleanup();
	}
});

// ---------------------------------------------------------------------------
// (c) verdict = block when a HIGH (or MED default policy) present; pass when all LOW
// ---------------------------------------------------------------------------

test('verdict is block when HIGH present, pass when all LOW', async () => {
	const { repo, cleanup } = makeRepo();
	try {
		const blocked = await runReview(ARTIFACT, {
			repo, stage: 'plan', provider: makeProvider({ inventoryLow: false }), ...BASE_OPTS,
		});
		assert.equal(blocked.verdict, 'block');

		// All LOW: inventory reports LOW and drop the semantic (MED) claim by
		// blocking only on HIGH — but simplest: force everything LOW.
		const allLow = await runReview(ARTIFACT, {
			repo, stage: 'plan',
			provider: makeProvider({ inventoryLow: true }),
			blockOn: ['HIGH'],
			...BASE_OPTS,
		});
		// semantic still MED, so with blockOn HIGH → not block, but warn.
		assert.equal(allLow.verdict, 'warn');

		// Truly all-LOW pass path: a provider that returns LOW everywhere.
		const lowProvider = makeProvider({ inventoryLow: true });
		const orig = lowProvider.completeStructured.bind(lowProvider);
		(lowProvider as { completeStructured: LLMProvider['completeStructured'] }).completeStructured =
			async <T>(m: LLMMessage[], s: StructuredSchema, o?: StructuredCompletionOpts): Promise<T> => {
				const props = (s as { properties?: Record<string, unknown> }).properties ?? {};
				if ('claims' in props) return orig<T>(m, s, o);
				return { severity: 'LOW', evidence: 'ok', action: 'none', fixability: 'manual' } as T;
			};
		const pass = await runReview(ARTIFACT, { repo, stage: 'plan', provider: lowProvider, ...BASE_OPTS });
		assert.equal(pass.verdict, 'pass');
		assert.equal(pass.counts.low, 3);
	} finally {
		cleanup();
	}
});

// ---------------------------------------------------------------------------
// (d) gatherEvidence truncation flag when matches exceed the cap
// ---------------------------------------------------------------------------

test('gatherEvidence sets truncated when matches exceed the cap', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-review-trunc-'));
	try {
		mkdirSync(join(repo, 'src'), { recursive: true });
		// 120 lines all matching the pattern → exceeds the 50 cap.
		const body = Array.from({ length: 120 }, (_, i) => `const marker_${i} = ${i};`).join('\n');
		writeFileSync(join(repo, 'src', 'big.ts'), body + '\n');
		const claim: Claim = {
			id: 'c-big', kind: 'inventory', text: 'markers', anchors: [],
			probe: { greps: ['marker_'] },
		};
		const [ev] = await gatherEvidence([claim], repo);
		assert.ok(ev);
		assert.equal(ev.grepResults[0]?.truncated, true);
		assert.equal(ev.grepResults[0]?.matches.length, 50);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Addendum: auto finding yields applicable artifactEdits; manual yields options only
// ---------------------------------------------------------------------------

test('auto finding yields artifactEdits whose find is a real substring; manual yields options and no edits', async () => {
	const { repo, cleanup } = makeRepo();
	try {
		const report = await runReview(ARTIFACT, {
			repo, stage: 'plan', provider: makeProvider({ inventoryLow: false }), ...BASE_OPTS,
		});

		const auto = report.findings.find(f => f.fixability === 'auto');
		assert.ok(auto, 'an auto finding is present');
		const edits = auto.proposedFix?.artifactEdits ?? [];
		assert.ok(edits.length > 0, 'auto finding has artifactEdits');
		for (const edit of edits) {
			assert.ok(ARTIFACT.includes(edit.find), `find "${edit.find}" is a real substring of the artifact`);
		}

		const manual = report.findings.find(f => f.claimId === 'c-sem');
		assert.ok(manual, 'semantic finding present');
		assert.equal(manual.fixability, 'manual');
		assert.ok((manual.proposedFix?.options?.length ?? 0) > 0, 'manual finding has options');
		assert.equal(manual.proposedFix?.artifactEdits, undefined, 'manual finding has NO artifactEdits');
	} finally {
		cleanup();
	}
});

// ---------------------------------------------------------------------------
// Report rendering + progress
// ---------------------------------------------------------------------------

test('renderReviewReport emits a verdict header, a table, and orders HIGH first', async () => {
	const { repo, cleanup } = makeRepo();
	try {
		const phases: string[] = [];
		const report = await runReview(ARTIFACT, {
			repo, stage: 'plan', provider: makeProvider({ inventoryLow: false }),
			onProgress: p => phases.push(p), ...BASE_OPTS,
		});
		const md = renderReviewReport(report);
		assert.match(md, /Review `BLOCK`/);
		assert.match(md, /\| Ref \| Kind \| Severity \| Fixability \| Premise \| Evidence \| Action \|/);
		// HIGH row must appear before any LOW row.
		const highIdx = md.indexOf('HIGH');
		const lowIdx = md.indexOf('LOW');
		assert.ok(highIdx >= 0 && (lowIdx === -1 || highIdx < lowIdx));
		// Progress phases fired for extract, probe, verify:*, done.
		assert.ok(phases.includes('extract'));
		assert.ok(phases.includes('probe'));
		assert.ok(phases.some(p => p.startsWith('verify:')));
		assert.ok(phases.includes('done'));
	} finally {
		cleanup();
	}
});

test('gatherEvidence notes a file that EXISTS on disk but is named in no file body (probe fix)', async () => {
	const { repo, cleanup } = makeRepo();   // makeRepo writes src/foo.ts (content: export const alpha…)
	try {
		// grep the filename "foo.ts" — content-grep finds 0 (no body mentions it),
		// but the file exists, so the existence check must surface it.
		const claim: Claim = { id: 'c-exists', kind: 'citation', text: 'foo.ts exists', anchors: [], probe: { greps: ['foo.ts'] } };
		const [ev] = await gatherEvidence([claim], repo);
		assert.ok(ev);
		const all = ev.grepResults.flatMap(g => g.matches).join('\n');
		assert.match(all, /FILE EXISTS: .*foo\.ts/);
	} finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// A stalled or failed premise call (ISSUE-d4b2cd1c)
// ---------------------------------------------------------------------------

const STALL = 'codex exited with -9. stderr=Reading prompt from stdin...\n stdout={"type":"thread.started","thread_id":"t-stalled"}';

/** makeProvider, but the 'beta constant' premise call throws `STALL` on its first `failures` calls; records every verify call's options. */
function stallingProvider(failures: number): { provider: LLMProvider; betaCalls: () => number; verifyOpts: StructuredCompletionOpts[] } {
	const p = makeProvider({ inventoryLow: true });
	const orig = p.completeStructured.bind(p);
	let beta = 0;
	const verifyOpts: StructuredCompletionOpts[] = [];
	(p as { completeStructured: LLMProvider['completeStructured'] }).completeStructured = async <T>(messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts): Promise<T> => {
		const isVerify = !('claims' in ((schema as { properties?: Record<string, unknown> }).properties ?? {}));
		if (isVerify) verifyOpts.push(opts ?? {});
		const content = messages.map(m => (typeof m.content === 'string' ? m.content : '')).join('\n');
		if (isVerify && content.includes('beta constant') && beta++ < failures) throw new Error(STALL);
		return orig<T>(messages, schema, opts);
	};
	return { provider: p, betaCalls: () => beta, verifyOpts };
}

test('a premise call that fails once is retried as a fresh call and judged; the review completes', async () => {
	const { repo, cleanup } = makeRepo();
	try {
		const s = stallingProvider(1);
		const report = await runReview(ARTIFACT, { repo, stage: 'plan', provider: s.provider, ...BASE_OPTS });
		assert.equal(s.betaCalls(), 2, 'the failed premise call was made again');
		assert.equal(report.findings.length, 3);
		assert.equal(report.findings.find(f => f.claimId === 'c-cite')?.severity, 'LOW', 'judged by the retry');
	} finally { cleanup(); }
});

test('a premise call that fails twice is recorded as not judged, never as a pass, and every other premise is kept', async () => {
	const { repo, cleanup } = makeRepo();
	try {
		const s = stallingProvider(Number.POSITIVE_INFINITY);
		const report = await runReview(ARTIFACT, { repo, stage: 'plan', provider: s.provider, ...BASE_OPTS });
		assert.equal(s.betaCalls(), 2, 'retried once, not more');
		const cite = report.findings.find(f => f.claimId === 'c-cite');
		assert.ok(cite, 'the failed premise is in the report');
		assert.equal(cite.severity, 'MED');
		assert.equal(cite.fixability, 'manual');
		assert.ok(cite.evidence.startsWith('Not judged'), cite.evidence);
		assert.ok(cite.evidence.includes('t-stalled'), 'the cause, with its codex session, is kept');
		assert.equal(report.findings.find(f => f.claimId === 'c-inv')?.severity, 'LOW', 'premises judged before it are kept');
		assert.equal(report.findings.find(f => f.claimId === 'c-sem')?.severity, 'MED', 'premises after it are still judged');
		assert.equal(report.verdict, 'block', 'a premise not judged blocks under the default policy');
	} finally { cleanup(); }
});

test('every premise judgement carries a per-call limit well under the provider default', async () => {
	const { repo, cleanup } = makeRepo();
	try {
		const s = stallingProvider(0);
		await runReview(ARTIFACT, { repo, stage: 'plan', provider: s.provider, ...BASE_OPTS });
		assert.equal(s.verifyOpts.length, 3);
		for (const o of s.verifyOpts) assert.equal(o.timeoutMs, VERIFY_CALL_TIMEOUT_MS);
		assert.ok(VERIFY_CALL_TIMEOUT_MS <= 180_000);
	} finally { cleanup(); }
});

test('a cancelled review still ends at once instead of recording the premise as not judged', async () => {
	const { repo, cleanup } = makeRepo();
	try {
		const p = makeProvider({ inventoryLow: true });
		const orig = p.completeStructured.bind(p);
		(p as { completeStructured: LLMProvider['completeStructured'] }).completeStructured = async <T>(messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts): Promise<T> => {
			if (!('claims' in ((schema as { properties?: Record<string, unknown> }).properties ?? {}))) {
				const e = new Error('cancelled'); e.name = 'AbortError'; throw e;
			}
			return orig<T>(messages, schema, opts);
		};
		await assert.rejects(runReview(ARTIFACT, { repo, stage: 'plan', provider: p, ...BASE_OPTS }), (e: unknown) => e instanceof Error && e.name === 'AbortError');
	} finally { cleanup(); }
});
