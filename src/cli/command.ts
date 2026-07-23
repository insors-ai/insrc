/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Command-bar interpreter. Parses a typed line (the vim-style `:`
 * prompt) into an insrc command and runs it against the `Services`
 * facade — the same operations the panes expose via keys, but typed.
 * Pure logic (no ink), so it unit-tests directly with a fake Services.
 */

import type { Services } from './services/index.js';
import type { SteeringSelection } from '../shared/types.js';
import type { TrackerSetupStep } from '../workflow/tracker/setup.js';
import type { ReviewArtifactResult } from '../workflow/review/index.js';
import { formatBytes, formatUptime } from './ui/format.js';
import { CONFIG_CATALOG } from './config-catalog.js';

export interface CommandCtx {
	readonly services: Services;
	readonly repoPath: string;              // selected repo (default for workflow cmds)
	readonly setPane: (index: number) => void;
	readonly onLog:   (line: string) => void;   // streamed progress (restart/update/pull)
	readonly exit:    () => void;
}

const PANES: Record<string, number> = { daemon: 0, repos: 1, workflows: 2, setup: 3 };

export const COMMAND_HELP: readonly string[] = [
	'repo     add <path> | remove <path> | reindex <path> | list',
	'daemon   start | stop | restart | update | backup <dir> | compact | status',
	'workflow run <workflow> <focus> | list | chain <hash> | review <path> | findings <path> | resolve <path> <id> <action> | approve <path> [--override <reason>] | reject <path> <reason> | ack-stale <path> <reason> | sync <hash> | deferred <epicSlug|hash>',
	'tracker  setup [--project]   ·   bootstrap the GitHub tracker (config, labels, issue types, project)',
	'config   list [search] | get <key> | set <key> <value> | unset <key> | reload   (dot-path keys)',
	'setup    show | apply | pull',
	'pane daemon|repos|workflows|setup   ·   help   ·   quit',
];

/** Run one command line; resolves to the output lines to display. */
export async function runCommand(line: string, ctx: CommandCtx): Promise<string[]> {
	const raw = line.trim();
	if (raw.length === 0) return [];
	const tokens = raw.split(/\s+/);
	const cmd = tokens[0] ?? '';
	const sub = tokens[1];
	const rest = tokens.slice(2);
	const svc = ctx.services;

	try {
		switch (cmd) {
			case 'help': case '?': return [...COMMAND_HELP];
			case 'quit': case 'q': case 'exit': ctx.exit(); return ['bye'];
			case 'pane': return switchPane(sub, ctx);
			case 'daemon': case 'd':   return await runDaemon(sub, rest, svc, ctx);
			case 'repo': case 'r':     return await runRepo(sub, rest, svc);
			case 'workflow': case 'wf': return await runWorkflow(sub, rest, svc, ctx);
			case 'tracker': case 'tr': return runTracker(sub, rest, svc, ctx);
			case 'config': case 'cfg': return await runConfig(sub, rest, svc);
			case 'setup':              return await runSetup(sub, svc, ctx);
			default:
				if (PANES[cmd] !== undefined) return switchPane(cmd, ctx);
				return [`unknown command '${cmd}' — type 'help'`];
		}
	} catch (err) {
		return [`✗ ${err instanceof Error ? err.message : String(err)}`];
	}
}

function switchPane(name: string | undefined, ctx: CommandCtx): string[] {
	const p = name !== undefined ? PANES[name] : undefined;
	if (p === undefined) return [`unknown pane '${name ?? ''}' (daemon|repos|workflows|setup)`];
	ctx.setPane(p);
	return [`→ ${name}`];
}

