/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The TUI review command takes its model from the daemon (Epic ce99b72065d03b1b,
 * Story s5): reviewArtifact asks models.resolveRole for role 'review' and builds
 * the provider from that answer alone — never from the user's config.json, a
 * router or a registry in this process.
 *
 * Run: npx tsx --test src/cli/services/__tests__/review-resolve-role.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// HOME holds a config.json naming another local core model and host: the review must not use them.
const HOME = mkdtempSync(join(tmpdir(), 'insrc-review-role-'));
process.env['HOME'] = HOME;
mkdirSync(join(HOME, '.insrc'), { recursive: true });
writeFileSync(join(HOME, '.insrc', 'config.json'), JSON.stringify({ models: { local: { coreModel: 'config-model:9b', host: 'http://config-host:1' }, tiers: { core: { runner: 'cli-claude', model: 'config-claude' } } } }));

// A plan artifact (with its marker) to review; the fake reviewFile never reads it.
const REPO = join(HOME, 'repo');
const MD = join(REPO, 'docs', 'epics', 'x-E202610110123abcd', 'S001', 'PLAN.md');
mkdirSync(join(MD, '..'), { recursive: true });
writeFileSync(MD, '<!-- insrc:artifact PLAN-0123456789abcdef-s1 -->\n\n# Plan\n');

const { reviewArtifact } = await import('../workflow.js');
const { CliProvider } = await import('../../../agent/providers/cli-provider.js');
const { OllamaProvider } = await import('../../../agent/providers/ollama.js');
type ResolvedRole = import('../models.js').ResolvedRole;
type ReviewArtifactOpts = import('../../../workflow/review/index.js').ReviewArtifactOpts;

test.after(() => rmSync(HOME, { recursive: true, force: true }));

/** A reviewFile stand-in that records what it was given. */
function capture(): { seen: ReviewArtifactOpts[]; reviewFile: never } {
	const seen: ReviewArtifactOpts[] = [];
	const reviewFile = (async (opts: ReviewArtifactOpts) => { seen.push(opts); return { report: {}, applied: [], skipped: [], pendingUser: [] }; }) as never;
	return { seen, reviewFile };
}

test('review-resolve-role.test.ts: reviewArtifact builds its provider from a fake models.resolveRole answer and refuses without one', async () => {
	const asked: unknown[] = [];

	// A CLI answer: CliProvider with that kind, model, effort and a chars input budget.
	const cli: ResolvedRole = { tier: 'core', family: 'cli-codex', model: 'fake-x', effort: 'turbo', inputLimit: { unit: 'chars', max: 123456 }, cli: { kind: 'codex' } };
	let c = capture();
	await reviewArtifact(REPO, MD, c.reviewFile, async p => { asked.push(p); return cli; });
	assert.deepEqual(asked, [{ role: 'review', repoPath: REPO }]);
	const p1 = c.seen[0]?.provider;
	assert.ok(p1 instanceof CliProvider, 'a CLI provider');
	assert.equal((p1 as unknown as { kind: string }).kind, 'codex');
	assert.equal(p1.defaultModel, 'fake-x');
	assert.equal(p1.effort, 'turbo');
	assert.equal(p1.inputBudgetChars, 123456);
	assert.equal(c.seen[0]?.model, 'cli-codex:fake-x');
	assert.equal(c.seen[0]?.repo, REPO);

	// A tokens limit is not a chars budget.
	c = capture();
	await reviewArtifact(REPO, MD, c.reviewFile, async () => ({ ...cli, effort: undefined, inputLimit: { unit: 'tokens', max: 64000 } }));
	const p2 = c.seen[0]?.provider as InstanceType<typeof CliProvider>;
	assert.equal(p2.inputBudgetChars, undefined);
	assert.equal(p2.effort, undefined);

	// An Ollama answer: the answer's model, host and numCtx, not config.json's.
	c = capture();
	await reviewArtifact(REPO, MD, c.reviewFile, async () => ({ tier: 'core', family: 'ollama', model: 'fake-local:1', ollama: { host: 'http://daemon-host:11434', numCtx: 32768, numPredict: 4096 } }));
	const p3 = c.seen[0]?.provider;
	assert.ok(p3 instanceof OllamaProvider, 'an Ollama provider');
	assert.equal((p3 as unknown as { model: string }).model, 'fake-local:1');
	assert.equal((p3 as unknown as { client: { config: { host: string } } }).client.config.host, 'http://daemon-host:11434');
	assert.equal(p3.numCtx, 32768);
	assert.equal(c.seen[0]?.model, 'ollama:fake-local:1');

	// No answer: 'cannot review: …', and no review runs.
	c = capture();
	await assert.rejects(reviewArtifact(REPO, MD, c.reviewFile, async () => { throw new Error('daemon is not running — start it with: insrc daemon start'); }), /^Error: cannot review: the daemon is not running$/);
	// Any other rejection (an older daemon without models.resolveRole) keeps its text and names the update.
	await assert.rejects(reviewArtifact(REPO, MD, c.reviewFile, async () => { throw new Error("unknown method 'models.resolveRole'"); }),
		/^Error: cannot review: the daemon could not answer: unknown method 'models.resolveRole' — if it is older than this TUI, update it \(daemon update\)$/);
	await assert.rejects(reviewArtifact(REPO, MD, c.reviewFile, async () => ({ error: "unknown role 'review'", recoverable: false as const })), /cannot review: unknown role 'review'/);
	assert.equal(c.seen.length, 0, 'reviewFile never called');

	// The review path reads no router, tier config or registry in this process.
	const src = readFileSync(new URL('../workflow.ts', import.meta.url), 'utf8');
	assert.doesNotMatch(src, /\b(createRoleRouter|loadAnalyzeConfig|getModelRegistry|shippedModelRegistry|ModelRegistry)\b/);
});

test('review-resolve-role.test.ts: an ollama-claude review role builds a claude provider pointed at Ollama; a refused one is refused', async () => {
	const target = { host: 'http://ollama.example:11434', hosting: 'cloud' as const };
	const hosted: ResolvedRole = { tier: 'core', family: 'ollama-claude', model: 'glm-5.3:cloud', cli: { kind: 'claude', ollama: target } };
	const c = capture();
	await reviewArtifact(REPO, MD, c.reviewFile, async () => hosted);
	const p = c.seen[0]?.provider;
	assert.ok(p instanceof CliProvider);
	assert.deepEqual([(p as unknown as { kind: string }).kind, p.defaultModel, p.ollama], ['claude', 'glm-5.3:cloud', target]);
	// A vendor CLI answer gets no Ollama target.
	const v = capture();
	await reviewArtifact(REPO, MD, v.reviewFile, async () => ({ tier: 'core', family: 'cli-claude', model: 'claude-a', cli: { kind: 'claude' } }));
	assert.equal((v.seen[0]?.provider as InstanceType<typeof CliProvider>).ollama, undefined);
	// Refused: nothing runs.
	const refused: ResolvedRole = { tier: 'core', family: 'ollama-claude', model: 'kimi-k9:cloud', fallback: { reason: 'model-not-supported', requested: 'kimi-k9:cloud' }, cli: { kind: 'claude' } };
	const r = capture();
	await assert.rejects(reviewArtifact(REPO, MD, r.reviewFile, async () => refused), /cannot review: model 'kimi-k9:cloud' is not supported by ollama-claude \(model-not-supported\)/);
	assert.equal(r.seen.length, 0);
});
