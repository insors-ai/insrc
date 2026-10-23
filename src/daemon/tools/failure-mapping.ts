/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Maps a tool failure onto the tracker port's four failure kinds, for the
 * tracker adapters that call registry tools (s7). The port type, its stored
 * results and its tests do not change.
 */

import type { PortFailureKind } from '../../workflow/tracker/port.js';
import type { ToolFailure, ToolFailureKind } from './types.js';

/** Total over ToolFailureKind: adding a kind without a row here fails the build. */
const PORT_KIND: Readonly<Record<ToolFailureKind, PortFailureKind>> = {
	'missing-tool':      'missing-tool',
	'missing-signin':    'missing-signin',
	'unreachable':       'unreachable',
	'timed-out':         'unreachable',   // as github.ts maps a gh timeout today
	'rejected':          'rejected',
	'conversion-failed': 'rejected',
	'schema-mismatch':   'rejected',
	'denied':            'rejected',
};

export function portKindOf(kind: ToolFailureKind): PortFailureKind {
	return PORT_KIND[kind];
}

/** The port's { kind, reason } for a tool failure; the tool's message is the reason. */
export function toPortFailure(failure: ToolFailure): { readonly kind: PortFailureKind; readonly reason: string } {
	return { kind: portKindOf(failure.kind), reason: failure.message };
}
