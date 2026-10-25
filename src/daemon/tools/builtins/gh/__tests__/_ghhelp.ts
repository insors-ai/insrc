/** Readers of the installed gh's own help: the commands, the flags of a command, the positionals of its USAGE line. */

import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-ghhelp-'));
const ENV = { PATH: process.env['PATH'] ?? '', HOME, GH_CONFIG_DIR: HOME };
const cache = new Map<string, string>();

/** `gh <command> --help` under an empty HOME, so no sign-in and no configuration is read. */
export function helpOf(command: string): string {
	let h = cache.get(command);
	if (h === undefined) {
		const r = spawnSync('gh', [...command.split(' ').filter(Boolean), '--help'], { env: ENV, encoding: 'utf8', timeout: 20_000 });
		h = r.stdout;
		cache.set(command, h);
	}
	return h;
}

function subcommands(command: string): string[] {
	const out: string[] = [];
	let section: string | undefined;
	for (const line of helpOf(command).split('\n')) {
		if (/^[A-Z][A-Z ]+$/.test(line.trim()) && !line.startsWith(' ')) { section = line.trim(); continue; }
		if (section?.endsWith('COMMANDS') === true) {
			const m = /^ {2}([\w-]+):/.exec(line);
			if (m?.[1] !== undefined) { out.push(m[1]); }
		}
	}
	return out;
}

/** Every leaf command of the installed gh, as the words after `gh`. */
export function leafCommands(): string[] {
	const out: string[] = [];
	const walk = (path: string): void => {
		const subs = subcommands(path);
		if (subs.length === 0 && path !== '') { out.push(path); }
		for (const s of subs) { walk(path === '' ? s : `${path} ${s}`); }
	};
	walk('');
	return out;
}

export interface HelpFlag { short?: string; long: string; description: string }

/** The flags of the FLAGS section (not the inherited ones). */
export function flagsOf(command: string): HelpFlag[] {
	const m = /^FLAGS\n([\s\S]*?)(?:\n\n|$)/m.exec(helpOf(command));
	if (m?.[1] === undefined) { return []; }
	const out: HelpFlag[] = [];
	for (const line of m[1].split('\n')) {
		const f = /^\s+(?:(-\w), )?(--[\w-]+)(.*)$/.exec(line);
		const shortOnly = /^\s+(-\w)(\s.*)$/.exec(line);
		if (f?.[2] === undefined && shortOnly?.[1] !== undefined) { out.push({ long: shortOnly[1], description: (shortOnly[2] ?? '').trim() }); }
		else if (f?.[2] !== undefined) { out.push({ ...(f[1] !== undefined ? { short: f[1] } : {}), long: f[2], description: (f[3] ?? '').trim() }); }
	}
	return out;
}

export interface HelpPositional { name: string; optional: boolean }

/** The positionals of the first USAGE line: a `{<a> | <b>}` group is one positional named `a|b`; flags and `--` groups are skipped. */
export function positionalsOf(command: string): HelpPositional[] {
	const m = /^USAGE\n\s+(gh .*)$/m.exec(helpOf(command));
	if (m?.[1] === undefined) { return []; }
	const tokens: string[] = [];
	let depth = 0;
	let cur = '';
	for (const ch of m[1]) {
		if (ch === '[' || ch === '{') { depth += 1; }
		if (ch === ']' || ch === '}') { depth -= 1; }
		if (ch === ' ' && depth === 0) { if (cur) { tokens.push(cur); cur = ''; } } else { cur += ch; }
	}
	if (cur) { tokens.push(cur); }
	const out: HelpPositional[] = [];
	for (const t of tokens.slice(1 + command.split(' ').length)) {
		if (t.startsWith('[--') || t.startsWith('--') || (t.startsWith('[-') && !t.includes('<'))) { continue; }
		const names = [...t.matchAll(/<([\w -]+)>/g)].map(x => (x[1] ?? '').trim());
		if (names.length === 0) {
			if (/^[a-z][\w-]*$/.test(t) && t !== 'flags' && t !== 'flag') { out.push({ name: t, optional: false }); }
			continue;
		}
		out.push({ name: names.length > 1 ? names.join('|') : names[0]!, optional: t.startsWith('[') });
	}
	return out;
}
