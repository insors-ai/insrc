/*---------------------------------------------------------------------------------------------
 *  Copyright (c) insors.ai. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 *  Root-union guard — HERMETIC. Nothing here is gated and nothing here is
 *  billed, which is why the filename is `.test.ts` and NOT `.live.test.ts`
 *  (this repo's marker for suites that spawn the real `claude`/`codex`
 *  binaries behind `INSRC_LIVE_TESTS=1`).
 *
 *  That is a property of the design, not a trick: the guard rejects BEFORE any
 *  subprocess is spawned, so there is no binary for a test to need. The
 *  integration half drives the REAL `CliProvider.completeStructured` with
 *  `binPath` pointed at a path that cannot exist — whether the guard works is
 *  then readable off WHICH error comes back.
 *
 *  The vendor constraint these tests encode was established by direct probe of
 *  both binaries (2026-10-03); the verbatim messages are recorded in the Story
 *  LLD. Re-probing it on every run would spend billed calls to re-learn a
 *  settled fact.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as structuredOutput from '../structured-output.js';
import { rootUnionKey, type RootUnionKey } from '../structured-output.js';
import { CliProvider, isTransientCliError } from '../cli-provider.js';
import { DOCGEN_OUTCOME_SCHEMA } from '../../../docgen/schema.js';
import type { LLMMessage, StructuredSchema } from '../../../shared/types.js';


// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Two object branches discriminated by `kind` — the shape TypeBox's
 *  `Type.Union([Type.Object(...), ...])` renders. */
const BRANCHES = [
	{ type: 'object', additionalProperties: false, required: ['kind', 'a'], properties: { kind: { const: 'a' }, a: { type: 'string' } } },
	{ type: 'object', additionalProperties: false, required: ['kind', 'b'], properties: { kind: { const: 'b' }, b: { type: 'string' } } },
] as const;

const PLAIN_OBJECT: StructuredSchema = {
	type: 'object', additionalProperties: false, required: ['kind'],
	properties: { kind: { type: 'string', enum: ['a', 'b'] } },
};

/** A root `allOf` sitting beside a root `type: 'object'` to express an if/then
 *  conditional-required. This is the REAL shape of `CLASSIFY_SCHEMA`
 *  (src/workflow/triage/classify.ts) and the reason this row exists: a review
 *  argued such a schema is a legitimate conjunction both vendors accept, and
 *  the probe refuted it — both refuse a root `allOf` even with a root `type`. */
const ALLOF_WITH_ROOT_TYPE: StructuredSchema = {
	type: 'object', additionalProperties: false, required: ['kind'],
	allOf: [{ if: { properties: { kind: { const: 'a' } }, required: ['kind'] }, then: { required: ['a'] } }],
	properties: { kind: { type: 'string', enum: ['a', 'b'] }, a: { type: 'string' } },
};


// ---------------------------------------------------------------------------
// unit — the predicate's whole truth table
// ---------------------------------------------------------------------------

interface Row {
	readonly name:     string;
	readonly schema:   unknown;
	readonly expected: RootUnionKey | undefined;
}

const ROWS: readonly Row[] = [
	// --- positive: all THREE keywords are refused at the top level by BOTH
	// vendors, so all three are reported.
	{ name: 'root oneOf',  schema: { oneOf: [...BRANCHES] }, expected: 'oneOf' },
	{ name: 'root anyOf',  schema: { anyOf: [...BRANCHES] }, expected: 'anyOf' },
	{ name: 'root allOf',  schema: { allOf: [...BRANCHES] }, expected: 'allOf' },

	// --- a root `type` must NOT suppress the report. This is the row that
	// proves the guard did not inherit `normaliseSchemaForAnthropic`'s premise:
	// that helper returned early on `'type' in root`, and the probe showed
	// injecting a root `type` only clears the FIRST vendor error (missing
	// `type`) and reveals the union error underneath.
	{ name: 'root oneOf alongside root type:object', schema: { type: 'object', oneOf: [...BRANCHES] }, expected: 'oneOf' },
	{ name: 'root allOf alongside root type:object (the CLASSIFY_SCHEMA shape)', schema: ALLOF_WITH_ROOT_TYPE, expected: 'allOf' },

	// --- NEGATIVE CONTROL, the most important row. A union BELOW the root is
	// legal on both vendors; reporting it would reject schemas that work today.
	{ name: 'union NESTED under a property', schema: { type: 'object', properties: { outcome: { oneOf: [...BRANCHES] } } }, expected: undefined },
	{ name: 'union nested two levels down',  schema: { type: 'object', properties: { a: { type: 'object', properties: { b: { anyOf: [...BRANCHES] } } } } }, expected: undefined },

	// --- deliberately not claimed
	{ name: 'empty-branch root union',          schema: { anyOf: [] }, expected: undefined },
	{ name: 'root $ref into $defs at a union',  schema: { $ref: '#/$defs/U', $defs: { U: { oneOf: [...BRANCHES] } } }, expected: undefined },
	{ name: 'root union keyword that is not an array', schema: { oneOf: { type: 'object' } }, expected: undefined },

	// --- TOTALITY: a guard that can itself throw is useless as a guard.
	{ name: 'null',      schema: null,      expected: undefined },
	{ name: 'undefined', schema: undefined, expected: undefined },
	{ name: 'number',    schema: 42,        expected: undefined },
	{ name: 'string',    schema: 'str',     expected: undefined },
	{ name: 'array',     schema: [],        expected: undefined },

	// --- a plain object carries no combinator
	{ name: 'plain object', schema: PLAIN_OBJECT, expected: undefined },
];

