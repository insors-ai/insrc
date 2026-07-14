/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Root of the insrc TUI: a tab bar over four panes (Daemon, Repos,
 * Workflows, Setup), a live daemon header, a toast line, and global
 * keybindings. Panes are rendered one at a time so only the active
 * pane's `useInput` is live; a pane suspends the global keys via
 * `ui.capture(true)` while a modal text field is open.
 */

import { Box, Text, useApp, useInput } from 'ink';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import type { Services } from './services/index.js';
import { ServicesContext, UiContext, CaptureContext, useServices, type Ui } from './ui/context.js';
import { KeyHints } from './ui/widgets.js';
import { CommandBar } from './ui/CommandBar.js';
import { formatUptime } from './ui/format.js';
import { runCommand } from './command.js';
import { useDaemonStatus } from './hooks/useDaemonStatus.js';
import { DaemonPane } from './panes/DaemonPane.js';
import { ReposPane } from './panes/ReposPane.js';
import { WorkflowsPane } from './panes/WorkflowsPane.js';
import { SetupPane } from './panes/SetupPane.js';

const TABS = ['Daemon', 'Repos', 'Workflows', 'Setup'] as const;

/** Outer shell: provides the services context so everything below
 *  (including the body's own daemon-status hook) can read it. */
export function App(props: { services: Services; pollMs?: number; initialPane?: number }): ReactElement {
	return (
		<ServicesContext.Provider value={props.services}>
			<AppBody {...(props.pollMs !== undefined ? { pollMs: props.pollMs } : {})} {...(props.initialPane !== undefined ? { initialPane: props.initialPane } : {})} />
		</ServicesContext.Provider>
	);
}

function AppBody(props: { pollMs?: number; initialPane?: number }): ReactElement {
	const services = useServices();
	const { exit } = useApp();
	const [pane, setPane] = useState(props.initialPane ?? 0);
	const [nonce, setNonce] = useState(0);
	const [toast, setToast] = useState<string | undefined>(undefined);
	const [captured, setCaptured] = useState(false);
	const [selectedRepo, setSelectedRepo] = useState<string>(process.cwd());
	const [cmdMode, setCmdMode] = useState(false);
	const [cmdOutput, setCmdOutput] = useState<string[]>([]);
	const [cmdRunning, setCmdRunning] = useState(false);

	const pollMs = props.pollMs ?? 2000;
	const daemon = useDaemonStatus(pollMs, nonce);

	const ui = useMemo<Ui>(() => ({
		toast: (m?: string) => setToast(m),
		capture: (on: boolean) => setCaptured(on),
	}), []);

	const openCmd = (): void => { setCmdOutput([]); setCmdMode(true); setCaptured(true); };
	const closeCmd = (): void => { setCmdMode(false); setCaptured(false); setCmdOutput([]); };

	const runCmd = async (line: string): Promise<void> => {
		if (line.trim().length === 0) return;
		const append = (lines: readonly string[]): void => setCmdOutput(o => [...o, ...lines]);
		append([`: ${line}`]);
		setCmdRunning(true);
		try {
			const result = await runCommand(line, {
				services, repoPath: selectedRepo, setPane,
				onLog: l => append([l]), exit,
			});
			append(result);
		} catch (err) {
			append([`✗ ${err instanceof Error ? err.message : String(err)}`]);
		}
		setCmdRunning(false);
	};

	useInput((input, key) => {
		if (input === ':') { openCmd(); return; }
		if (input === 'q') { exit(); return; }
		if (input >= '1' && input <= '4') { setPane(Number(input) - 1); return; }
		if (key.tab && key.shift) { setPane(p => (p + TABS.length - 1) % TABS.length); return; }
		if (key.tab)              { setPane(p => (p + 1) % TABS.length); return; }
		if (input === 'r') { setNonce(n => n + 1); setToast('refreshed'); return; }
		if (input === '?') { setToast(': command · 1-4/Tab switch · r refresh · q quit'); return; }
	}, { isActive: !captured });

	return (
		<UiContext.Provider value={ui}>
			<CaptureContext.Provider value={captured}>
				<Box flexDirection="column" paddingX={1}>
					<Header pane={pane} daemon={daemon} />
					<Box flexGrow={1}>
						{pane === 0 && <DaemonPane daemon={daemon} nonce={nonce} />}
						{pane === 1 && <ReposPane daemon={daemon} nonce={nonce} selectedRepo={selectedRepo} onSelectRepo={setSelectedRepo} />}
						{pane === 2 && <WorkflowsPane repoPath={selectedRepo} nonce={nonce} />}
						{pane === 3 && <SetupPane />}
					</Box>
					<Box marginTop={1} flexDirection="column">
						{cmdMode
							? <CommandBar output={cmdOutput} running={cmdRunning} onSubmit={runCmd} onClose={closeCmd} />
							: <>
									<Text>{toast !== undefined ? <Text color="green">{toast}</Text> : <Text> </Text>}</Text>
									<KeyHints hints={[[':', 'command'], ['1-4/Tab', 'switch'], ['r', 'refresh'], ['q', 'quit']]} />
								</>}
					</Box>
				</Box>
			</CaptureContext.Provider>
		</UiContext.Provider>
	);
}

function Header(props: { pane: number; daemon: ReturnType<typeof useDaemonStatus> }): ReactElement {
	const d = props.daemon;
	const health = d.loading
		? <Text dimColor>checking…</Text>
		: d.running && d.status !== undefined
			? <Text><Text color="green">● running</Text><Text dimColor> · up {formatUptime(d.status.uptime)} · queue {d.status.queueDepth}</Text></Text>
			: <Text color="red">○ daemon down</Text>;
	return (
		<Box justifyContent="space-between" marginBottom={1}>
			<Box>
				{TABS.map((t, i) => (
					<Text key={t}>
						{i > 0 ? '  ' : ''}
						<Text color={i === props.pane ? 'cyan' : 'gray'} bold={i === props.pane} underline={i === props.pane}>
							{i + 1}:{t}
						</Text>
					</Text>
				))}
			</Box>
			<Box>{health}</Box>
		</Box>
	);
}
