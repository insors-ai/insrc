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
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import type { Services } from './services/index.js';
import { ServicesContext, UiContext, CaptureContext, useServices, type Ui } from './ui/context.js';
import { appendMessage, clearTransient, dismissMessage, MAX_MESSAGES } from './ui/messages.js';
import type { MsgKind, MsgLine } from './ui/messages.js';
import { KeyHints } from './ui/widgets.js';
import { CommandBar } from './ui/CommandBar.js';
import { formatUptime } from './ui/format.js';
import { runCommand } from './command.js';
import { useDaemonStatus } from './hooks/useDaemonStatus.js';
import { DaemonPane } from './panes/DaemonPane.js';
import { ReposPane } from './panes/ReposPane.js';
import { WorkflowsPane } from './panes/WorkflowsPane.js';
import { SetupPane } from './panes/SetupPane.js';
import { ModelTiersPane } from './panes/ModelTiersPane.js';

const TABS = ['Daemon', 'Repos', 'Workflows', 'Setup', 'Tiers'] as const;

/** How long a transient toast line lingers before its auto-dismiss timer fires. */
const TOAST_MS = 4000;

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
	// The single bottom message box: one bounded list of MsgLine that toasts,
	// streaming op output, command output, and errors all append to. There is
	// exactly one render site (MessageBox below) — nothing renders mid-screen.
	const [messages, setMessages] = useState<MsgLine[]>([]);
	const [captured, setCaptured] = useState(false);
	// INSRC_CWD lets the `scripts/insrc` wrapper preserve the launch
	// directory even though it cd's to the repo root for module resolution.
	const [selectedRepo, setSelectedRepo] = useState<string>(process.env['INSRC_CWD'] ?? process.cwd());
	const [cmdMode, setCmdMode] = useState(false);
	const [cmdRunning, setCmdRunning] = useState(false);

	const pollMs = props.pollMs ?? 2000;
	const daemon = useDaemonStatus(pollMs, nonce);

	// Monotonic id per line (React key + transient-dismiss target) and the set
	// of pending transient-dismiss timers, cleared on unmount so no setState
	// fires after teardown.
	const idRef = useRef(0);
	const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
	useEffect(() => () => {
		for (const t of timersRef.current) clearTimeout(t);
		timersRef.current.clear();
	}, []);

	const ui = useMemo<Ui>(() => {
		const push = (text: string, kind: MsgKind, transient: boolean): void => {
			const id = ++idRef.current;
			setMessages(l => appendMessage(l, { id, text, kind, transient }));
			if (transient) {
				const timer = setTimeout(() => {
					setMessages(l => dismissMessage(l, id));
					timersRef.current.delete(timer);
				}, TOAST_MS);
				timersRef.current.add(timer);
			}
		};
		return {
			toast: (m?: string) => { if (m === undefined) setMessages(clearTransient); else push(m, 'success', true); },
			note: (line: string, kind: 'info' | 'error' = 'info') => push(line, kind, false),
			task: (title: string) => {
				push(title, 'info', false);
				return {
					push: (line: string) => push(line, 'info', false),
					done: (message: string) => push(message, 'success', false),
					fail: (message: string) => push(message, 'error', false),
				};
			},
			capture: (on: boolean) => setCaptured(on),
		};
	}, []);

	const openCmd = (): void => { setCmdMode(true); setCaptured(true); };
	const closeCmd = (): void => { setCmdMode(false); setCaptured(false); };

	const runCmd = async (line: string): Promise<void> => {
		if (line.trim().length === 0) return;
		ui.note(`: ${line}`, 'info');
		setCmdRunning(true);
		try {
			const result = await runCommand(line, {
				services, repoPath: selectedRepo, setPane,
				onLog: l => ui.note(l), exit,
			});
			for (const l of result) ui.note(l);
		} catch (err) {
			ui.note(`✗ ${err instanceof Error ? err.message : String(err)}`, 'error');
		}
		setCmdRunning(false);
	};

	useInput((input, key) => {
		if (input === ':') { openCmd(); return; }
		if (input === 'q') { exit(); return; }
		if (input >= '1' && input <= '5') { setPane(Number(input) - 1); return; }
		if (key.tab && key.shift) { setPane(p => (p + TABS.length - 1) % TABS.length); return; }
		if (key.tab)              { setPane(p => (p + 1) % TABS.length); return; }
		if (input === 'r') { setNonce(n => n + 1); ui.toast('refreshed'); return; }
		if (input === '?') { ui.toast(': command · 1-5/Tab switch · r refresh · q quit'); return; }
	}, { isActive: !captured });

	return (
		<UiContext.Provider value={ui}>
			<CaptureContext.Provider value={captured}>
				<Box flexDirection="column" paddingX={1}>
					<Header pane={pane} daemon={daemon} />
					<Box flexGrow={1} flexDirection="column">
						{cmdMode
							? <CommandBar running={cmdRunning} onSubmit={runCmd} onClose={closeCmd} />
							: <>
									{pane === 0 && <DaemonPane daemon={daemon} nonce={nonce} />}
									{pane === 1 && <ReposPane daemon={daemon} nonce={nonce} selectedRepo={selectedRepo} onSelectRepo={setSelectedRepo} />}
									{pane === 2 && <WorkflowsPane repoPath={selectedRepo} nonce={nonce} />}
									{pane === 3 && <SetupPane />}
									{pane === 4 && <ModelTiersPane />}
								</>}
					</Box>
					{/* The one and only message render site — docked at the bottom. */}
					<MessageBox messages={messages} />
					{!cmdMode && (
						<KeyHints hints={[[':', 'command'], ['1-5/Tab', 'switch'], ['r', 'refresh'], ['q', 'quit']]} />
					)}
				</Box>
			</CaptureContext.Provider>
		</UiContext.Provider>
	);
}

/** The single bottom message box. Renders the bounded last-N tail of `messages`,
 *  one coloured row per kind (success=green, error=red, info=dim). Reserves one
 *  blank line when empty so the layout never jumps as messages come and go. */
function MessageBox(props: { messages: readonly MsgLine[] }): ReactElement {
	const rows = props.messages.slice(-MAX_MESSAGES);
	return (
		<Box marginTop={1} flexDirection="column">
			{rows.length === 0
				? <Text> </Text>
				: rows.map(m => {
					const color = MSG_COLOR[m.kind];
					return <Text key={m.id} {...(color !== undefined ? { color } : {})} dimColor={m.kind === 'info'}>{m.text}</Text>;
				})}
		</Box>
	);
}

const MSG_COLOR: Record<MsgKind, string | undefined> = {
	success: 'green',
	error: 'red',
	info: undefined,
};

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
