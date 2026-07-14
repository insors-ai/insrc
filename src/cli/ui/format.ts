/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Small display formatters shared across panes. */

export function formatBytes(bytes: number): string {
	if (bytes === 0)  return '0 B';
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024)    return `${kb.toFixed(1)} KiB`;
	const mb = kb / 1024;
	if (mb < 1024)    return `${mb.toFixed(1)} MiB`;
	return `${(mb / 1024).toFixed(2)} GiB`;
}

export function formatUptime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Relative-ish absolute timestamp for `lastIndexed` etc. */
export function formatWhen(iso?: string): string {
	if (iso === undefined || iso.length === 0) return 'never';
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
