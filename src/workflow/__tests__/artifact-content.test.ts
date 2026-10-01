/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S002 (Epic ide-artifact-review-panel-jetbrains-plugin) — daemon tests for
 * handleArtifactContent (t1) + the workflow.artifactContent contract (t2).
 *
 * Over a temp docs/ + .insrc/artifacts fixture (no socket): view assembly
 * (renderedMarkdown byte-equal to the .md; openQuestions from the .json;
 * approvable/blockReason from meta.review) and every failure mapping
 * (path-escape, missing .md, missing/malformed .json, repo/mdPath unresolved),
 * plus the read-only guarantee.
 *
 * Run: npx tsx --test src/workflow/__tests__/artifact-content.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleArtifactContent, type ArtifactReviewView } from '../artifact-content.js';
import { ARTIFACTS_DIR } from '../storage.js';

const HASH = '1703991c69967193';
const ID = `LLD-${HASH}-s1`;
const SEG = 'E20260101abcdef12';
const MD_REL = `docs/epics/demo-${SEG}/S001/LLD.md`;
const MD_BODY = `<!-- insrc:artifact ${ID} -->\n\n# S002 demo\n\nSome **rendered** content.\n`;

interface Fixture { repo: string; mdRel: string }

function makeFixture(opts: {
	md?: string;
	json?: unknown | string | null;   // null => omit the .json
	mdRel?: string;
} = {}): Fixture {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-artcontent-'));
	const mdRel = opts.mdRel ?? MD_REL;
	const mdAbs = join(repo, mdRel);
	mkdirSync(join(mdAbs, '..'), { recursive: true });
	writeFileSync(mdAbs, opts.md ?? MD_BODY);
	if (opts.json !== null) {
		const dir = join(repo, ARTIFACTS_DIR);
		mkdirSync(dir, { recursive: true });
		const content = opts.json === undefined
			? JSON.stringify({ meta: {}, body: { openQuestions: ['First?', 'Second?'] } })
			: (typeof opts.json === 'string' ? opts.json : JSON.stringify(opts.json));
		writeFileSync(join(dir, `${ID}.json`), content);
	}
	return { repo, mdRel };
}

function cleanup(repo: string): void { rmSync(repo, { recursive: true, force: true }); }

function asView(r: ArtifactReviewView | { error: string }): ArtifactReviewView {
	assert.ok(!('error' in r), `expected a view, got error: ${(r as { error?: string }).error}`);
	return r as ArtifactReviewView;
}

