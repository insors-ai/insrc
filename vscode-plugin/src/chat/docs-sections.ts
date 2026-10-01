/**
 * Epic build-vs-code-plugin-ui-integration, Story S001 / t3 — sc3, the
 * section-anchor model for a rendered artifact body.
 *
 * `slug` is simultaneously the anchor target the body navigation scrolls to AND
 * the value a `CompanionArtifactRef.ofSectionId` is matched against. ONE
 * identity with two consumers, derived in ONE place, so body navigation (s1) and
 * companion placement (s3/s4) cannot drift apart.
 *
 * The vendored `marked` render runs with `headerIds:false`
 * (render-registry.ts:332), so the renderer emits no heading ids of its own —
 * this module is where heading identity comes from, which is why it exists at
 * all rather than reading slugs back off the DOM.
 *
 * PURE BY CONSTRUCTION: no DOM, no vscode import, no IO. That is what makes it
 * unit-testable headlessly in node:test and importable by s3 and s4. Deliberately
 * INERT in t3 — t4 is the first consumer.
 */

/** One heading in the rendered body. */
export interface SectionAnchor {
	/** The anchor target AND the value an `ofSectionId` resolves against — unique
	 *  within a document, so a chooser entry can never be ambiguous. */
	readonly slug:  string;
	/** The heading's text VERBATIM, so a chooser shows what the document says. */
	readonly title: string;
	/** The ATX depth, 1-6. */
	readonly level: number;
}

/** A document's headings in document order, derived once per opened document. */
export interface SectionIndex {
	readonly anchors: readonly SectionAnchor[];
}

/**
 * Resolve a `CompanionArtifactRef.ofSectionId` to the slug of the matching
 * section in THIS document, or `undefined` when the id names no present section.
 * Published for s3/s4 so companion placement resolves against the same identity
 * the body navigation uses; neither Story re-derives it.
 */
export type SectionResolver = (ofSectionId: string | undefined) => string | undefined;

/** ATX heading: 1-6 `#` then at least one space, captured title. Setext headings
 *  (underlined with === / ---) are deliberately out of scope: the artifact
 *  renderers emit ATX exclusively. */
const ATX = /^(#{1,6})[ \t]+(.*)$/;

/** A fenced-code delimiter — ``` or ~~~, optionally indented, with an info string. */
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Slugify one heading title: lower-case, strip anything that is not a word
 * character, space or hyphen, then collapse runs of whitespace/hyphens to a
 * single hyphen.
 *
 * A title made entirely of punctuation slugifies to the empty string, which
 * would be useless as an anchor target AND would collide with every other such
 * heading — so an empty result falls back to a positional slug. The fallback is
 * positional rather than random precisely so the result stays DETERMINISTIC: the
 * same markdown must always yield the same slugs, or a companion's stored
 * `ofSectionId` would stop resolving across renders.
 */
function slugify(title: string, index: number): string {
	const base = title
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.trim()
		.replace(/[\s-]+/g, '-');
	return base.length > 0 ? base : `section-${index + 1}`;
}

/**
 * Derive the section index for a document body. The single sc3 implementation:
 * the body renderer's slugs and the companion placer's resolution both originate
 * here.
 *
 * - Headings inside FENCED CODE BLOCKS are skipped, so a `#` in a code sample
 *   cannot produce a phantom chooser entry. A fence closes only on a delimiter
 *   of the same character and at least the same length, per CommonMark, so a
 *   ``` inside a ~~~ block does not end it.
 * - Repeated identical titles are disambiguated by an appended ordinal (`-2`,
 *   `-3`, …) and NEITHER entry is dropped, so every heading stays reachable.
 * - Deterministic: a pure function of the input string.
 */
export function deriveSectionIndex(markdown: string): SectionIndex {
	const anchors: SectionAnchor[] = [];
	// slug -> how many times it has been emitted, for ordinal disambiguation.
	const seen = new Map<string, number>();
	// The open fence's delimiter character and run length, or undefined outside a fence.
	let fence: { char: string; len: number } | undefined;

	const lines = markdown.split('\n');
	for (const line of lines) {
		const fenceMatch = FENCE.exec(line);
		if (fenceMatch !== null) {
			const run = fenceMatch[1]!;
			const char = run[0]!;
			if (fence === undefined) {
				// An opening fence; its info string may not contain the fence char.
				fence = { char, len: run.length };
			} else if (char === fence.char && run.length >= fence.len && fenceMatch[2]!.trim() === '') {
				// A closing fence must match the opener's char, be at least as long,
				// and carry no info string.
				fence = undefined;
			}
			continue;
		}
		if (fence !== undefined) continue;   // inside a code block — never a heading

		const m = ATX.exec(line);
		if (m === null) continue;
		const level = m[1]!.length;
		// Trim trailing closing-ATX hashes ('## Title ##') and surrounding space.
		const title = m[2]!.replace(/\s+#+\s*$/, '').trim();
		if (title.length === 0) continue;    // '###' alone names no section

		const base = slugify(title, anchors.length);
		const prior = seen.get(base) ?? 0;
		seen.set(base, prior + 1);
		const slug = prior === 0 ? base : `${base}-${prior + 1}`;
		anchors.push({ slug, title, level });
	}

	return { anchors };
}

/**
 * Build a {@link SectionResolver} over an index. Matches an `ofSectionId`
 * against each anchor's slug, and ALSO against the slug a raw section title
 * would produce, so an `ofSectionId` authored as either form resolves.
 *
 * Returns `undefined` rather than throwing for an unknown id, so a stale
 * companion reference degrades to unanchored instead of crashing the render.
 */
export function createSectionResolver(index: SectionIndex): SectionResolver {
	const bySlug = new Map<string, string>();
	index.anchors.forEach((a, i) => {
		if (!bySlug.has(a.slug)) bySlug.set(a.slug, a.slug);
		// A title-keyed alias, so an ofSectionId carrying the heading text resolves
		// to the SAME slug the body stamped — never a second, parallel identity.
		const titleKey = slugify(a.title, i);
		if (!bySlug.has(titleKey)) bySlug.set(titleKey, a.slug);
	});
	return (ofSectionId: string | undefined): string | undefined => {
		if (ofSectionId === undefined || ofSectionId.length === 0) return undefined;
		return bySlug.get(ofSectionId) ?? bySlug.get(slugify(ofSectionId, 0));
	};
}