for (const row of ROWS) {
	test(`rootUnionKey: ${row.name} -> ${String(row.expected)}`, () => {
		assert.equal(rootUnionKey(row.schema as StructuredSchema), row.expected);
	});
}

test('rootUnionKey: the real in-repo DOCGEN_OUTCOME_SCHEMA is a root oneOf', () => {
	// Grounds at least one row in a schema this repo actually wrote rather than
	// only in hand-made fixtures. It is ajv-only and never provider-bound, so
	// nothing regresses from it being reported here.
	assert.equal(rootUnionKey(DOCGEN_OUTCOME_SCHEMA as unknown as StructuredSchema), 'oneOf');
});

test('rootUnionKey: deterministic when a root carries more than one keyword', () => {
	// oneOf is checked first, so the reported key does not depend on key order.
	assert.equal(rootUnionKey({ allOf: [...BRANCHES], oneOf: [...BRANCHES] } as StructuredSchema), 'oneOf');
});

test('rootUnionKey: PURITY — does not mutate its argument', () => {
	// Contrast `processSchemaForOpenAIStrict`, which mutates in place via
	// `processInPlace`. This predicate runs on the caller's own object on every
	// structured call, so a mutation would be a cross-call side effect.
	const schema = { type: 'object', oneOf: [...BRANCHES], properties: { kind: { type: 'string' } } };
	const before = structuredClone(schema);
	rootUnionKey(schema as StructuredSchema);
	assert.deepEqual(schema, before);
});


// ---------------------------------------------------------------------------
// contract — the deletion landed and stays landed
// ---------------------------------------------------------------------------

test('structured-output no longer exports normaliseSchemaForAnthropic', () => {
	// Not a tautology: this goes red if the helper is ever re-added, which is
	// the realistic way a false safety signal returns. The helper claimed to
	// handle the root-union rejection by injecting a root `type: 'object'`; the
	// probe proved that does not satisfy either vendor, so it was removed
	// rather than repaired.
	//
	// There is deliberately NO matching assertion that
	// `notImplementedStructuredOutput` still exists. It is also zero-caller,
	// but it is an intentional stub contract rather than a false claim, and
	// pinning an unused export with a test would be exactly the kind of
	// green-but-meaningless check this Story is cleaning up after.
	assert.equal('normaliseSchemaForAnthropic' in structuredOutput, false);
});


// ---------------------------------------------------------------------------
// integration — the guard on the REAL provider path, both vendors
// ---------------------------------------------------------------------------

/** A path that cannot exist, so `runSubprocess` is guaranteed to fail if it is
 *  ever reached. It must be an ABSOLUTE path and must NOT be the bare name
 *  `claude`/`codex`: `resolveBin` resolves a bare name via `which`, which on a
 *  developer machine finds the REAL installed binary — and the negative
 *  control would then make a billed call. */
const IMPOSSIBLE_BIN = '/nonexistent/insrc-root-union-probe/does-not-exist';

const MESSAGES: readonly LLMMessage[] = [{ role: 'user', content: 'irrelevant — the guard rejects before any model is reached.' }];

function provider(kind: 'claude' | 'codex'): CliProvider {
	return new CliProvider({ kind, binPath: IMPOSSIBLE_BIN, timeoutMs: 5_000 });
}

async function rejectionMessage(kind: 'claude' | 'codex', schema: StructuredSchema): Promise<string> {
	try {
		await provider(kind).completeStructured(MESSAGES, schema);
	} catch (err) {
		return err instanceof Error ? err.message : String(err);
	}
	assert.fail(`completeStructured(${kind}) resolved; it must reject with either the guard or a spawn failure`);
}

