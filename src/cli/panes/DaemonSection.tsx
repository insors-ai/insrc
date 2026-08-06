/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon section of the Debug pane (Story s2) — a read-only status card.
 *
 * Reads `debug.daemonStatus()` once on mount (the same once-fetch idiom as
 * `useDaemonStatus` with pollMs=0) and renders the discriminated view-model:
 * reachable → running + uptime/socket/version/pid + repo-count with each repo's
 * index state; unreachable → a single 'stopped / unreachable' line (no stale
 * fields). No keybindings — the section is strictly read-only (k5).
 */

import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { DebugService, DaemonCardModel } from '../services/debug-types.js';
import { formatUptime } from '../ui/format.js';

export function DaemonSection(props: { readonly services: { readonly debug: DebugService } }): ReactElement {
	const { debug } = props.services;
	const [card, setCard] = useState<DaemonCardModel | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		void debug.daemonStatus().then(c => { if (!cancelled) setCard(c); });
		return () => { cancelled = true; };
	}, [debug]);

	if (card === undefined) {
		return <Box><Text dimColor>Loading daemon status…</Text></Box>;
	}

	if (!card.reachable) {
		return <Box><Text color="red">○ stopped / unreachable</Text></Box>;
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
