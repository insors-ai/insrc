/**
 * The links and file references a markdown document writes (Epic c2ba6fa6
 * s10). Pure: reads the text only -- no file system, no model.
 *
 * Two kinds of reference are read, outside fenced and indented code blocks:
 *
 *   path  -- the destination of an inline link `[t](dest)` or of a
 *            reference-style definition `[id]: dest`, resolved as Markdown
 *            does: against the document's directory, or the repository root
 *            for a leading '/'. Also a backticked or bare token in running text
 *            that contains a slash, resolved the way this repository's
 *            documents write paths: against the repository root, except a
 *            token starting './' or '../', which is against the directory.
 *   name  -- a backticked or bare token with no slash that is a file name
 *            (`README.md`, `queue.ts`); it names no directory, so it is left to
 *            the indexer to match against the stored files.
 *
 * A reference counts only when its file name is one a parser handles. URLs
 * with a scheme, mailto and pure anchors are not read; an anchor, a query,
 * a `:line` suffix and trailing punctuation are stripped. A path that leaves the
 * repository is not read.
 */

import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export type MarkdownLink =
	| { readonly kind: 'path'; readonly line: number; readonly target: string }   // absolute path
	| { readonly kind: 'name'; readonly line: number; readonly name: string };

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;   // an opening fence; its info string may follow
const INLINE_LINK = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REFERENCE_DEF = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;
const CODE_SPAN = /(`+)([^`]+?)\1/g;
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const TRAILING = /[.,;:!?)\]}'"*_>]+$/;
const LEADING = /^[(\['"*_<]+/;
const LINE_SUFFIX = /:\d+(?:[-:]\d+)*$/;

/**
 * The references `source` writes, in line order (1-based lines). `handles`
 * says whether a parser reads a file of this name (the registry's check).
 */
export function readMarkdownLinks(
	source:   string,
	filePath: string,
	repo:     string,
	handles:  (fileName: string) => boolean,
): MarkdownLink[] {
	const out: MarkdownLink[] = [];
	const dir = dirname(filePath);
	const inside = (abs: string): boolean => {
		const rel = relative(repo, abs);
		return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
	};
	const clean = (raw: string): string => raw.replace(/^<|>$/g, '').split('#')[0]!.split('?')[0]!;

	const addDestination = (raw: string, line: number): void => {
		const dest = clean(raw.trim()).replace(TRAILING, '');
		if (dest === '' || SCHEME.test(dest)) return;
		let decoded: string;
		try { decoded = decodeURIComponent(dest); } catch { decoded = dest; }
		const abs = decoded.startsWith('/') ? join(repo, decoded) : resolve(dir, decoded);
		if (inside(abs) && handles(abs)) out.push({ kind: 'path', line, target: abs });
	};
	const addMention = (raw: string, line: number): void => {
		let token = raw.replace(LEADING, '').replace(TRAILING, '');
		if (token === '' || SCHEME.test(token) || token.startsWith('#') || /\s/.test(token)) return;
		token = token.split('#')[0]!.split('?')[0]!.replace(LINE_SUFFIX, '').replace(TRAILING, '');
		if (token === '') return;
		if (token.includes('/')) {
			const abs = token.startsWith('./') || token.startsWith('../') ? resolve(dir, token) : join(repo, token);
			if (inside(abs) && handles(abs)) out.push({ kind: 'path', line, target: abs });
		} else if (/\.[A-Za-z0-9]+$/.test(token) && handles(token)) {
			out.push({ kind: 'name', line, name: token });
		}
	};

	const lines = source.split('\n');
	let fence: string | undefined;
	let prevBlankOrCode = true;
	for (let i = 0; i < lines.length; i++) {
		const text = lines[i]!;
		const line = i + 1;
		const fenceMatch = FENCE.exec(text);
		if (fence !== undefined) {
			// A closing fence: the same character, at least as long, and nothing after it but spaces (CommonMark).
			const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(text);
			if (close !== null && close[1]![0] === fence[0] && close[1]!.length >= fence.length) fence = undefined;
			continue;
		}
		if (fenceMatch !== null) { fence = fenceMatch[1]; continue; }
		// An indented code block: four spaces or a tab, after a blank line or more indented code.
		if (/^( {4}|\t)/.test(text) && prevBlankOrCode && text.trim() !== '') continue;
		prevBlankOrCode = text.trim() === '';

		const def = REFERENCE_DEF.exec(text);
		if (def !== null) { addDestination(def[1]!, line); continue; }

		let rest = text.replace(INLINE_LINK, (_m, dest: string) => { addDestination(dest, line); return ' '; });
		rest = rest.replace(CODE_SPAN, (_m, _ticks: string, body: string) => { addMention(body.trim(), line); return ' '; });
		// Autolinks and bare URLs are not file references.
		rest = rest.replace(/<[^>\s]+>/g, ' ');
		for (const word of rest.split(/\s+/)) addMention(word, line);
	}
	return out;
}
