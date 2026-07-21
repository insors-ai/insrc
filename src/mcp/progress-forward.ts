/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Map daemon `ProgressEvent` frames (sc1) onto MCP `notifications/progress`
 * (sc2 · `McpProgressForwarding`). The MCP tool builds a sink from the caller's
 * `progressToken` and the SDK `sendNotification`, then feeds every `progress` /
 * `delta` frame off the daemon stream through it.
 *
 * Two rules from the s2 contract:
 *   - No `progressToken` → the sink is a NO-OP (ac2: run silently).
 *   - `progress` is a MONOTONIC per-notification counter. The MCP spec requires
 *     `progress` to strictly increase; the sc1 stage `index` and token
 *     `tokensTotal` are NOT jointly monotonic across the interleaved stage/token
 *     streams, so we count notifications instead of reusing either field.
 *
 * The sink is fire-and-forget: a rejected `sendNotification` (dead client) is
 * swallowed — it must never crash the run — and the sink never throws.
 */

import type { ProgressEvent } from '../shared/types.js';

/** The MCP `notifications/progress` shape this sink emits. */
export interface McpProgressNotification {
	readonly method: 'notifications/progress';
	readonly params: {
		readonly progressToken: string | number;
		readonly progress:      number;
		readonly total?:        number;
		readonly message?:      string;
	};
}

/**
 * Build the `ProgressEvent` → `notifications/progress` sink. Returns a no-op
 * when `progressToken` is undefined.
 */
export function mcpProgressSink(
	sendNotification: (n: McpProgressNotification) => Promise<void>,
	progressToken:    string | number | undefined,
): (ev: ProgressEvent) => void {
	if (progressToken === undefined) {
		return () => { /* no token — run silently (ac2) */ };
	}

	let progress = 0;   // monotonic per-notification counter
	return (ev: ProgressEvent): void => {
		progress += 1;
		const message = ev.kind === 'stage'
			? `▸ ${ev.stageLabel}`
			: `+${ev.tokensDelta} tok (${ev.tokensTotal})`;
		// A stage carries a known total only when `total` is non-null; tokens
		// have no total. Omit the field entirely otherwise (exactOptional).
		const total = ev.kind === 'stage' && ev.total !== null ? ev.total : undefined;
		const notif: McpProgressNotification = {
			method: 'notifications/progress',
			params: {
				progressToken,
				progress,
				...(total !== undefined ? { total } : {}),
				message,
			},
		};
		// Fire-and-forget: a dead client must not crash the run.
		void sendNotification(notif).catch(() => { /* swallow */ });
	};
}