async function runDaemon(sub: string | undefined, rest: readonly string[], svc: Services, ctx: CommandCtx): Promise<string[]> {
	switch (sub) {
		case 'start': {
			const r = await svc.daemon.startDaemon();
			return [r.started ? `daemon running${r.pid !== undefined ? ` (pid ${r.pid})` : ''}` : 'daemon did not become ready within 60 s'];
		}
		case 'stop': await svc.daemon.stopDaemon(); return ['daemon stopped'];
		case 'restart': {
			const r = await svc.daemon.restart(ctx.onLog);
			return [r.ok ? 'daemon restarted' : `✗ restart failed: ${r.error ?? '?'}`];
		}
		case 'update': {
			const r = await svc.daemon.update({}, ctx.onLog);
			return [r.ok ? `update complete (${r.steps.join(', ') || 'no-op'})` : `✗ update failed: ${r.error ?? '?'}`];
		}
		case 'backup': {
			if (rest[0] === undefined) return ['usage: daemon backup <dir>'];
			const r = await svc.daemon.backup(rest[0]);
			return [`backup → ${r.targetDir} (lmdb ${formatBytes(r.lmdbBytes)}, lance ${formatBytes(r.lanceBytes)})`];
		}
		case 'compact': {
			const r = await svc.daemon.compact();
			return [`compacted: saved ${formatBytes(r.savedBytes)} in ${(r.elapsedMs / 1000).toFixed(1)}s`];
		}
		case 'status': {
			const s = await svc.daemon.getStatus();
			return [`running · uptime ${formatUptime(s.uptime)} · queue ${s.queueDepth} · repos ${s.repos.length} · model ${s.modelPullStatus ?? 'ready'}`];
		}
		default: return ['usage: daemon start|stop|restart|update|backup <dir>|compact|status'];
	}
}

async function runRepo(sub: string | undefined, rest: readonly string[], svc: Services): Promise<string[]> {
	switch (sub) {
		case 'add': {
			const path = rest.find(a => !a.startsWith('--'));
			if (path === undefined) {
				return ['usage: repo add <path> [--steering[=claude,agents]]',
				        '  (the command bar is non-interactive — pass --steering to install the block;',
				        '   for the per-file y/N prompt use the Repos pane: press a)'];
			}
			const steering = parseSteeringFlag(rest);
			const registered = await svc.repo.add(path, steering);
			const picks = steering !== undefined
				? [steering.claude === true ? 'CLAUDE.md' : null, steering.agents === true ? 'AGENTS.md' : null].filter(Boolean).join(' + ')
				: '';
			const line = `registered ${registered} — indexing started${picks !== '' ? ` · steering → ${picks}` : ''}`;
			return picks !== ''
				? [line]
				: [line, 'tip: pass --steering[=claude,agents] to install the insrc steering block into CLAUDE.md / AGENTS.md'];
		}
		case 'remove': case 'rm':
			if (rest[0] === undefined) return ['usage: repo remove <path>'];
			return [`removed ${await svc.repo.remove(rest[0])}`];
		case 'reindex':
			if (rest[0] === undefined) return ['usage: repo reindex <path>'];
			return [`reindexing ${await svc.repo.reindex(rest[0])}`];
		case 'list': case 'ls': {
			const rs = await svc.repo.list();
			return rs.length > 0 ? rs.map(r => `${r.status.padEnd(8)} ${r.path}`) : ['(no repos registered)'];
		}
		default: return ['usage: repo add|remove|reindex|list'];
	}
}

/** Parse the `--steering` flag for `repo add`. Absent ⇒ undefined (no write —
 *  the command bar is non-interactive, so steering is explicit-opt-in here).
 *    --steering               → both CLAUDE.md + AGENTS.md
 *    --steering=claude        → CLAUDE.md only
 *    --steering=agents        → AGENTS.md only
 *    --steering=claude,agents → both (or `--steering=both` / `all`) */
function parseSteeringFlag(rest: readonly string[]): SteeringSelection | undefined {
	const flag = rest.find(a => a === '--steering' || a.startsWith('--steering='));
	if (flag === undefined) return undefined;
	if (flag === '--steering') return { claude: true, agents: true };
	const val = flag.slice('--steering='.length).toLowerCase();
	const parts = val.split(',').map(s => s.trim());
	const all = parts.includes('both') || parts.includes('all');
	const sel: SteeringSelection = {
		claude: all || parts.includes('claude'),
		agents: all || parts.includes('agents'),
	};
	return sel.claude === true || sel.agents === true ? sel : undefined;
}