for (const kind of ['claude', 'codex'] as const) {
	test(`CliProvider(${kind}).completeStructured rejects a root union locally, naming both vendor flags`, async () => {
		const msg = await rejectionMessage(kind, { oneOf: [...BRANCHES] } as StructuredSchema);

		// The offending keyword, so the caller knows WHICH key to fix.
		assert.match(msg, /oneOf/);
		// BOTH vendor flags, so the reader does not try the other provider.
		assert.match(msg, /--json-schema/);
		assert.match(msg, /--output-schema/);
		// The remedy: wrap the union under one object property.
		assert.match(msg, /type:\s*'object'|properties/);
		// The local-vs-provider asymmetry. The same schema still validates
		// fine through `validateAgainstSchema`; without this the distinction
		// reads as a contradiction.
		//
		// Pins the two SPECIFIC load-bearing words rather than a bare
		// /accept|request/, which the validate gate correctly called weak: that
		// would pass on any unrelated wording containing "accept". These two
		// cannot be satisfied by accident.
		assert.match(msg, /validateAgainstSchema/);
		assert.match(msg, /locally/);
	});
}

// DELIBERATELY ABSENT: a "codex wrote no schema tmpdir" assertion.
//
// The plan called for one, as a second independent signal that the spawn path
// was never entered, comparing the set of `codex-schema-*` entries in tmpdir
// before and after. It was written, and the falsifying mutation proved it
// VACUOUS rather than merely flaky: `completeStructuredOnce` creates the dir
// inside a `try` whose `finally` calls `rmSync(tmpDir, { recursive: true,
// force: true })` unconditionally, so the directory is gone before the test
// could ever observe it. With the guard REMOVED the check still passed, which
// is the definition of an assertion that proves nothing.
//
// Dropped rather than repaired, as the plan itself directed for this case. The
// guard-fires assertions and the negative control below already carry the
// load, and each of those does go red under the mutation.

for (const kind of ['claude', 'codex'] as const) {
	test(`NEGATIVE CONTROL (${kind}): a plain object schema does NOT hit the guard`, async () => {
		// The control that keeps every positive assertion honest. A guard that
		// rejected everything would satisfy all of them and fail only this one.
		// With no guard match the call proceeds to the spawn and fails on the
		// impossible binPath instead — a different error entirely.
		//
		// Run per-kind, like the positive case: an over-rejecting guard could
		// in principle be introduced on one vendor branch only, and a
		// claude-only control would not see it.
		const msg = await rejectionMessage(kind, PLAIN_OBJECT);
		assert.doesNotMatch(msg, /schema ROOT carries/);
		assert.doesNotMatch(msg, /at the top level/i);
	});
}

test('NEGATIVE CONTROL: a schema with only a NESTED union reaches the spawn', async () => {
	// Sharper than the plain-object control: this schema DOES contain a union,
	// just not at the root. It is the shape a tree-walking guard would wrongly
	// reject, so this is the assertion that would catch that specific mistake.
	const nested = { type: 'object', properties: { outcome: { oneOf: [...BRANCHES] } } } as StructuredSchema;
	const msg = await rejectionMessage('claude', nested);
	assert.doesNotMatch(msg, /schema ROOT carries/);
});

test('the guard rejection is NOT retryable', async () => {
	const msg = await rejectionMessage('claude', { allOf: [...BRANCHES] } as StructuredSchema);

	// Assert WHICH message this is before asserting a property of it. Without
	// this first line the test passed under the falsifying mutation — a spawn
	// ENOENT message is also non-transient, so it was quietly confirming a
	// property of the wrong error.
	assert.match(msg, /schema ROOT carries 'allOf'/);

	// DIRECT, and the assertion that survives a refactor. `withTransientRetry`
	// classifies retryability by STRING MATCH on the message, so if someone
	// later moves the guard inside the wrapper, this still proves a
	// deterministic schema defect cannot silently become three billed calls.
	assert.equal(isTransientCliError(msg), false);
});

test('the guard rejection costs no retry backoff', async () => {
	// STRUCTURAL, and deliberately not the only proof — a wall-clock bound is
	// weak on a loaded machine. Three attempts would cost 2s + 4s of backoff,
	// so returning well inside that distinguishes "threw once" from "retried".
	const started = Date.now();
	const msg = await rejectionMessage('codex', { oneOf: [...BRANCHES] } as StructuredSchema);
	const elapsed = Date.now() - started;

	// Same correction as above: pin the message first, or the mutation's fast
	// spawn failure satisfies the timing bound just as well.
	assert.match(msg, /schema ROOT carries 'oneOf'/);
	assert.ok(elapsed < 1500, `expected a single immediate throw, took ${elapsed}ms`);
});
