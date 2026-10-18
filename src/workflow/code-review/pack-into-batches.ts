/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-aef82b03 — pack indivisible review atoms (symbols, clauses, notes,
 * test-record entries, descriptions) into batches whose built prompt fits the
 * reviewing model's input budget. Every stage of a review job plans its calls
 * with this, so no stage builds an unbounded prompt. Pure: no model call, no I/O.
 */

/** One original item larger than the model's whole input: it cannot be read whole by any call. */
export class AtomTooLargeError extends Error {
	readonly atom:   string;
	readonly size:   number;
	readonly budget: number;

	constructor(atom: string, size: number, budget: number) {
		super(`code review: ${atom} needs a ${size}-character prompt, more than the reviewing model's whole input (${budget} characters); it cannot be read whole by any call, and nothing is cut to fit`);
		this.name = 'AtomTooLargeError';
		this.atom = atom;
		this.size = size;
		this.budget = budget;
	}
}

/**
 * Greedy batches of `items`, in order: every item is in exactly one batch and
 * every batch's prompt (`sizeOf`, the whole built prompt, fixed text included)
 * fits `budget`. An item too large for `budget` but within `hard` (the model's
 * whole input; default `budget`) is a batch of its own: the reserve below `hard`
 * is a preference, never a reason to drop an item. Throws AtomTooLargeError,
 * naming the item with `describe`, when one item's prompt alone exceeds `hard`.
 */
export function packIntoBatches<I>(
	items:    readonly I[],
	sizeOf:   (batch: readonly I[]) => number,
	budget:   number,
	describe: (item: I) => string = item => String(item),
	hard:     number = budget,
): I[][] {
	const batches: I[][] = [];
	let current: I[] = [];
	for (const item of items) {
		if (current.length > 0 && sizeOf([...current, item]) <= budget) {
			current.push(item);
			continue;
		}
		const alone = sizeOf([item]);
		if (alone > Math.max(budget, hard)) throw new AtomTooLargeError(describe(item), alone, Math.max(budget, hard));
		if (current.length > 0) batches.push(current);
		// One over `budget` stays alone: nothing added to it can fit `budget`.
		current = [item];
	}
	if (current.length > 0) batches.push(current);
	return batches;
}