async function runWorkflow(sub: string | undefined, rest: readonly string[], svc: Services, ctx: CommandCtx): Promise<string[]> {
	switch (sub) {
		case 'list': case 'ls': {
			const es = svc.workflow.listEpics(ctx.repoPath);
			return es.length > 0 ? es.map(e => `${e.epicHash}  ${e.epicSlug ?? ''}`) : ['(no epics under this repo)'];
		}
		case 'chain':
			if (rest[0] === undefined) return ['usage: workflow chain <hash>'];
			return svc.workflow.chainText(ctx.repoPath, rest[0]).split('\n');
		case 'run': {
			if (rest[0] === undefined || rest.length < 2) return ['usage: workflow run <workflow> <focus...>'];
			const workflow = rest[0];
			const focus = rest.slice(1).join(' ');
			ctx.onLog(`▸ running ${workflow} — ${focus}`);
			// Streams live ProgressEvent frames into the TUI log; the daemon
			// auto-reviews at finalize so the result carries the review verdict.
			const res = await svc.workflow.runWorkflowStreaming(ctx.repoPath, workflow, focus, {}, ctx.onLog);
			const review = res.verdict !== undefined
				? ` · review ${res.verdict}${res.counts !== undefined ? ` (H${res.counts.high}/M${res.counts.med}/L${res.counts.low})` : ''}`
				: '';
			return [`✓ ${workflow} done · ${res.path}${review}`];
		}
		case 'review': {
			if (rest[0] === undefined) return ['usage: workflow review <path>'];
			const res = await svc.workflow.reviewArtifact(ctx.repoPath, rest[0]);
			return renderReviewSummary(res);
		}
		case 'findings': {
			if (rest[0] === undefined) return ['usage: workflow findings <path>'];
			const r = svc.workflow.reviewFindings(rest[0]);
			if (r.pending.length === 0) return [`review: ${r.verdict} · no findings need your attention`];
			return [
				`review: ${r.verdict} · ${r.pending.length} finding(s) need your attention:`,
				...r.pending.map(f => `  [${f.severity}] ${f.claimId} · ${f.fixability} · ${f.kind} — ${f.premise.slice(0, 80)}`),
				`resolve: workflow resolve <path> <id> apply|accept|override|defer [note]`,
			];
		}
		case 'resolve': {
			const [path, id, action, ...noteParts] = rest;
			const actions = ['apply', 'accept', 'override', 'defer'];
			if (path === undefined || id === undefined || action === undefined || !actions.includes(action)) {
				return ['usage: workflow resolve <path> <findingId> apply|accept|override|defer [note]'];
			}
			const note = noteParts.join(' ');
			const res = svc.workflow.resolveFinding(path, id, action as 'apply' | 'accept' | 'override' | 'defer', note.length > 0 ? note : undefined);
			const tail = res.effectiveVerdict === 'block'
				? ` · still blocked (${res.remainingBlocking} left)`
				: ` · ✓ review clears — ready to approve`;
			return [`resolved ${res.findingId} (${res.status})${res.appliedEdits !== undefined ? ` · applied ${res.appliedEdits} edit(s)` : ''}${tail}`];
		}
		case 'approve': {
			if (rest[0] === undefined) return ['usage: workflow approve <path> [--override <reason>]'];
			// `--override <reason...>` forces approval past a `block` review verdict.
			const ovIdx = rest.indexOf('--override');
			const override = ovIdx >= 0 ? rest.slice(ovIdx + 1).join(' ') : undefined;
			if (ovIdx >= 0 && (override === undefined || override.length === 0)) {
				return ['usage: workflow approve <path> --override <reason>'];
			}
			try {
				const r = svc.workflow.approve(rest[0], true, override);
				return [`approved ${r.approval.workflow}${override !== undefined ? ' (review overridden)' : ''}${r.tracker !== undefined ? ` · tracker ${r.tracker.status}` : ''}`];
			} catch (err) {
				if (err instanceof Error && err.name === 'ReviewBlockedError') {
					return [`✗ blocked by review (${(err as { summary?: string }).summary ?? 'findings'}) — run 'workflow review ${rest[0]}' to fix, or approve --override <reason>`];
				}
				throw err;
			}
		}
		case 'reject': {
			if (rest[0] === undefined || rest.length < 2) return ['usage: workflow reject <path> <reason>'];
			svc.workflow.reject(rest[0], rest.slice(1).join(' '));
			return [`rejected ${rest[0]}`];
		}
		case 'ack-stale': {
			if (rest[0] === undefined || rest.length < 2) return ['usage: workflow ack-stale <path> <reason>'];
			const r = svc.workflow.ackStale(rest[0], rest.slice(1).join(' '));
			return [`acked ${r.path}`];
		}
		case 'sync': {
			if (rest[0] === undefined) return ['usage: workflow sync <epic-hash>'];
			const r = svc.workflow.sync(ctx.repoPath, rest[0]);
			if (r.status === 'synced') return [`synced · epic=${r.epicStatus}`, ...Object.entries(r.storyStatus).map(([s, st]) => `  ${s}: ${st}`)];
			return [`${r.status}: ${r.reason}`];
		}
		case 'deferred': {
			if (rest[0] === undefined) return ['usage: workflow deferred <epicSlug|hash>'];
			const epicHash = svc.workflow.resolveEpicHashArg(ctx.repoPath, rest[0]);
			if (epicHash === undefined) return [`unknown epic '${rest[0]}' (pass a 16-hex hash or a known slug)`];
			const deferred = svc.workflow.deferredQuestions(ctx.repoPath, epicHash);
			if (deferred.length === 0) return ['(no deferred questions for this epic)'];
			return deferred.map(d => {
				const where = d.storyId !== undefined ? `${d.kind}/${d.storyId}` : d.kind;
				return `${where}  \`${d.questionId}\`  ${d.text}`;
			});
		}
		default: return ['usage: workflow run <workflow> <focus>|list|chain <hash>|review <path>|findings <path>|resolve <path> <id> <action>|approve <path> [--override <reason>]|reject <path> <reason>|ack-stale <path> <reason>|sync <hash>|deferred <epicSlug|hash>'];
	}
}

