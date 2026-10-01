/**
 * Epic build-vs-code-plugin-ui-integration, Story S001 / t4 — the ONE markdown
 * element stylesheet, shared by every surface that renders `marked` output.
 *
 * These rules were authored for the chat surface (previously inline in
 * chat-panel.ts) and are extracted here because the docs-review surface now
 * renders markdown too. Extracted rather than copied: a second copy would
 * diverge, and the chat suite already pins this rule set.
 *
 * PARAMETERIZED OVER TOKENS rather than copied verbatim, because the two
 * surfaces do not share a variable namespace. chat-panel defines a `--sans` /
 * `--fg-strong` / `--border` palette in a `:root` block; the docs-review shell's
 * only stylesheet is `renderTerminalStyle`, which defines `--it-font` / `--it-fg`
 * / `--it-border` scoped under `.insrc-term`. A literal copy would reference
 * undefined variables on whichever surface it did not come from, and an
 * undefined `var()` in a shorthand makes the whole declaration invalid — table
 * borders and heading colours would silently disappear. Each surface therefore
 * supplies its own token values and gets the same rules.
 *
 * The GEOMETRY (margins, padding, border widths, list indents) is deliberately
 * NOT parameterized: that is the part which must not drift between surfaces.
 */

/** The palette one surface supplies to the shared markdown rules. Each value is
 *  a CSS value — typically a `var(--x)` reference into that surface's own sheet. */
export interface MarkdownStyleTokens {
	/** Body + heading font. */
	readonly fontSans:  string;
	/** Code font (inline + fenced). */
	readonly fontMono:  string;
	/** Body text. */
	readonly fg:        string;
	/** Emphasis (strong / em) and table-header text. */
	readonly fgStrong:  string;
	/** Heading text. */
	readonly heading:   string;
	/** Table cell + code + rule borders. */
	readonly border:    string;
	/** Blockquote edge (a lit border, where the surface distinguishes one). */
	readonly borderLit: string;
	/** Table-header background. */
	readonly bgInset:   string;
	/** Blockquote text. */
	readonly muted:     string;
	/** Links + inline code text. */
	readonly accent:    string;
	/** Code block + inline-code background. */
	readonly codeBg:    string;
	/**
	 * Per-level heading sizes, h1 through h6. OMIT for one uniform size (the chat
	 * surface's behaviour — its messages are short, so hierarchy is noise). A
	 * long document needs real hierarchy, so the docs-review surface supplies a
	 * scale.
	 */
	readonly headingSizes?: readonly [string, string, string, string, string, string] | undefined;
}

/**
 * Emit the markdown element rules, scoped under `.insrc-md`, for one surface.
 *
 * Callers must apply `class="insrc-md"` to the container the parsed HTML is
 * written into. Byte-stable for a given token set, so a surface's generated
 * shell stays deterministic.
 */
export function renderMarkdownStyle(t: MarkdownStyleTokens): string {
	const headings = t.headingSizes === undefined
		// One size for every level, as the chat surface has always done.
		? [`.insrc-md h1,.insrc-md h2,.insrc-md h3,.insrc-md h4,.insrc-md h5,.insrc-md h6{font-family:${t.fontSans};color:${t.heading};font-weight:600;margin:8px 0 6px;font-size:14px;}`]
		// A real scale: shared colour/weight/margins, per-level size only.
		: [
			`.insrc-md h1,.insrc-md h2,.insrc-md h3,.insrc-md h4,.insrc-md h5,.insrc-md h6{font-family:${t.fontSans};color:${t.heading};font-weight:600;margin:8px 0 6px;}`,
			...t.headingSizes.map((size, i) => `.insrc-md h${i + 1}{font-size:${size};}`),
		];

	return [
		// styles target `marked`'s HTML output tags (the .insrc-md container wraps it).
		`.insrc-md{font-family:${t.fontSans};color:${t.fg};font-size:13.5px;line-height:1.6;}`,
		`.insrc-md>*:first-child{margin-top:0;}.insrc-md>*:last-child{margin-bottom:0;}`,
		...headings,
		`.insrc-md p{margin:0 0 8px;}`,
		`.insrc-md ul,.insrc-md ol{margin:0 0 8px;padding-left:20px;}.insrc-md li{margin:2px 0;}.insrc-md li>p{margin:0;}`,
		// GFM tables (were rendering as raw pipes). Wide tables scroll in place.
		`.insrc-md table{border-collapse:collapse;margin:4px 0 8px;font-size:12.5px;display:block;overflow-x:auto;max-width:100%;}`,
		`.insrc-md th,.insrc-md td{border:1px solid ${t.border};padding:4px 9px;text-align:left;vertical-align:top;}`,
		`.insrc-md th{background:${t.bgInset};color:${t.fgStrong};font-weight:600;white-space:nowrap;}`,
		`.insrc-md blockquote{border-left:2px solid ${t.borderLit};margin:4px 0 8px;padding:2px 0 2px 10px;color:${t.muted};}`,
		// inline code = a chip; code inside a fenced block resets that chip styling.
		`.insrc-md code{font-family:${t.fontMono};font-size:12px;background:${t.codeBg};border:1px solid ${t.border};border-radius:4px;padding:1px 5px;color:${t.accent};}`,
		`.insrc-md pre{background:${t.codeBg};border:1px solid ${t.border};border-radius:6px;padding:8px 10px;overflow-x:auto;font-family:${t.fontMono};margin:4px 0 8px;}`,
		`.insrc-md pre code{background:none;border:none;padding:0;color:${t.fg};font-size:12.5px;}`,
		`.insrc-md a{color:${t.accent};text-decoration:underline;}`,
		`.insrc-md hr{border:none;border-top:1px solid ${t.border};margin:8px 0;}`,
		`.insrc-md strong{color:${t.fgStrong};}.insrc-md em{font-style:italic;color:${t.fgStrong};}`,
	].join('');
}

/** The chat surface's palette — its `:root` variables. Reproduces the rules
 *  exactly as they were authored inline, so the generated shell is unchanged. */
export const CHAT_MARKDOWN_TOKENS: MarkdownStyleTokens = {
	fontSans:  'var(--sans)',
	fontMono:  'var(--font)',
	fg:        'var(--fg)',
	fgStrong:  'var(--fg-strong)',
	heading:   'var(--fg-strong)',
	border:    'var(--border)',
	borderLit: 'var(--border-lit)',
	bgInset:   'var(--bg-inset)',
	muted:     'var(--muted)',
	accent:    'var(--accent2)',
	codeBg:    '#0a0d14',
};

/**
 * The docs-review surface's palette, in the `--it-*` namespace
 * `renderTerminalStyle` defines. Headings take the surface ACCENT rather than a
 * strong-foreground token, because the terminal theme exposes a single
 * foreground — without a distinct colour, h1-h6 would differ from body text by
 * weight alone, which is the thin end of "reads as visually distinct".
 */
export const DOCS_REVIEW_MARKDOWN_TOKENS: MarkdownStyleTokens = {
	fontSans:  'var(--it-font)',
	fontMono:  'var(--it-font)',
	fg:        'var(--it-fg)',
	fgStrong:  'var(--it-fg)',
	heading:   'var(--it-accent)',
	border:    'var(--it-border)',
	borderLit: 'var(--it-border)',
	bgInset:   'var(--it-bg)',
	muted:     'var(--it-dim)',
	accent:    'var(--it-accent)',
	codeBg:    'var(--it-bg)',
	// A document is long, so it gets real hierarchy.
	headingSizes: ['20px', '17px', '15px', '14px', '13.5px', '13.5px'],
};
