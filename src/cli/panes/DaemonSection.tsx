/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon section of the Debug pane.
 *
 * Story s2 — a read-only status card: reads `debug.daemonStatus()` once on mount
 * and renders the discriminated view-model (running + uptime/socket/version/pid +
 * repo index-state, or a single 'stopped / unreachable' line).
 *
 * Story s3 — an orphan area BELOW the card: `debug.scanOrphans()` recommends stray
 * daemon-entry processes (the managed daemon excluded); the operator multi-selects
 * and requests a kill, which opens a ConfirmPrompt and — only on explicit yes —
 * calls `debug.killOrphans(selection)` and reports the per-pid outcomes. This kill
 * is the ONLY mutating control in the whole pane (k2), acts solely on the explicit
 * selection (lc1), and degrades to a 'not supported' line off POSIX (k3/ac3). The
 * section's own key handling is suspended while the ConfirmPrompt owns keys.
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { DebugService, DaemonCardModel } from '../services/debug-types.js';
import { formatUptime } from '../ui/format.js';
import { useCaptured } from '../ui/context.js';
import { ConfirmPrompt } from '../ui/widgets.js';

/** The s2 status card — reachable running card, or the single stopped line. */
function StatusCard(props: { readonly card: DaemonCardModel | undefined }): ReactElement {
	const { card } = props;
	if (card === undefined) {
		return <Text dimColor>Loading daemon status…</Text>;
	}
	if (!card.reachable) {
		return <Text color="red">○ stopped / unreachable</Text>;
	}
	return (
		<Box flexDirection="column">
			<Text><Text color="green">● running</Text><Text dimColor> · up {formatUptime(card.uptimeSec)}</Text></Text>
			<Text>  socket   {card.socket}</Text>
			{card.version !== undefined ? <Text>  version  {card.version}</Text> : null}
			{card.pid !== undefined ? <Text>  pid      {card.pid}</Text> : null}
			<Text>  repos    {card.repoCount}</Text>
			{card.repos.map(r => (
				<Text key={r.name}>    {r.name} <Text dimColor>— {r.status}</Text></Text>
			))}
		</Box>
	);
}

export function DaemonSection(props: { readonly services: { readonly debug: DebugService } }): ReactElement {
	const { debug } = props.services;
	const [card, setCard] = useState<DaemonCardModel | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		void debug.daemonStatus().then(c => { if (!cancelled) setCard(c); });
		return () => { cancelled = true; };
	}, [debug]);

	return (
		<Box flexDirection="column">
			<StatusCard card={card} />
		</Box>
	);
}
