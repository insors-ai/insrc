/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Debug service (sc1) — the `debug` facade added to `makeServices`.
 *
 * Story s1 (scaffold): the facade holds only the ordered `sections` metadata
 * registry that drives the Debug pane's inner tab strip. Each later section
 * story (s2-s5) augments the `DebugService` interface with its own read methods
 * (status card, orphan scan/kill, debug-status clients, log tail).
 */

import type { DebugSection } from './debug-types.js';

/** The three Debug-pane sections, in `DebugSectionId` order. Single source of truth. */
export const sections: readonly DebugSection[] = [
	{ id: 'daemon', title: 'Daemon' },
	{ id: 'mcp', title: 'MCP' },
	{ id: 'logs', title: 'Logs' },
];
