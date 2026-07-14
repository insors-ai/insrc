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
	'workflow list | chain <hash> | approve <path> | reject <path> <reason> | ack-stale <path> <reason>',
	'config   list [search] | get <key> | set <key> <value> | reload   (dot-path keys; list shows all known + set options)',
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
			case 'workflow': case 'wf': return runWorkflow(sub, rest, svc, ctx);
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
		case 'add':
			if (rest[0] === undefined) return ['usage: repo add <path>'];
			return [`registered ${await svc.repo.add(rest[0])} — indexing started`];
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

function runWorkflow(sub: string | undefined, rest: readonly string[], svc: Services, ctx: CommandCtx): string[] {
	switch (sub) {
		case 'list': case 'ls': {
			const es = svc.workflow.listEpics(ctx.repoPath);
			return es.length > 0 ? es.map(e => `${e.epicHash}  ${e.epicSlug ?? ''}`) : ['(no epics under this repo)'];
		}
		case 'chain':
			if (rest[0] === undefined) return ['usage: workflow chain <hash>'];
			return svc.workflow.chainText(ctx.repoPath, rest[0]).split('\n');
		case 'approve': {
			if (rest[0] === undefined) return ['usage: workflow approve <path>'];
			const r = svc.workflow.approve(rest[0]);
			return [`approved ${r.approval.workflow}${r.tracker !== undefined ? ` · tracker ${r.tracker.status}` : ''}`];
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
		default: return ['usage: workflow list|chain <hash>|approve <path>|reject <path> <reason>|ack-stale <path> <reason>'];
	}
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
			for (const [p, v] of set) if (!seen.has(p)) rows.push({ path: p, value: v, tag: 'set,unrecognized' });
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