test('handleArtifactContent: happy path — renderedMarkdown byte-equal to the .md; kind/artifactId; openQuestions; approvable', () => {
	const { repo, mdRel } = makeFixture();
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		assert.equal(v.renderedMarkdown, MD_BODY);   // verbatim, no transformation (ac3/k5)
		assert.equal(v.kind, 'LLD');
		assert.equal(v.artifactId, ID);
		assert.deepEqual(v.openQuestions.map(q => q.text), ['First?', 'Second?']);
		assert.ok(v.openQuestions.every(q => q.status === 'open'));
		assert.equal(v.approvable, true);
		assert.equal(v.blockReason ?? null, null);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: a standing review block-verdict -> approvable=false + blockReason', () => {
	const review = {
		artifact: ID, stage: 'design.story', verdict: 'block',
		findings: [{ claimId: 'c1', kind: 'semantic', severity: 'HIGH', premise: 'a load-bearing premise', evidence: 'e', action: 'fix it', fixability: 'manual' }],
		counts: { high: 1, med: 0, low: 0 }, reviewedAt: '2026-09-19T00:00:00.000Z', model: 'client',
	};
	const { repo, mdRel } = makeFixture({ json: { meta: { review }, body: {} } });
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		assert.equal(v.approvable, false);
		assert.match(v.blockReason ?? '', /Review blocks approval/);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: openQuestions absent -> empty list (not an error)', () => {
	const { repo, mdRel } = makeFixture({ json: { meta: {}, body: {} } });
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		assert.deepEqual(v.openQuestions, []);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: mdPath escaping docs/ -> { error }, and no read outside docs/', () => {
	const { repo } = makeFixture();
	try {
		for (const bad of ['../../etc/passwd', 'src/daemon/index.ts', '/etc/hosts']) {
			const r = handleArtifactContent({ repo, mdPath: bad }, undefined);
			assert.ok('error' in r, `expected error for ${bad}`);
			assert.match((r as { error: string }).error, /docs\//);
		}
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: missing/unreadable .md -> { error }', () => {
	const { repo } = makeFixture();
	try {
		const r = handleArtifactContent({ repo, mdPath: `docs/epics/demo-${SEG}/S001/NOPE.md` }, undefined);
		assert.ok('error' in r);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: missing sibling .json -> { error }', () => {
	const { repo, mdRel } = makeFixture({ json: null });   // md present (with marker), json absent
	try {
		const r = handleArtifactContent({ repo, mdPath: mdRel }, undefined);
		assert.ok('error' in r);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: malformed sibling .json -> { error }', () => {
	const { repo, mdRel } = makeFixture({ json: '{ not valid json' });
	try {
		const r = handleArtifactContent({ repo, mdPath: mdRel }, undefined);
		assert.ok('error' in r);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: repo unresolved / empty mdPath -> { error } (never a partial view)', () => {
	const noRepo = handleArtifactContent({ mdPath: MD_REL }, undefined);
	assert.ok('error' in noRepo && !('artifactId' in noRepo));

	const { repo } = makeFixture();
	try {
		const noMd = handleArtifactContent({ repo, mdPath: '' }, undefined);
		assert.ok('error' in noMd);
		// env fallback resolves repo
		const viaEnv = handleArtifactContent({ mdPath: MD_REL }, repo);
		assert.ok('artifactId' in viaEnv);
	} finally {
		cleanup(repo);
	}
});

test('handleArtifactContent: a symlink under docs/ escaping the tree -> { error }, target not read', () => {
	const { repo } = makeFixture();
	// A secret file OUTSIDE the repo, and a symlink docs/leak -> that outside dir.
	const outside = mkdtempSync(join(tmpdir(), 'insrc-outside-'));
	writeFileSync(join(outside, 'secret.md'), '<!-- insrc:artifact LLD-deadbeef-s1 -->\nSECRET');
	try {
		symlinkSync(outside, join(repo, 'docs', 'leak'), 'dir');
		// Lexically 'docs/leak/secret.md' looks under docs/, but realpath escapes.
		const r = handleArtifactContent({ repo, mdPath: 'docs/leak/secret.md' }, undefined);
		assert.ok('error' in r, 'a symlink escaping docs/ must be refused');
		assert.ok(!('renderedMarkdown' in r), 'the target must not be read');
	} finally {
		cleanup(repo);
		cleanup(outside);
	}
});

test('handleArtifactContent: read-only — no file created or mutated over the fixture', () => {
	const { repo, mdRel } = makeFixture();
	try {
		const before = readdirSync(join(repo, ARTIFACTS_DIR)).sort();
		handleArtifactContent({ repo, mdPath: mdRel }, undefined);
		const after = readdirSync(join(repo, ARTIFACTS_DIR)).sort();
		assert.deepEqual(after, before);
	} finally {
		cleanup(repo);
	}
});

// ---------------------------------------------------------------------------
// S001/t1 (Epic build-vs-code-plugin-ui-integration, sc1) — the four STRUCTURED
// body records projected onto ArtifactReviewView. Additive + absent-safe: the
// six pre-existing members are untouched, and `=== undefined` is the single
// absence test (no null, no empty-object default, no validation).
// ---------------------------------------------------------------------------

/** A representative body carrying all four structured records. */
const FD = { commitments: [{ id: 'fr1', statement: 'the pane renders a document as structured' }] };
const ER = { entities: [{ name: 'Artifact', fields: [{ name: 'id', type: 'string' }] }] };
const UX = { type: 'AdaptiveCard', version: '1.5', body: [{ type: 'TextBlock', text: 'mock' }] };
const CO = [{ kind: 'ux-mock', relPath: 'docs/epics/demo/S001/ux-mock.html', title: 'UX mock' }];

test('t1: handleArtifactContent projects all four structured records verbatim from an HLD body carrying them', () => {
	const { repo, mdRel } = makeFixture({
		json: { meta: {}, body: { functionalDefinition: FD, erDefinition: ER, uxDefinition: UX, companions: CO } },
	});
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		// Verbatim: deep-equal to what the body stored, not a reshaped projection.
		assert.deepEqual(v.functionalDefinition, FD);
		assert.deepEqual(v.erDefinition, ER);
		assert.deepEqual(v.uxDefinition, UX);
		assert.deepEqual(v.companions, CO);
	} finally {
		cleanup(repo);
	}
});

test('t1: an absent body field projects as ABSENT — not null, not an empty object', () => {
	const { repo, mdRel } = makeFixture({ json: { meta: {}, body: {} } });
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		for (const k of ['functionalDefinition', 'erDefinition', 'sequenceDefinition', 'uxDefinition', 'companions'] as const) {
			// `=== undefined` is the single absence test, so the KEY must be absent:
			// a key present with an undefined/null/{} value would defeat it.
			assert.equal(k in v, false, `${k} must be an absent key, not a present-but-empty one`);
			assert.equal(v[k], undefined);
		}
	} finally {
		cleanup(repo);
	}
});

test('t1: a DEF body projects functionalDefinition only and never companions', () => {
	const { repo, mdRel } = makeFixture({ json: { meta: {}, body: { functionalDefinition: FD } } });
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		assert.deepEqual(v.functionalDefinition, FD);
		assert.equal('companions' in v, false, 'nothing is backfilled for a record the body does not carry');
		assert.equal('erDefinition' in v, false);
		assert.equal('sequenceDefinition' in v, false);
		assert.equal('uxDefinition' in v, false);
	} finally {
		cleanup(repo);
	}
});

test('t1: a PLAN body\'s functionalDefinition projects too — the field is not gated on kind', () => {
	const planId = `PLAN-${HASH}-s1`;
	const mdRel = `docs/epics/demo-${SEG}/S001/PLAN.md`;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-artcontent-plan-'));
	try {
		const mdAbs = join(repo, mdRel);
		mkdirSync(join(mdAbs, '..'), { recursive: true });
		writeFileSync(mdAbs, `<!-- insrc:artifact ${planId} -->\n\n# plan\n`);
		const dir = join(repo, ARTIFACTS_DIR);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${planId}.json`), JSON.stringify({ meta: {}, body: { functionalDefinition: FD } }));

		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		assert.equal(v.kind, 'PLAN');
		assert.deepEqual(v.functionalDefinition, FD, 'a PLAN projects functionalDefinition like any other kind');
	} finally {
		cleanup(repo);
	}
});

test('t1: the six pre-existing ArtifactReviewView members keep their names, types and meanings', () => {
	const { repo, mdRel } = makeFixture({
		json: { meta: {}, body: { openQuestions: ['First?'], erDefinition: ER } },
	});
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		// Widening the view must not disturb any original member.
		assert.equal(typeof v.artifactId, 'string');
		assert.equal(v.artifactId, ID);
		assert.equal(typeof v.kind, 'string');
		assert.equal(v.kind, 'LLD');
		assert.equal(v.renderedMarkdown, MD_BODY);          // still byte-verbatim
		assert.deepEqual(v.openQuestions.map(q => q.text), ['First?']);
		assert.equal(typeof v.approvable, 'boolean');
		assert.equal(v.approvable, true);
		assert.equal(v.blockReason ?? null, null);
	} finally {
		cleanup(repo);
	}
});

test('t1: source-scan — the daemon handler map registers no new method; workflow.artifactContent is the single read path', () => {
	const src = readFileSync(join(import.meta.dirname, '..', '..', 'daemon', 'index.ts'), 'utf8');
	const regs = src.match(/'workflow\.artifactContent':/g) ?? [];
	assert.equal(regs.length, 1, 'exactly one workflow.artifactContent registration — the widening adds no IPC method');
	for (const invented of ['workflow.artifactStructured', 'workflow.artifactCompanions', 'workflow.artifactDefinitions']) {
		assert.equal(src.includes(`'${invented}'`), false, `no new read method (${invented}) may be introduced`);
	}
});

test('t1: a malformed structured record travels through rather than failing the read', () => {
	// Shape-invalid on every record: wrong types, unknown members, a scalar where
	// an object belongs. The read must still succeed — a malformed record cannot
	// refuse to open a document (the surface degrades, it does not go blank).
	const junk = {
		functionalDefinition: { commitments: 'not-an-array', unexpected: 1 },
		erDefinition:         42,
		uxDefinition:         { type: 'NotACard' },
		companions:           [{ relPath: 7 }, 'not-an-object'],
	};
	const { repo, mdRel } = makeFixture({ json: { meta: {}, body: junk } });
	try {
		const r = handleArtifactContent({ repo, mdPath: mdRel }, undefined);
		assert.ok(!('error' in r), 'a malformed structured record must not fail the read');
		const v = asView(r);
		assert.equal(v.renderedMarkdown, MD_BODY, 'the body still reads verbatim');
		// Verbatim pass-through: no validation, no coercion, no stripping.
		assert.deepEqual(v.functionalDefinition as unknown, junk.functionalDefinition);
		assert.deepEqual(v.erDefinition as unknown, junk.erDefinition);
		assert.deepEqual(v.uxDefinition as unknown, junk.uxDefinition);
		assert.deepEqual(v.companions as unknown, junk.companions);
	} finally {
		cleanup(repo);
	}
});

// ---------------------------------------------------------------------------
// S003/t1 (Epic build-vs-code-plugin-ui-integration, AMD-bfe98ff7f97178cf-1) —
// `sequenceDefinition` joins sc1's projection as a FIFTH structured record.
//
// WHY the field exists: three daemon renderers all stamp kind:'diagram-mermaid'
// (companion/render.ts:104 ER, :205 sequence, :243 component), so a companion
// ref cannot identify which record drew it. Projecting only `erDefinition` left
// the MAJORITY of real diagram documents undrawable by a review surface.
//
// The amendment is additive on exactly the terms the existing four use, so the
// tests below assert the same three properties the S001 suite does — verbatim
// projection, absent-key absence, and no change to any existing member — with
// the verbatim case driven by a REAL ledger record rather than a hand-invented
// one, because a fixture that happens to round-trip proves less than the actual
// shape a producer emits.
// ---------------------------------------------------------------------------

/** The real sequence record this Epic's own S002 LLD carries: the counterexample
 *  that motivated the amendment (a 'Sequence diagram' companion ref whose source
 *  record sc1 did not project). Read from the committed ledger so the shape under
 *  test is a producer's, not a test author's. */
function realLedgerSequenceDefinition(): unknown {
	const ledger = join(process.cwd(), ARTIFACTS_DIR, 'LLD-bfe98ff7f97178cf-s2.json');
	const raw = readFileSync(ledger, 'utf8');       // throws loudly if the ledger entry is gone
	const body = (JSON.parse(raw) as { body?: Record<string, unknown> }).body ?? {};
	const sq = body['sequenceDefinition'];
	assert.ok(sq !== undefined && typeof sq === 'object',
		'the committed S002 LLD must still carry a sequenceDefinition — it is the real record this projection was added for');
	return sq;
}

test('t1: structuredRecords projects sequenceDefinition VERBATIM from the REAL S002 ledger body', () => {
	const SQ = realLedgerSequenceDefinition();
	const { repo, mdRel } = makeFixture({ json: { meta: {}, body: { sequenceDefinition: SQ } } });
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		// Deep-equal to what the body stored, not merely present and not reshaped:
		// the projection is a pass-through, and a producer's real record is the
		// only input that can prove it did not quietly normalize anything.
		assert.deepEqual(v.sequenceDefinition as unknown, SQ);
		// And it really is the non-trivial shape — a record with participants and
		// ordered messages, so a round-trip of `{}` could not have passed this.
		const sq = v.sequenceDefinition as unknown as { participants?: unknown[]; messages?: unknown[] };
		assert.ok(Array.isArray(sq.participants) && sq.participants.length > 0, 'real record carries participants');
		assert.ok(Array.isArray(sq.messages) && sq.messages.length > 0, 'real record carries ordered messages');
	} finally {
		cleanup(repo);
	}
});

test('t1: a body WITHOUT sequenceDefinition yields no such key — never null, never {}', () => {
	// The dominant case: only 3 artifact bodies in the whole ledger carry one.
	const { repo, mdRel } = makeFixture({ json: { meta: {}, body: { openQuestions: ['First?'] } } });
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		// `'k' in v === false` is the assertion that matters: a key present with an
		// undefined value would type-check yet defeat `=== undefined` as the single
		// absence test under exactOptionalPropertyTypes.
		assert.equal('sequenceDefinition' in v, false, 'sequenceDefinition must be an ABSENT KEY');
		assert.equal(v.sequenceDefinition, undefined);
	} finally {
		cleanup(repo);
	}
});

test('t1: adding sequenceDefinition left every pre-existing projected record unchanged', () => {
	// k7 (unchanged existing consumers) + the insrc-ide fork, which MIRRORS this
	// IPC payload shape: the addition is safe across repos only because nothing
	// existing moved. Asserted by projecting a body carrying all five and checking
	// the original four still come back exactly as the S001 suite expects.
	const SQ = realLedgerSequenceDefinition();
	const { repo, mdRel } = makeFixture({
		json: { meta: {}, body: { functionalDefinition: FD, erDefinition: ER, sequenceDefinition: SQ, uxDefinition: UX, companions: CO } },
	});
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		assert.deepEqual(v.functionalDefinition, FD);
		assert.deepEqual(v.erDefinition, ER);
		assert.deepEqual(v.uxDefinition, UX);
		assert.deepEqual(v.companions, CO);
		assert.deepEqual(v.sequenceDefinition as unknown, SQ);
		// The six pre-sc1 members are also untouched by the addition.
		assert.equal(typeof v.artifactId, 'string');
		assert.equal(typeof v.kind, 'string');
		assert.equal(typeof v.renderedMarkdown, 'string');
		assert.ok(Array.isArray(v.openQuestions));
		assert.equal(typeof v.approvable, 'boolean');
	} finally {
		cleanup(repo);
	}
});

test('t1: a malformed sequenceDefinition travels through as written — the read path validates nothing', () => {
	// validateErDefinition and its peers run at ASSEMBLY, inside the generating
	// workflow; the read path is a pass-through. S003's client renderer therefore
	// has to shape-check before it draws, which is why this is pinned here.
	const junk = { participants: 'not-an-array', messages: 42 };
	const { repo, mdRel } = makeFixture({ json: { meta: {}, body: { sequenceDefinition: junk } } });
	try {
		const v = asView(handleArtifactContent({ repo, mdPath: mdRel }, undefined));
		assert.deepEqual(v.sequenceDefinition as unknown, junk, 'no validation, no defaulting, no coercion');
	} finally {
		cleanup(repo);
	}
});
