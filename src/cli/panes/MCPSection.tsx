/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP section of the Debug pane (Story s4) — a strictly read-only diagnostic.
 *
 * Renders two blocks:
 *  (a) per-MCP-client registration/connection status from `debug.mcpStatus()`
 *      (a client-side `<cli> mcp list` parse, read once on mount + on `r`
 *      refresh). Daemon-independent (ac1).
 *  (b) the sessions currently attached to the daemon's socket from
 *      `debug.attachedClients()` (label + pid + connected-at over IPC), POLLED
 *      while the section is open with the interval cleared on unmount (ac2). An
 *      unreachable daemon degrades to a single line while (a) still shows.
 *
 * The section offers NO mutating control — only `r` refresh + the pane's ←/→
 * section-nav are honoured; nothing disconnects or terminates a client (ac3/k5).
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { DebugService, DebugStatusModel, McpClientStatus } from '../services/debug-types.js';
import { useCaptured } from '../ui/context.js';

/** Default poll cadence for the attached-client list (overridable for tests). */
const DEFAULT_POLL_MS = 2000;

/** Render the attached-sessions block from the discriminated status model. */
function AttachedSessions(props: { readonly status: DebugStatusModel | undefined }): ReactElement {
	const { status } = props;
	if (status === undefined) {
		return <Text dimColor>  loading…</Text>;
	}
	if (!status.reachable) {
		return <Text color="red">  daemon unreachable — no attached-client data</Text>;
	}
	// Hide this pane's own debug-status poll connection so the list shows OTHER
	// attached sessions (the poll is an ephemeral 'cli' → daemon.debug-status call).
	const others = status.clients.filter(c => !(c.label === 'cli' && c.lastMethod === 'daemon.debug-status'));
	if (others.length === 0) {
		return <Text dimColor>  no other sessions attached</Text>;
	}
	return (
		<Box flexDirection="column">
			{others.map(c => (
				<Text key={c.id}>
					{'  '}{c.label} <Text dimColor>pid {c.pid ?? '?'} · since {c.connectedAt}{c.lastMethod !== undefined ? ` · ${c.lastMethod}` : ''}</Text>
				</Text>
			))}
		</Box>
	);
}

export function MCPSection(props: {
	readonly services: { readonly debug: DebugService };
	readonly pollMs?: number;
}): ReactElement {
	const { debug } = props.services;
	const pollMs = props.pollMs ?? DEFAULT_POLL_MS;
	const captured = useCaptured();
	const [mcp, setMcp] = useState<readonly McpClientStatus[] | undefined>(undefined);
	const [status, setStatus] = useState<DebugStatusModel | undefined>(undefined);

	// (a) MCP registration — once on mount; re-read on `r`.
	useEffect(() => {
		let cancelled = false;
		void debug.mcpStatus().then(m => { if (!cancelled) setMcp(m); });
		return () => { cancelled = true; };
	}, [debug]);

	// (b) Attached clients — poll while open; clear the interval on unmount (ac2).
	useEffect(() => {
		let cancelled = false;
		const tick = (): void => { void debug.attachedClients().then(s => { if (!cancelled) setStatus(s); }); };
		tick();
		const handle = setInterval(tick, pollMs);
		return () => { cancelled = true; clearInterval(handle); };
	}, [debug, pollMs]);

	// Read-only: only `r` refresh; NO disconnect/terminate control (ac3/k5).
	useInput(input => {
		if (input === 'r') {
			void debug.mcpStatus().then(setMcp);
			void debug.attachedClients().then(setStatus);
		}
	}, { isActive: !captured });

	return (
		<Box flexDirection="column">
			<Text bold>MCP clients</Text>
			{mcp === undefined
				? <Text dimColor>  loading…</Text>
				: mcp.map(c => (
					<Text key={c.client}>
						{'  '}{c.client} <Text dimColor>— {c.available
							? `${c.registered ? 'registered' : 'not registered'} · ${c.connected ? 'connected' : 'not connected'}`
							: 'CLI not found'}</Text>
					</Text>
				))}
			<Box marginTop={1}><Text bold>Attached sessions</Text></Box>
			<AttachedSessions status={status} />
			<Box marginTop={1}><Text dimColor>  r refresh</Text></Box>
		</Box>
	);
}
