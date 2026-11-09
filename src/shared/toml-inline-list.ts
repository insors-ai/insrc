/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TOML cannot extend a key assigned an inline list with `[[key]]` tables, so a
 * writer that appends a table must first move any inline list into tables. Vibe
 * saves `mcp_servers = []` for no servers and `mcp_servers = [ { ... }, ]` for
 * short entries, so both occur in real configs (ISSUE-b902426092868097).
 *
 * Text outside the moved assignment is kept byte for byte. Anything this cannot
 * move without loss is refused, and the caller leaves the file alone.
 */

export class TomlInlineListError extends Error {}

const isBlank = (c: string | undefined): boolean => c === ' ' || c === '\t' || c === '\r';

function lineEnd(text: string, from: number): number {
	const at = text.indexOf('\n', from);
	return at === -1 ? text.length : at;
}

/** The index just past the string that opens at `start`. */
function endOfString(text: string, start: number): number {
	const quote = text[start]!;
	const fence = quote.repeat(3);
	const multiLine = text.startsWith(fence, start);
	let i = start + (multiLine ? 3 : 1);
	while (i < text.length) {
		const c = text[i]!;
		if (quote === '"' && c === '\\') { i += 2; continue; }
		if (multiLine && text.startsWith(fence, i)) {
			i += 3;
			// A closing fence may be preceded by up to two more quotes of content.
			for (let extra = 0; extra < 2 && text[i] === quote; extra++) i++;
			return i;
		}
		if (!multiLine && c === '\n') break;
		if (!multiLine && c === quote) return i + 1;
		i++;
	}
	throw new TomlInlineListError('a string is not closed');
}

/** Where the value that starts at `start` ends, for a key this does not move. */
function endOfValue(text: string, start: number): number {
	let depth = 0;
	let i = start;
	while (i < text.length) {
		const c = text[i]!;
		if (c === '"' || c === "'") { i = endOfString(text, i); continue; }
		if (c === '#') { i = lineEnd(text, i); continue; }
		if (c === '\n' && depth === 0) return i;
		if (c === '[' || c === '{') depth++;
		else if (c === ']' || c === '}') depth--;
		i++;
	}
	return text.length;
}

/** Split the list or inline table that opens at `open` at its own commas. */
function splitBracketed(text: string, open: number): { readonly end: number; readonly parts: string[] } {
	const parts: string[] = [];
	let depth = 0;
	let from = open + 1;
	let i = open;
	while (i < text.length) {
		const c = text[i]!;
		if (c === '"' || c === "'") { i = endOfString(text, i); continue; }
		if (c === '#') throw new TomlInlineListError('the list holds a comment that moving it would lose');
		if (c === '[' || c === '{') depth++;
		else if (c === ']' || c === '}') {
			depth--;
			if (depth === 0) {
				parts.push(text.slice(from, i).trim());
				if (parts.at(-1) === '') parts.pop(); // a trailing comma, or nothing at all
				if (parts.includes('')) throw new TomlInlineListError('the list has an empty element');
				return { end: i + 1, parts };
			}
		} else if (c === ',' && depth === 1) {
			parts.push(text.slice(from, i).trim());
			from = i + 1;
		}
		i++;
	}
	throw new TomlInlineListError('the list is not closed');
}

/** The key a line assigns, with its quotes and escapes resolved. */
function keyText(raw: string): string {
	if (raw.startsWith("'")) return raw.slice(1, -1);
	if (!raw.startsWith('"')) return raw;
	try {
		return JSON.parse(raw) as string;
	} catch {
		throw new TomlInlineListError('a quoted key cannot be read');
	}
}

/** Find `key = ...` in the root table, which ends at the first table header. */
function findRootAssignment(text: string, key: string): { readonly keyStart: number; readonly value: number } | undefined {
	let i = 0;
	for (;;) {
		while (i < text.length && (isBlank(text[i]) || text[i] === '\n')) i++;
		if (i >= text.length || text[i] === '[') return undefined;
		if (text[i] === '#') { i = lineEnd(text, i); continue; }
		const keyStart = i;
		while (i < text.length && text[i] !== '=' && text[i] !== '\n') {
			if (text[i] === '"' || text[i] === "'") i = endOfString(text, i);
			else i++;
		}
		if (text[i] !== '=') throw new TomlInlineListError('a line before the first table is not a key and a value');
		const name = keyText(text.slice(keyStart, i).trim());
		i++;
		if (name.startsWith(`${key}.`)) throw new TomlInlineListError(`'${key}' is a table of dotted keys, not a list`);
		if (name === key) {
			while (isBlank(text[i])) i++;
			return { keyStart, value: i };
		}
		i = endOfValue(text, i);
	}
}

function tableFor(key: string, element: string): string {
	if (!element.startsWith('{')) throw new TomlInlineListError('a list element is not an inline table');
	// The writers read tables line by line, so text inside a multi-line value could pass for a key.
	if (element.includes('\n')) throw new TomlInlineListError('a list element spans more than one line');
	const { end, parts } = splitBracketed(element, 0);
	if (end !== element.length) throw new TomlInlineListError('a list element is not an inline table');
	return [`[[${key}]]`, ...parts].join('\n');
}

/**
 * Answer `text` with a root-level inline list at the bare key `key` moved to
 * `[[key]]` tables at the end of the file, or `text` itself when there is none.
 * Throws {@link TomlInlineListError} when the list cannot be moved without loss
 * or `key` has another form that `[[key]]` could not be added to.
 */
export function moveInlineListToTables(text: string, key: string): string {
	for (const header of text.matchAll(/^[ \t]*\[[ \t]*("(?:[^"\\\n]|\\.)*"|'[^'\n]*'|[A-Za-z0-9_-]+)[ \t]*\][ \t]*(?:#.*)?\r?$/gm)) {
		if (keyText(header[1]!) === key) throw new TomlInlineListError(`'${key}' is a single table, not a list`);
	}
	const found = findRootAssignment(text, key);
	if (found === undefined) return text;
	if (text[found.value] !== '[') throw new TomlInlineListError(`'${key}' is not a list`);
	const { end, parts } = splitBracketed(text, found.value);
	const eol = lineEnd(text, end);
	const trailing = text.slice(end, eol).trim();
	if (trailing !== '' && !trailing.startsWith('#')) throw new TomlInlineListError(`unexpected text after the '${key}' list`);
	const tables = parts.map(element => tableFor(key, element));

	const lineStart = text.lastIndexOf('\n', found.keyStart) + 1;
	const rest = text.slice(0, lineStart) + (trailing === '' ? '' : `${trailing}\n`) + text.slice(eol + 1);
	if (tables.length === 0) return rest;
	const base = rest === '' || rest.endsWith('\n') ? rest : `${rest}\n`;
	return `${base}${base === '' ? '' : '\n'}${tables.join('\n\n')}\n`;
}
