/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc workflow` CLI.
 *
 *   - `insrc workflow list`   — enumerate registered workflows.
 *   - `insrc workflow runs`   — list workflow-runs log entries.
 *   - `insrc workflow derive-slug <focus>` — pure helper for tests.
 *   - `insrc workflow approve|reject <artifact-path>` — set meta.
 *   - `insrc workflow status <epic-hash>` — amendments + LLD staleness.
 *   - `insrc workflow amend <epic-hash>` — CRUD on amendments.
 *   - `insrc workflow chain <epic-hash>` — full lifecycle status + next-action.
 *   - `insrc workflow ack-stale`, `insrc workflow gh-config`, `insrc workflow unlink`.
 *
 * The actual workflow-start path lives behind the `insrc_workflow_step`
 * MCP tool (Claude Code / Codex drive it), not a CLI command.
 *
 * Every Epic-scoped command takes the 16-char Epic hash (see
 * `workflow/hash.ts`). The human-readable slug lives in the Define
 * artifact's meta and shows up in the command output for context.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Command } from 'commander';
import { PATHS } from '../../shared/paths.js';
import {
	ackStaleArtifact,
	approveArtifactByJsonPath,
	jsonPathForMd,
	readBaseHld,
	rejectArtifactByJsonPath,
} from '../../workflow/gates.js';
import {
	approveAmendment,
	listAmendments,
	readAmendment,
	rejectAmendment,
} from '../../workflow/amendments/store.js';
import { scanLldStaleness } from '../../workflow/amendments/staleness.js';
import { deriveSlug } from '../../workflow/slug.js';
import { assertEpicHash } from '../../workflow/hash.js';
import { WORKFLOW_NAMES } from '../../workflow/types.js';
import { resolveGithubConfig } from '../../workflow/config/github.js';
import { buildChainReport, formatChainReport } from '../../workflow/chain.js';
import { defineArtifactPaths, writeAtomic as writeAtomicStorage } from '../../workflow/storage.js';
import { autoPushEpicOnHld, autoPushStoryOnLld, type AutoPushResult } from '../../workflow/tracker-auto.js';

export function registerWorkflowCommands(program: Command): void {
	const wf = program
		.command('workflow')
		.description('workflow framework (define / design / plan / build / test)');

	wf.command('list')
		.description('list registered workflow names')
		.action(() => {
			for (const name of WORKFLOW_NAMES) {
				process.stdout.write(`${name}\n`);
			}
		});

	wf.command('runs')
		.description('list workflow-run log directories under ~/.insrc/workflow-runs/')
		.option('--epic <hash>', 'only show runs for one Epic hash')
		.action((opts: { epic?: string }) => {
			const root = join(PATHS.insrc, 'workflow-runs');
			if (!existsSync(root)) {
				process.stdout.write('no workflow runs yet\n');
				return;
			}
			const keys = opts.epic === undefined
				? readdirSync(root, { withFileTypes: true })
					.filter(d => d.isDirectory())
					.map(d => d.name)
				: [opts.epic];
			for (const key of keys) {
				const dir = join(root, key);
				if (!existsSync(dir)) continue;
				const entries = readdirSync(dir, { withFileTypes: true })
					.filter(d => d.isFile() && d.name.endsWith('.jsonl'));
				process.stdout.write(`## ${key}\n`);
				for (const e of entries) {
					process.stdout.write(`  ${e.name}\n`);
				}
			}
		});

	wf.command('derive-slug <focus...>')
		.description('derive the display slug the framework would use for a focus (helper)')
		.action((parts: string[]) => {
			const focus = parts.join(' ');
			try {
				process.stdout.write(`${deriveSlug(focus)}\n`);
			} catch (err) {
				process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
				process.exit(1);
			}
		});

	wf.command('approve <artifact-path>')
		.description('mark a workflow artifact approved (sets meta.approvedAt). HLD approves auto-create a GitHub Epic issue; LLD approves auto-create Story issues (opt out with --no-tracker).')
		.option('--no-tracker', 'skip the automatic GitHub tracker push on approve')
		.action((artifactPath: string, opts: { tracker: boolean }) => {
			try {
				const jsonPath = jsonPathForMd(artifactPath);
				const r = approveArtifactByJsonPath(jsonPath);
				process.stdout.write(`approved ${r.workflow}: ${r.path} at ${r.approvedAt}\n`);
				if (opts.tracker === false) {
					process.stdout.write(`(tracker push skipped: --no-tracker)\n`);
					return;
				}
				let push: AutoPushResult | undefined;
				if (r.workflow === 'design.epic') {
					push = autoPushEpicOnHld(r.path);
				} else if (r.workflow === 'design.story') {
					push = autoPushStoryOnLld(r.path);
				}
				if (push !== undefined) {
					reportAutoPushResult(push);
				}
			} catch (err) {
				process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
				process.exit(1);
			}
		});

	wf.command('reject <artifact-path>')
		.description('mark a workflow artifact rejected (sets meta.rejectedAt + reason)')
		.requiredOption('--reason <text>', 'why the artifact is being rejected')
		.action((artifactPath: string, opts: { reason: string }) => {
			try {
				const jsonPath = jsonPathForMd(artifactPath);
				const r = rejectArtifactByJsonPath(jsonPath, opts.reason);
				process.stdout.write(`rejected ${r.workflow}: ${r.path} at ${r.rejectedAt}\n`);
			} catch (err) {
				process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
				process.exit(1);
			}
		});

	// ---------------------------------------------------------------
	// Amendments
	// ---------------------------------------------------------------

	wf.command('status <epic-hash>')
		.description('show pending amendments + stale LLDs for an Epic')
		.option('--repo <path>', 'repo path (defaults to cwd)', process.cwd())
		.action((epicHash: string, opts: { repo: string }) => {
			try {
				assertEpicHash(epicHash);
				const repoPath = opts.repo;
				const amendments = listAmendments(repoPath, epicHash);
				const pending = amendments.filter(a => a.status === 'pending');
				const approved = amendments.filter(a => a.status === 'approved');
				const rejected = amendments.filter(a => a.status === 'rejected');
				process.stdout.write(`## Amendments for '${epicHash}'\n`);
				process.stdout.write(`  pending: ${pending.length}   approved: ${approved.length}   rejected: ${rejected.length}\n`);
				for (const a of pending) {
					process.stdout.write(`  - ${a.id}  (${a.amendment.type})  proposedBy=${a.proposedBy.workflow}:${a.proposedBy.storyId ?? '?'}:${a.proposedBy.stepId}\n`);
				}
				process.stdout.write(`\n## LLDs staleness\n`);
				let base;
				try { base = readBaseHld(repoPath, epicHash); }
				catch { process.stdout.write('  (no HLD yet)\n'); return; }
				const entries = scanLldStaleness(repoPath, epicHash, base);
				if (entries.length === 0) { process.stdout.write('  (no LLDs)\n'); return; }
				for (const e of entries) {
					const acked = e.ackedStale !== undefined ? ' [ACKED]' : '';
					if (e.stale) {
						process.stdout.write(`  ${e.storyId}: STALE (${e.staleReason})${acked}\n`);
					} else {
						process.stdout.write(`  ${e.storyId}: up-to-date\n`);
					}
				}
			} catch (err) {
				process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
				process.exit(1);
			}
		});

	const amend = wf.command('amend <epic-hash>')
		.description('list / show / approve / reject HLD amendments for an Epic')
		.option('--repo <path>', 'repo path (defaults to cwd)', process.cwd())
		.option('--list', 'list every amendment for this Epic')
		.option('--show <amendmentId>', 'show one amendment in detail')
		.option('--approve <amendmentId>', 'approve a pending amendment')
		.option('--reject <amendmentId>', 'reject a pending amendment')
		.option('--notes <text>', 'reason (required with --reject)')
		.option('--approved-by <name>', 'approver id / name (defaults to $USER)', process.env['USER'] ?? 'unknown');
	amend.action((epicHash: string, opts: {
		repo: string; list?: boolean; show?: string;
		approve?: string; reject?: string; notes?: string; approvedBy: string;
	}) => {
		try {
			assertEpicHash(epicHash);
			const repoPath = opts.repo;
			if (opts.list === true) {
				const rows = listAmendments(repoPath, epicHash);
				if (rows.length === 0) { process.stdout.write('(no amendments)\n'); return; }
				for (const a of rows) {
					const detail = a.status === 'approved' ? ` approvedAt=${a.approvedAt}` :
						a.status === 'rejected' ? ` rejectedReason='${a.rejectedReason ?? ''}'` : '';
					process.stdout.write(`${a.id}  ${a.status}  ${a.amendment.type}${detail}\n`);
				}
				return;
			}
			if (opts.show !== undefined) {
				const rec = readAmendment(repoPath, opts.show);
				process.stdout.write(JSON.stringify(rec, null, 2) + '\n');
				return;
			}
			if (opts.approve !== undefined) {
				const rec = approveAmendment(repoPath, opts.approve, opts.approvedBy);
				process.stdout.write(`approved ${rec.id} at ${rec.approvedAt}\n`);
				return;
			}
			if (opts.reject !== undefined) {
				const reason = opts.notes;
				if (typeof reason !== 'string' || reason.length === 0) {
					throw new Error(`--reject requires --notes <reason>`);
				}
				const rec = rejectAmendment(repoPath, opts.reject, reason);
				process.stdout.write(`rejected ${rec.id} at ${rec.rejectedAt}\n`);
				return;
			}
			amend.help();
		} catch (err) {
			process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
			process.exit(1);
		}
	});

	wf.command('ack-stale <artifact-path>')
		.description('record a stale-ack override on an LLD (staleAckedAt + reason)')
		.requiredOption('--reason <text>', 'why the staleness is acknowledged')
		.action((artifactPath: string, opts: { reason: string }) => {
			try {
				const jsonPath = jsonPathForMd(artifactPath);
				const r = ackStaleArtifact(jsonPath, opts.reason);
				process.stdout.write(`acked ${r.path} at ${r.ackedAt} — ${r.reason}\n`);
			} catch (err) {
				process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
				process.exit(1);
			}
		});

	// ---------------------------------------------------------------
	// GitHub tracker
	// ---------------------------------------------------------------

	wf.command('gh-config')
		.description('print the resolved GitHub config for the current repo')
		.option('--repo <path>', 'repo path (defaults to cwd)', process.cwd())
		.action((opts: { repo: string }) => {
			try {
				const cfg = resolveGithubConfig(opts.repo);
				process.stdout.write(JSON.stringify(cfg, null, 2) + '\n');
			} catch (err) {
				process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
				process.exit(1);
			}
		});

	wf.command('chain <epic-hash>')
		.description('report the current state of an Epic across the whole workflow chain + suggest the next action')
		.option('--repo <path>', 'repo path (defaults to cwd)', process.cwd())
		.option('--json', 'emit the report as JSON instead of formatted text')
		.action((epicHash: string, opts: { repo: string; json?: boolean }) => {
			try {
				assertEpicHash(epicHash);
				const report = buildChainReport(opts.repo, epicHash);
				if (opts.json === true) {
					process.stdout.write(JSON.stringify(report, null, 2) + '\n');
				} else {
					process.stdout.write(formatChainReport(report));
				}
			} catch (err) {
				process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
				process.exit(1);
			}
		});

	function reportAutoPushResult(r: AutoPushResult): void {
		switch (r.status) {
			case 'created': {
				if (r.epicRef !== undefined) {
					process.stdout.write(`tracker: created Epic ${r.epicRef}\n`);
				}
				if (r.storyRef !== undefined) {
					process.stdout.write(`tracker: created Story ${r.storyRef}\n`);
				}
				if (r.labelsCreated !== undefined && r.labelsCreated.length > 0) {
					process.stdout.write(`tracker: labels ensured: ${r.labelsCreated.join(', ')}\n`);
				}
				return;
			}
			case 'already-exists': {
				const ref = r.epicRef ?? r.storyRef ?? '?';
				process.stdout.write(`tracker: already linked to ${ref}\n`);
				return;
			}
			case 'skipped':
				process.stdout.write(`tracker: skipped (${r.reason})\n`);
				return;
			case 'failed':
				process.stderr.write(`tracker: FAILED (${r.reason})\n`);
				process.stderr.write(`tracker: approve is still committed on disk; push manually via 'insrc workflow' tracker later\n`);
				return;
		}
	}

	wf.command('unlink <epic-hash>')
		.description('clear tracker meta from the local Epic artifact (does NOT touch GitHub)')
		.option('--repo <path>', 'repo path (defaults to cwd)', process.cwd())
		.action((epicHash: string, opts: { repo: string }) => {
			try {
				assertEpicHash(epicHash);
				const paths = defineArtifactPaths(opts.repo, epicHash);
				const raw = readFileSync(paths.json, 'utf8');
				const artifact = JSON.parse(raw) as { meta?: Record<string, unknown> };
				if (artifact.meta === undefined || (artifact.meta as { tracker?: unknown }).tracker === undefined) {
					process.stdout.write('no tracker meta to clear\n');
					return;
				}
				delete (artifact.meta as { tracker?: unknown }).tracker;
				writeAtomicStorage(paths.json, JSON.stringify(artifact, null, 2) + '\n');
				process.stdout.write(`unlinked ${paths.json} (GitHub issues left intact)\n`);
			} catch (err) {
				process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
				process.exit(1);
			}
		});
}
