/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Static bypass audit (S005 — sc6, ac1): after the full-site rollout, NO
 * production reasoning site calls `buildShaperProvider` directly — every analyze
 * site routes through the ambient RoutingSeamContext via `resolveRoleProvider`.
 * The only sanctioned direct callers are the seam plumbing itself. Any new direct
 * caller (a regression re-introducing a bypass) fails this test at CI.
 *
 * Run: npx tsx --test src/analyze/context/__tests__/provider-bypass-audit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('../../../', import.meta.url)); // → src/

/** The ONLY production files allowed to call buildShaperProvider directly:
 *  - shaper-provider.ts:    the factory definition + the resolveRoleProvider seam fallback.
 *  - role-router.ts:        materialize (the sanctioned per-role construction primitive).
 *  - workflow-rpc.ts:       prepareWorkflowRun's driver-role scalar (S003 back-compat).
 *  - code-review-rpc.ts:    daemon code-review RPC entry point — resolves the review
 *                           provider with CLI opts (repoOverride / clientDefault /
 *                           cliTimeoutMs), analogous to workflow-rpc.ts. Not an ambient
 *                           analyze site; it builds the top-of-request provider directly.
 *  - narrative-generator.ts: docgen's cached top-of-run provider (Ollama-local default,
 *                           or claude/codex CLI) — a docgen entry point, not an analyze
 *                           reasoning site inside a RoutingSeamContext.
 *
 *  NOTE: the stricter alternative is to route these through the sc6 seam so they pick up
 *  per-role tiering + attribution (code-review would establish a RoutingSeamContext around
 *  its drive like workflow-rpc, and pass a `review`-role provider). That is a behaviour
 *  change tracked separately; for now they are sanctioned entry-point direct callers. */
const ALLOWLIST = new Set([
	'analyze/context/shaper-provider.ts',
	'analyze/context/role-router.ts',
	'daemon/workflow-rpc.ts',
	'daemon/code-review-rpc.ts',
	'docgen/extract/narrative-generator.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (name === '__tests__' || name === 'node_modules') continue;
		if (statSync(p).isDirectory()) walk(p, out);
		else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
	}
	return out;
}

/** True if a line is a real code invocation of buildShaperProvider (not a comment,
 *  not the `export function` definition). */
function isRealCall(line: string): boolean {
	const t = line.trim();
	if (!t.includes('buildShaperProvider(')) return false;
	if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return false;   // comment
	if (t.startsWith('export function buildShaperProvider')) return false;             // the def
	return true;
}

test('no production reasoning site bypasses the RoutingSeamContext — only sanctioned files call buildShaperProvider', () => {
	const offenders: string[] = [];
	for (const file of walk(SRC)) {
		const rel = file.slice(SRC.length);
		if (ALLOWLIST.has(rel)) continue;
		const lines = readFileSync(file, 'utf8').split('\n');
		lines.forEach((line, i) => {
			if (isRealCall(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
		});
	}
	assert.deepEqual(
		offenders, [],
		`Direct buildShaperProvider bypass(es) found — route these through resolveRoleProvider(role, cfg):\n${offenders.join('\n')}`,
	);
});

test('the allowlisted seam files still exist (guards against a stale allowlist)', () => {
	for (const rel of ALLOWLIST) {
		const src = readFileSync(join(SRC, rel), 'utf8');
		assert.ok(src.includes('buildShaperProvider'), `${rel} no longer references buildShaperProvider — update the allowlist`);
	}
});
