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

import type { DebugService, DaemonCardModel, OrphanScanResult, KillOutcome } from '../services/debug-types.js';
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

/**
 * The s3 orphan area. Scans on mount (and on explicit `r` refresh — never a poll),
 * keeps a pane-local multi-select + cursor, and gates the kill behind ConfirmPrompt.
 * The kill acts on exactly the selected pids; an empty selection is inert.
 */
function OrphanArea(props: { readonly debug: DebugService }): ReactElement {
	const { debug } = props;
	const captured = useCaptured();
	const [scan, setScan] = useState<OrphanScanResult>(() => debug.scanOrphans());
	const [cursor, setCursor] = useState(0);
	const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set<number>());
	const [confirming, setConfirming] = useState(false);
	const [outcomes, setOutcomes] = useState<readonly KillOutcome[] | undefined>(undefined);

	const orphans = scan.supported ? scan.orphans : [];

	const rescan = (): void => {
		setScan(debug.scanOrphans());
		setCursor(0);
		setSelected(new Set<number>());
		setOutcomes(undefined);
	};

	// Suspended while the ConfirmPrompt is open (it owns keys) or a modal captures.
	useInput((input, key) => {
		if (input === 'r') { rescan(); return; }
		if (orphans.length === 0) return;
		if (key.upArrow) {
			setCursor(c => Math.max(0, c - 1));
		} else if (key.downArrow) {
			setCursor(c => Math.min(orphans.length - 1, c + 1));
		} else if (input === ' ') {
			const pid = orphans[Math.min(cursor, orphans.length - 1)]?.pid;
			if (pid !== undefined) {
				setSelected(prev => {
					const next = new Set(prev);
					if (next.has(pid)) next.delete(pid); else next.add(pid);
					return next;
				});
			}
		} else if (input === 'k') {
			if (selected.size > 0) setConfirming(true); // empty selection is inert (lc1)
		}
	}, { isActive: !captured && !confirming });

	if (!scan.supported) {
		return (
			<Box marginTop={1}>
				<Text dimColor>orphan scan: not supported on this platform</Text>
			</Box>
		);
	}

	const active = Math.min(cursor, Math.max(0, orphans.length - 1));

	return (
		<Box flexDirection="column" marginTop={1}>
			<Text bold>Orphan daemon processes</Text>
			{orphans.length === 0
				? <Text dimColor>  no orphan processes found</Text>
				: orphans.map((o, i) => (
					<Text key={o.pid} {...(i === active ? { color: 'cyan' as const } : {})}>
						{i === active ? '›' : ' '} [{selected.has(o.pid) ? 'x' : ' '}] {o.pid} <Text dimColor>{o.command}</Text>
					</Text>
				))}
			{outcomes !== undefined
				? (
					<Box flexDirection="column" marginTop={1}>
						{outcomes.map(oc => <Text key={oc.pid}>  {oc.pid}: {oc.result}</Text>)}
					</Box>
				)
				: null}
			{confirming
				? (
					<ConfirmPrompt
						label={`Kill ${selected.size} selected orphan process(es)?`}
						onYes={() => {
							const pids = [...selected];
							setConfirming(false);
							void debug.killOrphans(pids).then(res => {
								setOutcomes(res);
								setSelected(new Set<number>());
								setScan(debug.scanOrphans());
								setCursor(0);
							});
						}}
						onNo={() => setConfirming(false)}
					/>
				)
				: orphans.length > 0
					? <Text dimColor>  ↑/↓ move · space select · k kill · r rescan</Text>
					: <Text dimColor>  r rescan</Text>}
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
			<OrphanArea debug={debug} />
		</Box>
	);
}
