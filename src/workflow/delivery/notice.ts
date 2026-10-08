/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Delivery read model — notices (E1 / S001, HLD-2ff0dfda sc3).
 *
 * The single constructor and ordering for DeliveryNotice. Attention is fixed per
 * code by NOTICE_ATTENTION; no caller can set it, so every pass reports the same
 * notice the same way and "Needs attention" is decided in one place.
 */

import type { DeliveryNotice, NoticeCode } from './types.js';

/** Whether a notice alone makes an item need attention. Exhaustive over NoticeCode. */
export const NOTICE_ATTENTION: Readonly<Record<NoticeCode, boolean>> = {
	'record-unreadable':       true,
	'identity-ambiguous':      true,
	'unresolved-parent':       true,
	'validation-conflict':     true,
	'identity-anchor-missing': false,
	'unattached-spec':         false,
	'unknown-route':           false,
	'review-without-build':    false,
	'unplanned-task':          false,
	'incomplete-evidence':     false,
	'review-currency-unknown': false,
	'base-predates-extension': false,
};

export interface NoticeRefs {
	readonly itemIds?:     readonly string[] | undefined;
	readonly artifactIds?: readonly string[] | undefined;
	readonly fileNames?:   readonly string[] | undefined;
}

/** Sorted copy with duplicates removed. */
function sortedUnique(values: readonly string[] | undefined): readonly string[] {
	return [...new Set(values ?? [])].sort();
}

/** Build a notice. Id lists are sorted and de-duplicated; attention comes from the table. */
export function makeNotice(code: NoticeCode, message: string, refs: NoticeRefs): DeliveryNotice {
	return {
		code,
		message,
		itemIds:     sortedUnique(refs.itemIds),
		artifactIds: sortedUnique(refs.artifactIds),
		fileNames:   sortedUnique(refs.fileNames),
		attention:   NOTICE_ATTENTION[code],
	};
}

function compareLists(a: readonly string[], b: readonly string[]): number {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) {
		const c = (a[i] as string).localeCompare(b[i] as string);
		if (c !== 0) return c;
	}
	return a.length - b.length;
}

function compareNotices(a: DeliveryNotice, b: DeliveryNotice): number {
	return a.code.localeCompare(b.code)
		|| compareLists(a.artifactIds, b.artifactIds)
		|| compareLists(a.itemIds, b.itemIds)
		|| compareLists(a.fileNames, b.fileNames)
		|| a.message.localeCompare(b.message);
}

/** Total, deterministic order: code, artifactIds, itemIds, fileNames, message. Exact duplicates are dropped. */
export function sortNotices(notices: readonly DeliveryNotice[]): readonly DeliveryNotice[] {
	const sorted = [...notices].sort(compareNotices);
	const out: DeliveryNotice[] = [];
	for (const n of sorted) {
		const prev = out[out.length - 1];
		if (prev !== undefined && compareNotices(prev, n) === 0 && prev.attention === n.attention) continue;
		out.push(n);
	}
	return out;
}
