#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * insrc-migrate-docs — one-time relocation of the flat docs artifacts into the
 * nested work-item tree (Story S003). DRY-RUN by default; `--apply` executes.
 *
 *   insrc-migrate-docs            # print the plan (moves / link rewrites / metadata rewrites / unmappable), mutate nothing
 *   insrc-migrate-docs --apply    # git mv + link rewrite + metadata realign + validate + per-epic commits
 *
 * Repo root defaults to `$INSRC_REPO` or the current working directory.
 */

import { relative } from 'node:path';

import { applyMigration, planMigration } from '../workflow/migrate-docs-tree.js';

function main(): void {
	const apply   = process.argv.includes('--apply');
	const repoPath = process.env['INSRC_REPO'] ?? process.cwd();

	const plan = planMigration(repoPath);
	const rel = (p: string): string => relative(repoPath, p);

	process.stdout.write(`insrc-migrate-docs: ${plan.moves.length} move(s), ${plan.linkRewrites.length} link rewrite(s), ${plan.metaRewrites.length} metadata rewrite(s), ${plan.unmappable.length} unmappable — repo ${repoPath}\n`);
	for (const m of plan.moves) process.stdout.write(`  move  ${rel(m.from)}  ->  ${rel(m.to)}\n`);
	for (const l of plan.linkRewrites) process.stdout.write(`  link  ${rel(l.file)}: ${l.from} -> ${l.to}\n`);
	for (const r of plan.metaRewrites) {
		const fields = Object.entries(r.set).map(([k, v]) => `${k}=${String(v)}`).join(' ');
		process.stdout.write(`  meta  ${r.artifactId}: ${fields}\n`);
		for (const e of r.mdEdits) process.stdout.write(`        ${rel(e.file)}: '${e.from}' -> '${e.to}'\n`);
		for (const e of r.unmatchedLabelLines) process.stdout.write(`        note  ${rel(e.file)}: label line not found exactly once, left as is: '${e.from}'\n`);
		for (const c of r.companionNotes) process.stdout.write(`        note  ${rel(c)}: companion page still shows the old label until it is regenerated\n`);
	}
	for (const u of plan.unmappable) process.stdout.write(`  UNMAPPABLE  ${u.artifactId}: ${u.reason}\n`);

	if (plan.unmappable.length > 0) {
		process.stderr.write(`\nRefusing: ${plan.unmappable.length} artifact(s) cannot be mapped. Fix the data and re-run.\n`);
		process.exit(1);
	}
	if (!apply) {
		process.stdout.write('\nDry-run only. Re-run with --apply to execute (git mv + commit per epic).\n');
		return;
	}
	applyMigration(repoPath, plan);
	process.stdout.write(`\nApplied: ${plan.moves.length} artifact(s) relocated into the nested tree, ${plan.metaRewrites.length} artifact(s) realigned.\n`);
}

try {
	main();
} catch (err) {
	process.stderr.write(`insrc-migrate-docs: ${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(1);
}
