/**
 * One-off repair of the flat amendment records of a repository (ISSUE-3c0b242fcabf01e9, task t5).
 *
 *   npx tsx docs/standalone/stop-flat-amendment-heads-from-blocking-E202611043c0b242f/S001/repair-flat-amendments.ts <repo> [--apply]
 *
 * Without --apply it works on a copy of <repo>/.insrc in a temporary directory and leaves <repo> untouched; with --apply it
 * writes into <repo>. Either way it prints, for every amendment head, what it was before and what it is after. The comparison
 * is read by a person before --apply is used: this script checks nothing on its own.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { amendmentOfHead } from '../../../../src/workflow/amendments/store.js';
import { History } from '../../../../src/workflow/artifact-core/history.js';
import { createRepoLifecycle } from '../../../../src/workflow/artifact-core/repo-lifecycle.js';
import { createFileSidecarStore } from '../../../../src/workflow/artifact-core/sidecar-store.js';
import type { Actor } from '../../../../src/workflow/artifact-core/types.js';
import { repairFlatAmendments } from '../../../../src/workflow/convert/repair-amendments.js';
import type { ConversionDeps } from '../../../../src/workflow/convert/types.js';

const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
const out = (line: string): void => { process.stdout.write(line + '\n'); };

const source = process.argv[2];
const apply = process.argv.includes('--apply');
if (source === undefined || !existsSync(join(source, '.insrc'))) { out('usage: repair-flat-amendments.ts <repo> [--apply]'); process.exit(2); }

let repo = source;
if (!apply) {
	repo = mkdtempSync(join(tmpdir(), 'repair-amd-'));
	cpSync(join(source, '.insrc'), join(repo, '.insrc'), { recursive: true });
	out(`working on a copy: ${repo}`);
}

type Obj = Record<string, any>;
const dir = join(repo, '.insrc', 'artifacts');
const amendments = (): Record<string, Obj> => Object.fromEntries(readdirSync(dir).filter(n => /^AMD-.*\.json$/.test(n)).map(n => [n.slice(0, -5), JSON.parse(readFileSync(join(dir, n), 'utf8')) as Obj]));
const before = amendments();

const lifecycle = createRepoLifecycle(repo);
const deps = { store: lifecycle.store, history: new History(createFileSidecarStore(repo)), now: () => new Date(), actor: MIGRATION } as unknown as ConversionDeps;
const result = await repairFlatAmendments(repo, deps);
out(`converted: ${JSON.stringify(result.converted)}`);
out(`problems: ${JSON.stringify(result.problems)}`);

const after = amendments();
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
for (const id of Object.keys(after).sort()) {
	const b = before[id]!; const a = after[id]!;
	const flat = b['meta'] === undefined;
	const record = amendmentOfHead(repo, a);
	out(`\n${id}  (${flat ? 'flat' : 'head'} before)`);
	if (!flat) { out(`  already a head; unchanged: ${same(a, b)}`); continue; }
	const row: Record<string, unknown> = {
		'id unchanged': a['body']['id'] === b['id'] && record?.id === id,
		'proposal unchanged': same(a['body']['amendment'], b['amendment']),
		'rationale unchanged': a['body']['rationale'] === b['rationale'],
		'approval time before': b['approvedAt'], 'approval time after': a['meta']['lifecycle']?.approval?.at,
		'approver before': b['approvedBy'], 'approver read by the store': record?.approvedBy,
		'status read by the store': record?.status,
		'lifecycle status': a['meta']['lifecycle']?.status,
		'legacy approvedAt gone': a['meta']['approvedAt'] === undefined,
	};
	for (const [k, v] of Object.entries(row)) out(`  ${k}: ${JSON.stringify(v)}`);
}
