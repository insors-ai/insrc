/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon pane — health readout + the full maintenance lifecycle
 * (start / stop / restart / update / backup / compact), mirroring
 * `scripts/daemon-ctl.sh`. Long-running ops stream into a live log.
 */

import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import type { ReactElement } from 'react';

import type { DaemonState } from '../hooks/useDaemonStatus.js';
import { useServices, useUi, useCaptured } from '../ui/context.js';
import { Panel, KeyHints, LogView, TextPrompt } from '../ui/widgets.js';
import { formatBytes, formatUptime } from '../ui/format.js';

type Modal = 'none' | 'busy' | 'backup';

export function DaemonPane(props: { daemon: DaemonState; nonce: number }): ReactElement {
	const svc = useServices();
	const ui = useUi();
	const captured = useCaptured();
	const [modal, setModal] = useState<Modal>('none');
	const [log, setLog] = useState<string[]>([]);

	const d = props.daemon;
	const busy = modal === 'busy';

	const begin = (title: string): void => { setLog([title]); setModal('busy'); ui.capture(true); };
	const push = (line: string): void => setLog(l => [...l, line]);
	const done = (msg: string): void => { push(msg); setModal('none'); ui.capture(false); ui.toast(msg); };
	const fail = (msg: string): void => { push(`✗ ${msg}`); setModal('none'); ui.capture(false); ui.toast(`✗ ${msg}`); };

	const run = async (title: string, fn: () => Promise<string>): Promise<void> => {
		begin(title);
		try { done(await fn()); } catch (err) { fail(err instanceof Error ? err.message : String(err)); }
	};

	useInput((input) => {
		if (input === 's') void run('starting daemon…', async () => {
			const r = await svc.daemon.startDaemon();
			return r.started ? `daemon running${r.pid !== undefined ? ` (pid ${r.pid})` : ''}` : 'daemon did not become ready within 60 s';
		});
		else if (input === 'x') void run('stopping daemon…', async () => { await svc.daemon.stopDaemon(); return 'daemon stopped'; });
		else if (input === 'R') void run('restarting daemon…', async () => {
			const r = await svc.daemon.restart(push);
			if (!r.ok) throw new Error(r.error ?? 'restart failed');
			return 'daemon restarted';
		});
		else if (input === 'u') void run('updating daemon…', async () => {
			const r = await svc.daemon.update({}, push);
			if (!r.ok) throw new Error(r.error ?? 'update failed');
			return `update complete (${r.steps.join(', ') || 'no-op'})`;
		});
		else if (input === 'c') void run('compacting LMDB…', async () => {
			const r = await svc.daemon.compact();
			return `compacted: saved ${formatBytes(r.savedBytes)} in ${(r.elapsedMs / 1000).toFixed(1)}s`;
		});
		else if (input === 'b') { setModal('backup'); ui.capture(true); }
	}, { isActive: modal === 'none' && !captured });

	return (
		<Panel title="Daemon" active>
			{modal === 'backup'
				? <TextPrompt
						label="backup dir:"
						onCancel={() => { setModal('none'); ui.capture(false); }}
						onSubmit={(path) => {
							if (path.trim().length === 0) { setModal('none'); ui.capture(false); return; }
							void run(`backing up to ${path}…`, async () => {
								const r = await svc.daemon.backup(path.trim());
								return `backup → ${r.targetDir} (lmdb ${formatBytes(r.lmdbBytes)}, lance ${formatBytes(r.lanceBytes)})`;
							});
						}}
					/>
				: <Health daemon={d} />}

			{(busy || log.length > 0) && (
				<Box marginTop={1} flexDirection="column">
					<Text dimColor>{busy ? '⏳ working…' : 'last run:'}</Text>
					<LogView lines={log} />
				</Box>
			)}

			<Box marginTop={1}>
				<KeyHints hints={[['s', 'start'], ['x', 'stop'], ['R', 'restart'], ['u', 'update'], ['b', 'backup'], ['c', 'compact']]} />
			</Box>
		</Panel>
	);
}

function Health(props: { daemon: DaemonState }): ReactElement {
	const d = props.daemon;
	if (d.loading) return <Text dimColor>checking daemon…</Text>;
	if (!d.running || d.status === undefined) {
		return (
			<Box flexDirection="column">
				<Text color="red">○ daemon is not running</Text>
				<Text dimColor>{d.error ?? ''}</Text>
				<Text>Press <Text color="yellow">s</Text> to start it.</Text>
			</Box>
		);
	}
	const s = d.status;
	return (
		<Box flexDirection="column">
			<Text><Text color="green">● running</Text>  uptime <Text bold>{formatUptime(s.uptime)}</Text></Text>
			<Text>queue     <Text bold>{s.queueDepth}</Text> job(s) · embeddings pending <Text bold>{s.embeddingsPending}</Text></Text>
			<Text>model     {s.modelPullStatus === 'pulling' ? <Text color="yellow">pulling {s.modelPullPct ?? 0}%</Text> : <Text color="green">ready</Text>}</Text>
			{s.lmdbFileSizeMb !== undefined && <Text>lmdb      <Text bold>{s.lmdbFileSizeMb}</Text> MiB on disk</Text>}
			<Text>repos     <Text bold>{s.repos.length}</Text> registered</Text>
		</Box>
	);
}
