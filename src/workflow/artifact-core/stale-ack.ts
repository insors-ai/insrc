/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Whether an artifact's staleness was acknowledged: the latest 'ack-stale' entry of its change log, with the time it was made and the
 * reason it was given. The acknowledgement is the log entry (the head keeps no copy of it), read synchronously because the
 * staleness scan and the plan gate are.
 */

import { FileSidecarStore } from './sidecar-store.js';
import type { ChangeLogEntry } from './types.js';

export interface StaleAck {
	readonly at:     string;
	readonly reason: string;
}

/** The latest acknowledgement in a log, or undefined. */
export function staleAckOfLog(entries: readonly ChangeLogEntry[]): StaleAck | undefined {
	const entry = [...entries].reverse().find(e => e.operation === 'ack-stale');
	return entry === undefined ? undefined : { at: entry.timestamp, reason: entry.outcome?.summary ?? '' };
}

/** The latest acknowledgement of the artifact `artifactId` in `repoPath`; undefined when there is none or the log cannot be read. */
export function staleAckOf(repoPath: string, artifactId: string): StaleAck | undefined {
	try { return staleAckOfLog(new FileSidecarStore(repoPath).readRecordsSync<ChangeLogEntry>('log', artifactId)); }
	catch { return undefined; }
}
