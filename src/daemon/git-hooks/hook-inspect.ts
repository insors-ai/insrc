/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFile } from 'node:fs/promises';
import { findBlock } from './hook-block.js';

export interface HookInspection {
	/** Our marked block is in the file. */
	readonly present: boolean;
	/** The file holds content other than our block (a shebang alone does not count). */
	readonly foreign: boolean;
	/** The last non-empty foreign line is an exit or an exec, so an appended block may never run. */
	readonly earlyExit: boolean;
	/** The entry path recorded in our block, when present. */
	readonly recordedEntry?: string | undefined;
	/** Our block records an entry path other than the current one. */
	readonly stale: boolean;
	/** The file could not be read, and why. */
	readonly unreadable?: string | undefined;
}

const EARLY_EXIT = /^(exit|exec)(\s|$)/;
const RECORDED = /^node '((?:[^']|'\\'')*)'/m;

/** Inspect one hook file against the entry path the daemon would record today. */
export async function inspectHook(file: string, currentEntry: string): Promise<HookInspection> {
	let text: string;
	try { text = await readFile(file, 'utf8'); } catch (error) {
		const e = error as NodeJS.ErrnoException;
		if (e.code === 'ENOENT') return { present: false, foreign: false, earlyExit: false, stale: false };
		return { present: false, foreign: false, earlyExit: false, stale: false, unreadable: `${e.code ?? 'error'}: ${e.message}` };
	}
	const span = findBlock(text);
	const block = span === undefined ? '' : text.slice(span.start, span.end);
	const rest = span === undefined ? text : text.slice(0, span.start) + text.slice(span.end);
	const lines = rest.split('\n').map(line => line.trim()).filter(line => line !== '');
	const foreignLines = lines.filter(line => !line.startsWith('#!'));
	const last = foreignLines[foreignLines.length - 1];
	const recorded = RECORDED.exec(block)?.[1]?.replace(/'\\''/g, "'");
	return {
		present: span !== undefined,
		foreign: foreignLines.length > 0,
		earlyExit: last !== undefined && EARLY_EXIT.test(last),
		recordedEntry: recorded,
		stale: span !== undefined && recorded !== currentEntry,
	};
}