/** Render a review-cycle result as CLI lines: verdict + counts, auto-fixes
 *  applied, and the findings still needing the user gate. */
function renderReviewSummary(res: ReviewArtifactResult): string[] {
	const r = res.report;
	const icon = r.verdict === 'block' ? '✗' : r.verdict === 'warn' ? '▲' : '✓';
	const lines = [`review: ${icon} ${r.verdict.toUpperCase()} · HIGH=${r.counts.high} MED=${r.counts.med} LOW=${r.counts.low}`];
	if (res.applied.length > 0) lines.push(`  auto-fixed ${res.applied.length} finding(s)`);
	if (res.skipped.length > 0) lines.push(`  ${res.skipped.length} auto-fix(es) skipped (target text not present)`);
	if (res.pendingUser.length > 0) {
		lines.push(`  ${res.pendingUser.length} finding(s) need your review:`);
		for (const f of res.pendingUser) {
			lines.push(`    [${f.severity}] ${f.ref ?? '?'} · ${f.fixability} · ${f.kind} — ${f.premise.slice(0, 80)}`);
		}
	}
	if (r.verdict === 'block') lines.push(`  → resolve/override before approve`);
	return lines;
}

function runTracker(sub: string | undefined, rest: readonly string[], svc: Services, ctx: CommandCtx): string[] {
	switch (sub) {
		case 'setup': {
			const includeProject = rest.includes('--project');
			const report = svc.workflow.trackerSetup(ctx.repoPath, { includeProject });
			const lines = report.steps.flatMap(renderTrackerStep);
			lines.push('');
			lines.push(report.manualRemaining === 0
				? '✓ tracker ready — no manual steps remaining'
				: `⚠ ${report.manualRemaining} manual step(s) remaining — complete the ⚠ actions above`);
			return lines;
		}
		default: return ['usage: tracker setup [--project]'];
	}
}

const TRACKER_GLYPH: Record<TrackerSetupStep['status'], string> = {
	done: '✓', already: '•', manual: '⚠', skipped: '·', failed: '✗',
};

/** One setup step → display lines (detail + action may be multi-line). */
function renderTrackerStep(step: TrackerSetupStep): string[] {
	const detailLines = step.detail.split('\n');
	const head = `${TRACKER_GLYPH[step.status]} ${step.title} — ${detailLines[0] ?? ''}`;
	const lines = [head, ...detailLines.slice(1).map(l => `    ${l}`)];
	if (step.action !== undefined) lines.push(`    → ${step.action}`);
	return lines;
}

