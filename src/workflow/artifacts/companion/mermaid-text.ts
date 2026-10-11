/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Making authored names safe to put in Mermaid source (LLD-d9f85b3c S001/t5).
 *
 * Definition names are free text: an entity, participant or component may be
 * called anything. Mermaid identifiers accept only word characters, and quoted
 * labels end at a double quote, so names are mapped to stable identifiers and
 * labels are cleaned before they reach the diagram. The page's tables carry the
 * original text, escaped by the shell.
 */

/** Allocates one Mermaid-safe identifier per distinct name, stable for the same
 *  input order. A name that is already safe keeps itself as its identifier. */
export class MermaidIds {
	private readonly byName = new Map<string, string>();
	private readonly taken = new Set<string>();

	constructor(private readonly prefix: string) {}

	id(name: string): string {
		const known = this.byName.get(name);
		if (known !== undefined) return known;
		let base = name.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
		if (base.length === 0 || !/^[A-Za-z]/.test(base)) base = `${this.prefix}${base.length > 0 ? `_${base}` : ''}`;
		let candidate = base;
		for (let n = 2; this.taken.has(candidate); n += 1) candidate = `${base}_${n}`;
		this.byName.set(name, candidate);
		this.taken.add(candidate);
		return candidate;
	}

	/** Whether `name` needed changing to become its identifier. */
	renamed(name: string): boolean {
		return this.id(name) !== name;
	}
}

/** Text for inside a double-quoted Mermaid label: one line, no double quote. */
export function mermaidLabel(text: string): string {
	return text.replace(/[\r\n]+/g, ' ').replace(/"/g, "'").trim();
}

/** A bare Mermaid token (a type name): word characters only, never empty. */
export function mermaidToken(text: string, fallback: string): string {
	const t = text.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
	return t.length > 0 && /^[A-Za-z]/.test(t) ? t : fallback;
}

/** Text that runs to the end of a Mermaid line (a sequence message or note, or
 *  a participant's display name): one line, with the statement separator `;`
 *  and the entity-code marker `#` encoded. */
export function mermaidLineText(text: string): string {
	return text.replace(/[\r\n]+/g, ' ').replace(/[#;]/g, c => (c === '#' ? '#35;' : '#59;')).trim();
}

/** Text for a quoted flowchart node label or an edge label: one line, with no
 *  quote, pipe or markup of its own (flowchart labels are rendered as HTML). */
export function mermaidFlowText(text: string): string {
	return mermaidLabel(text).replace(/[|]/g, '/').replace(/</g, '#lt;').replace(/>/g, '#gt;');
}
