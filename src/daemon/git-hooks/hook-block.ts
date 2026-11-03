/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { chmod, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const BLOCK_START = '# >>> insrc git hook (managed; remove with the insrc uninstall) >>>';
export const BLOCK_END = '# <<< insrc git hook <<<';
const SHEBANG = '#!/bin/sh\n';

export type HookWrite = { readonly ok: true; readonly changed: boolean } | { readonly ok: false; readonly reason: string };

const shellQuote = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`;

/** The marked block: runs the hook entry in the background with the repository root and the hook name, and never fails git. */
export function buildBlock(entryPath: string, hookName: string): string {
	return [
		BLOCK_START,
		`node ${shellQuote(entryPath)} "$(git rev-parse --show-toplevel 2>/dev/null)" ${shellQuote(hookName)} >/dev/null 2>&1 &`,
		'exit 0',
		BLOCK_END,
		'',
	].join('\n');
}

/** The span of the block in `text` (start of its first line to just after its last line), or undefined. */
export function findBlock(text: string): { start: number; end: number } | undefined {
	const start = text.indexOf(BLOCK_START);
	if (start === -1) return undefined;
	const endMarker = text.indexOf(BLOCK_END, start);
	if (endMarker === -1) return undefined;
	let end = endMarker + BLOCK_END.length;
	if (text[end] === '\n') end += 1;
	return { start, end };
}

const errorReason = (error: unknown): string => {
	const e = error as NodeJS.ErrnoException;
	return e.code !== undefined ? `${e.code}: ${e.message}` : String(error);
};

async function readIfPresent(file: string): Promise<string | undefined> {
	try { return await readFile(file, 'utf8'); } catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}

/** Write through a temporary file in the same directory and a rename; keep the file's mode, or make a new file executable. */
async function writeAtomic(file: string, text: string, existed: boolean): Promise<void> {
	const kept = existed ? (await stat(file)).mode & 0o777 : 0;
	const mode = (kept & 0o111) !== 0 ? kept : kept | 0o755;
	const temp = join(dirname(file), `.${basename(file)}.insrc-${process.pid}.tmp`);
	try {
		await writeFile(temp, text, { mode });
		await chmod(temp, mode);
		await rename(temp, file);
	} catch (error) {
		await rm(temp, { force: true }).catch(() => undefined);
		throw error;
	}
}

/** Add the block to a hook file of any shape, or replace it in place; the rest of the file is kept byte for byte. */
export async function applyBlock(file: string, entryPath: string, hookName: string): Promise<HookWrite> {
	try {
		const current = await readIfPresent(file);
		const block = buildBlock(entryPath, hookName);
		let next: string;
		if (current === undefined || current === '') next = SHEBANG + block;
		else {
			const span = findBlock(current);
			if (span !== undefined) next = current.slice(0, span.start) + block + current.slice(span.end);
			else next = current + (current.endsWith('\n') ? '' : '\n') + block;
		}
		if (next === current) return { ok: true, changed: false };
		await writeAtomic(file, next, current !== undefined);
		return { ok: true, changed: true };
	} catch (error) { return { ok: false, reason: errorReason(error) }; }
}

/** Remove only the marked block; delete the file when nothing else remains. */
export async function removeBlock(file: string): Promise<HookWrite> {
	try {
		const current = await readIfPresent(file);
		if (current === undefined) return { ok: true, changed: false };
		const span = findBlock(current);
		if (span === undefined) return { ok: true, changed: false };
		const rest = current.slice(0, span.start) + current.slice(span.end);
		if (rest.trim() === '' || rest === SHEBANG || rest.trim() === SHEBANG.trim()) await rm(file);
		else await writeAtomic(file, rest, true);
		return { ok: true, changed: true };
	} catch (error) { return { ok: false, reason: errorReason(error) }; }
}