async function runSetup(sub: string | undefined, svc: Services, ctx: CommandCtx): Promise<string[]> {
	const info = svc.setup.detect();
	const rec = svc.setup.recommend(info);
	switch (sub) {
		case undefined: case 'show':
			return [`tier ${rec.tier} · coder ${rec.coder.model} · embedding ${rec.embedding.model} · context ${rec.context.shape}`];
		case 'apply':
			return [`config written to ${svc.setup.apply(rec)}`];
		case 'pull': {
			const models = svc.setup.modelsToPull(rec);
			if (models.length === 0) return ['all recommended models already installed'];
			const res = await svc.setup.pullModels(models, t => ctx.onLog(`${t.model}: ${t.line}`));
			const failed = res.filter(r => !r.ok);
			return [failed.length === 0 ? 'models pulled' : `✗ pull failed: ${failed.map(f => f.model).join(', ')}`];
		}
		default: return ['usage: setup show|apply|pull'];
	}
}

async function runConfig(sub: string | undefined, rest: readonly string[], svc: Services): Promise<string[]> {
	switch (sub) {
		case undefined: case 'list': case 'ls': case 'show': {
			const cfg = await svc.config.show();
			const set = new Map(flattenEntries(cfg));
			const query = rest[0]?.toLowerCase();
			const seen = new Set<string>();
			const rows: Array<{ path: string; value: unknown; tag: string }> = [];
			for (const opt of CONFIG_CATALOG) {
				seen.add(opt.path);
				const isSet = set.has(opt.path);
				rows.push({ path: opt.path, value: isSet ? set.get(opt.path) : opt.default, tag: isSet ? 'set' : 'default' });
			}
			for (const [p, v] of set) if (!seen.has(p)) rows.push({ path: p, value: v, tag: 'set' });
			const filtered = query === undefined ? rows : rows.filter(r => r.path.toLowerCase().includes(query));
			if (filtered.length === 0) return [`no config options match '${rest[0] ?? ''}'`];
			const width = Math.max(...filtered.map(r => r.path.length));
			return filtered.map(r => `${r.path.padEnd(width)} = ${render(r.value)}   (${r.tag})`);
		}
		case 'get': {
			if (rest[0] === undefined) return ['usage: config get <key>   (dot-path, e.g. models.embeddingDim)'];
			const cfg = await svc.config.show();
			const val = getPath(cfg, rest[0]);
			return [val === undefined ? `${rest[0]} = (unset)` : `${rest[0]} = ${render(val)}`];
		}
		case 'set': {
			if (rest[0] === undefined || rest.length < 2) return ['usage: config set <key> <value>   (value is JSON if parseable, else a string)'];
			const key = rest[0];
			const value = parseValue(rest.slice(1).join(' '));
			await svc.config.write(key, value);
			return [`set ${key} = ${render(value)}`];
		}
		case 'unset': case 'clear': {
			if (rest[0] === undefined) return ['usage: config unset <key>   (clears the key → falls back to default / auto)'];
			await svc.config.write(rest[0], null);
			return [`unset ${rest[0]} (cleared → default/auto)`];
		}
		case 'reload': {
			await svc.config.reload();
			return ['config reloaded'];
		}
		default: return ['usage: config list | get <key> | set <key> <value> | reload'];
	}
}

/** Flatten a nested config object into `[dotPath, leafValue]` entries
 *  (arrays / null count as leaves). */
function flattenEntries(obj: unknown, prefix = ''): Array<[string, unknown]> {
	if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
		return prefix === '' ? [] : [[prefix, obj]];
	}
	const out: Array<[string, unknown]> = [];
	for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
		const path = prefix === '' ? k : `${prefix}.${k}`;
		if (v !== null && typeof v === 'object' && !Array.isArray(v)) out.push(...flattenEntries(v, path));
		else out.push([path, v]);
	}
	return out;
}

/** Navigate a dot-path (`a.b.c`) into a nested object. */
function getPath(obj: unknown, key: string): unknown {
	let cur: unknown = obj;
	for (const part of key.split('.')) {
		if (cur === null || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[part];
	}
	return cur;
}

/** Parse a typed value: JSON when it parses (numbers/bools/objects/
 *  arrays/quoted strings), otherwise the raw string. */
function parseValue(raw: string): unknown {
	try { return JSON.parse(raw); } catch { return raw; }
}

function render(v: unknown): string {
	return typeof v === 'string' ? v : JSON.stringify(v);
}
