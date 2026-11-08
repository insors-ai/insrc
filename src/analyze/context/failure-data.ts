/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What an answer-writing failure keeps (LLD-b9d5c5c40df5a574-s3, task t2).
 *
 * Task and run records are written with JSON.stringify, which turns an Error
 * into `{}`. `failureData` builds the JSON-safe value that is kept instead:
 * the typed failure's results, upstream inputs, part failures and handling,
 * or a plain error's name, message and cause chain.
 */

import { parseHandling } from '../completeness.js';
import type { HandlingReport } from '../completeness.js';
import { ShaperAnswerStepFailedError } from './answer-step-error.js';
import type { AnswerStepFailureReason } from './answer-step-error.js';
import type { AnswerStepFound } from './driver.js';

/** An error and what caused it, to a bounded depth, with no Error object in it. */
export interface FailureCause {
	readonly name:    string;
	readonly message: string;
	readonly cause?:  FailureCause | undefined;
}

/** One upstream output an aggregate call was given. */
export interface AggregateInputRecord {
	readonly taskId:   string;
	readonly template: string;
	readonly params:   Readonly<Record<string, unknown>>;
	readonly value:    unknown;
}

/** One part of a divided call that was not covered. */
export interface PartFailure {
	readonly part:   string;
	readonly kind:   'call-failed' | 'invalid-reply' | 'unadmittable';
	readonly reason: string;
	readonly cause?: FailureCause | undefined;
}

export type AggregateFailureData =
	| {
		readonly kind:         'answer-step';
		readonly reason:       AnswerStepFailureReason;
		readonly found:        AnswerStepFound;
		readonly upstream:     readonly AggregateInputRecord[];
		readonly partFailures: readonly PartFailure[];
		readonly handling?:    HandlingReport | undefined;
	}
	| {
		readonly kind:    'error';
		readonly name:    string;
		readonly message: string;
		readonly cause?:  FailureCause | undefined;
	};

/** How many levels of cause a kept failure nests. */
export const MAX_CAUSE_DEPTH = 3;

/**
 * The cause chain of `err` as plain values, at most `depth` levels deep. A
 * value that is not an Error is kept as its string.
 */
export function causeOf(err: unknown, depth = MAX_CAUSE_DEPTH): FailureCause | undefined {
	if (err === undefined || err === null || depth <= 0) return undefined;
	if (!(err instanceof Error)) return { name: 'non-error', message: String(err) };
	const cause = causeOf(err.cause, depth - 1);
	return { name: err.name, message: err.message, ...(cause !== undefined ? { cause } : {}) };
}

/**
 * A copy of `value` that is plain JSON: no Error, function, bigint or cycle survives. Only an object that contains
 * itself is a cycle; an object reached twice by two routes (two records sharing one `params`) is copied twice.
 */
function jsonSafe<T>(value: T): T {
	const ancestors: object[] = [];
	const walk = (v: unknown, converted = false): unknown => {
		if (typeof v === 'bigint') return v.toString();
		if (typeof v === 'function' || typeof v === 'symbol' || v === undefined) return undefined;
		if (v === null || typeof v !== 'object') return v;
		if (ancestors.includes(v)) return '[circular]';
		if (v instanceof Error) return { name: v.name, message: v.message };
		const toJSON = (v as { toJSON?: unknown }).toJSON;
		// toJSON is applied once at a position, as JSON.stringify does; what it returns is walked as it is.
		if (!converted && typeof toJSON === 'function') return walk((toJSON as () => unknown).call(v), true);
		ancestors.push(v);
		try {
			if (Array.isArray(v)) return v.map(item => walk(item) ?? null);
			const out: Record<string, unknown> = {};
			for (const [k, item] of Object.entries(v)) {
				const copy = walk(item);
				// An own data property, so a key like `__proto__` stays a key and never reaches the prototype setter.
				if (copy !== undefined) Object.defineProperty(out, k, { value: copy, enumerable: true, writable: true, configurable: true });
			}
			return out;
		} finally { ancestors.pop(); }
	};
	return walk(value) as T;
}

/** The value kept for an aggregate task's failure. */
export function failureData(err: unknown): AggregateFailureData {
	if (err instanceof ShaperAnswerStepFailedError) {
		const handling = parseHandling(err.found.report.handling);
		return jsonSafe({
			kind:         'answer-step',
			reason:       err.reason,
			found:        err.found,
			upstream:     err.upstream ?? [],
			partFailures: err.partFailures ?? [],
			...(handling !== undefined ? { handling } : {}),
		} as const);
	}
	if (!(err instanceof Error)) return { kind: 'error', name: 'non-error', message: String(err) };
	const cause = causeOf(err.cause);
	return { kind: 'error', name: err.name, message: err.message, ...(cause !== undefined ? { cause } : {}) };
}
