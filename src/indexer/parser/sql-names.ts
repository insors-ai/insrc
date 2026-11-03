/**
 * The SQL name rule (ISSUE-0f3376a0, S001): one comparison for SQL table and
 * view names, used by the SQL reader, the cross-file resolver and the store.
 * Pure, with no imports, so the store and resolver use it without loading the
 * grammar.
 *
 * A written name is split into segments at dots outside quotes. A
 * double-quoted segment keeps its exact text; a bare, backticked or bracketed
 * segment is lower-cased (ANSI / PostgreSQL folding). The equality key is the
 * JSON of the folded segment array, so the quoted single segment "a.b"
 * (["a.b"]) never equals the qualified name a.b (["a","b"]).
 *
 * Grammar limits (the installed @derekstride/tree-sitter-sql): no bracketed
 * identifiers, no escaped double quotes ("a""b"), and a backticked name
 * holding a dot. Such names keep the behaviour they had before this rule:
 * the reader writes them unquoted, as it always did.
 */

/** One segment of a written SQL name: its unquoted text, and whether it compares exactly (double-quoted). */
export interface SqlSegment {
	text: string;
	exact: boolean;
}

const CLOSER: Record<string, string> = { '"': '"', '`': '`', '[': ']' };

/**
 * The segments of a written name (`app."Users"`, `` `app`.`users` ``,
 * `db.app.users`). A segment is exact only when it is one whole double-quoted
 * piece. A name that ends inside an open quote is one folded segment, its
 * whole text -- the comparison it had before this rule.
 */
export function sqlSegments(written: string): SqlSegment[] {
	const out: SqlSegment[] = [];
	let text = '';
	let pieces = 0;
	let wholeDoubleQuoted = false;
	const end = (): void => {
		out.push({ text, exact: pieces === 1 && wholeDoubleQuoted });
		text = ''; pieces = 0; wholeDoubleQuoted = false;
	};
	for (let i = 0; i < written.length; i++) {
		const c = written[i]!;
		if (c === '.') { end(); continue; }
		const closer = CLOSER[c];
		if (closer !== undefined) {
			const close = written.indexOf(closer, i + 1);
			if (close < 0) return [{ text: written, exact: false }];
			text += written.slice(i + 1, close);
			pieces++;
			wholeDoubleQuoted = c === '"';
			i = close;
			continue;
		}
		text += c;
		pieces += 2;   // a bare character never makes the segment exact
	}
	end();
	return out;
}

const fold = (s: SqlSegment): string => (s.exact ? s.text : s.text.toLowerCase());

/** The folded segments of a written name: double-quoted exact, the rest lower-cased. */
export const sqlFoldedSegments = (written: string): string[] => sqlSegments(written).map(fold);

/** The collision-free equality key of a written name: the JSON of its folded segments. */
export const sqlNameKey = (written: string): string => JSON.stringify(sqlFoldedSegments(written));

/** The folded last segment of a written name, the key the resolver indexes definitions by. */
export const sqlLastSegmentKey = (written: string): string => {
	const segs = sqlFoldedSegments(written);
	return segs[segs.length - 1] ?? '';
};

/**
 * The comparison used before this rule: the unquoted segments joined by dots,
 * lower-cased. A definition stored before the rule (`"Users"` stored as
 * Users) still meets its references under it.
 */
export const sqlFoldedText = (written: string): string => sqlSegments(written).map(s => s.text).join('.').toLowerCase();

const unwrap = (identifier: string): { open: string; inner: string } | undefined => {
	const open = identifier[0];
	const closer = open === undefined ? undefined : CLOSER[open];
	if (closer === undefined || identifier.length < 2 || !identifier.endsWith(closer)) return undefined;
	return { open: open!, inner: identifier.slice(1, -1) };
};

/**
 * How a definition's stored name writes one identifier the grammar gives. A
 * double-quoted identifier keeps its quotes only when they change its meaning
 * (its text is not all lower-case, or holds a dot, whitespace or a delimiter);
 * every other identifier is written unquoted, as before this rule. So
 * `"users"`, `` `users` `` and users all store users, while `"Users"` and
 * `"a.b"` store their quoted text and get ids of their own.
 */
export function sqlStoredIdentifier(identifier: string): string {
	const u = unwrap(identifier);
	if (u === undefined) return identifier;
	if (u.open === '"' && (u.inner !== u.inner.toLowerCase() || /[.\s"`[\]]/.test(u.inner))) return identifier;
	return u.inner;
}
