/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Repos pane — the registered repositories and their indexing status.
 * ↑/↓ selects (the highlighted repo is what the Workflows pane targets);
 * a add · d remove · i reindex.
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { RegisteredRepo } from '../../shared/types.js';
import type { DaemonState } from '../hooks/useDaemonStatus.js';
import { useServices, useUi, useCaptured } from '../ui/context.js';
import { formatMcpOutcome } from '../services/repo.js';
import { Panel, KeyHints, TextPrompt, ConfirmPrompt } from '../ui/widgets.js';
import { formatWhen } from '../ui/format.js';
import { trackerStatusGlyph, trackerReportSummary } from './tracker-report.js';
import type { TrackerSetupReport } from '../../workflow/tracker/setup.js';

const STATUS_COLOR: Record<RegisteredRepo['status'], string> = {
	ready: 'green', indexing: 'yellow', pending: 'gray', error: 'red',
};

type Modal = 'none' | 'add' | 'steer-claude' | 'steer-agents' | 'confirm-remove' | 'tracker';

export function ReposPane(props: {
	daemon: DaemonState;
	nonce: number;
	selectedRepo: string;
	onSelectRepo: (path: string) => void;
}): ReactElement {
	const svc = useServices();
	const ui = useUi();
	const captured = useCaptured();
	const [cursor, setCursor] = useState(0);
	const [modal, setModal] = useState<Modal>('none');
	// Steering-injection add flow: path entered, then a per-file confirm for
	// CLAUDE.md and AGENTS.md before the repo.add call carries the selection.
	const [addPath, setAddPath] = useState('');
	const [steerClaude, setSteerClaude] = useState(false);
	// Tracker-setup modal: `running` while the (synchronous, gh-shelling) engine
	// runs on a deferred tick; `report` once it returns (or a synthetic failed
	// report if it threw).
	const [running, setRunning] = useState(false);
	const [report, setReport] = useState<TrackerSetupReport | null>(null);

	const finishAdd = (claude: boolean, agents: boolean): void => {
		setModal('none'); ui.capture(false);
		const picks = [claude ? 'CLAUDE.md' : null, agents ? 'AGENTS.md' : null].filter(Boolean).join(' + ');
		act('add', async () => {
			const { path: registered, mcp } = await svc.repo.add(addPath, { claude, agents });
			const mcpLine = formatMcpOutcome(mcp);
			return `registered ${registered} — indexing started${picks ? ` · steering → ${picks}` : ''}${mcpLine ? ` · mcp: ${mcpLine}` : ''}`;
		});
	};

	const repos = props.daemon.status?.repos ?? [];
	const clamped = Math.min(cursor, Math.max(0, repos.length - 1));
	const current = repos[clamped];

	// Keep the app-level selected repo in sync with the cursor.
	useEffect(() => {
		if (current !== undefined) props.onSelectRepo(current.path);
	}, [current?.path]);

	const act = (verb: string, fn: () => Promise<string>): void => {
		void fn().then(ui.toast).catch((e: unknown) => ui.toast(`✗ ${verb}: ${e instanceof Error ? e.message : String(e)}`));
	};

	// Run tracker setup for the selected repo and show its full report in the
	// 'tracker' modal. trackerSetup is SYNCHRONOUS and shells out to gh, so we
	// paint the modal in its `running` state first and defer the blocking call a
	// macrotask (setTimeout 0) so the UI shows feedback instead of freezing.
	const runTrackerSetup = (repoPath: string): void => {
		setReport(null); setRunning(true); setModal('tracker'); ui.capture(true);
		setTimeout(() => {
			try {
				setReport(svc.workflow.trackerSetup(repoPath));
			} catch (e) {
				setReport({
					steps: [{ key: 'error', title: 'tracker setup', status: 'failed', detail: e instanceof Error ? e.message : String(e) }],
					manualRemaining: 0,
				});
			} finally {
				setRunning(false);
			}
		}, 0);
	};

	useInput((input, key) => {
		if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
		else if (key.downArrow) setCursor(c => Math.min(repos.length - 1, c + 1));
		else if (input === 'a') { setModal('add'); ui.capture(true); }
		else if (input === 'i' && current !== undefined) act('reindex', async () => `reindexing ${await svc.repo.reindex(current.path)}`);
		else if (input === 'd' && current !== undefined) { setModal('confirm-remove'); ui.capture(true); }
		else if (input === 't' && current !== undefined) runTrackerSetup(current.path);
	}, { isActive: modal === 'none' && !captured });

	// The tracker report modal dismisses on any key.
	useInput(() => { setModal('none'); setReport(null); setRunning(false); ui.capture(false); }, { isActive: modal === 'tracker' });

	if (modal === 'add') {
		return (
			<Panel title="Repos · add" active>
				<TextPrompt
					label="repo path:"
					onCancel={() => { setModal('none'); ui.capture(false); }}
					onSubmit={(path) => {
						const p = path.trim();
						if (p.length === 0) { setModal('none'); ui.capture(false); return; }
						setAddPath(p); setModal('steer-claude');
					}}
				/>
			</Panel>
		);
	}

	if (modal === 'steer-claude') {
		return (
			<Panel title="Repos · add · steering" active>
				<ConfirmPrompt
					label="install the insrc steering block into this repo's CLAUDE.md (Claude Code)?"
					onYes={() => { setSteerClaude(true);  setModal('steer-agents'); }}
					onNo={()  => { setSteerClaude(false); setModal('steer-agents'); }}
				/>
			</Panel>
		);
	}

	if (modal === 'steer-agents') {
		return (
			<Panel title="Repos · add · steering" active>
				<ConfirmPrompt
					label="install the insrc steering block into this repo's AGENTS.md (Codex)?"
					onYes={() => finishAdd(steerClaude, true)}
					onNo={()  => finishAdd(steerClaude, false)}
				/>
			</Panel>
		);
	}

	if (modal === 'confirm-remove' && current !== undefined) {
		return (
			<Panel title="Repos · remove" active>
				<ConfirmPrompt
					label={`remove ${current.path} and its graph data?`}
					onNo={() => { setModal('none'); ui.capture(false); }}
					onYes={() => {
						setModal('none'); ui.capture(false);
						act('remove', async () => `removed ${await svc.repo.remove(current.path)}`);
					}}
				/>
			</Panel>
		);
	}

	if (modal === 'tracker') {
		return (
			<Panel title="Repos · tracker setup" active>
				{running || report === null
					? <Text dimColor>running tracker setup — gh may take a few seconds…</Text>
					: report.steps.map(s => {
						const g = trackerStatusGlyph(s.status);
						return (
							<Box key={s.key} flexDirection="column">
								<Box>
									<Text color={g.color}>{g.glyph} </Text>
									<Text bold>{s.title}</Text>
									<Text dimColor> — {s.detail}</Text>
								</Box>
								{s.action !== undefined && s.action.length > 0
									? <Text color="cyan">    {s.action}</Text>
									: null}
							</Box>
						);
					})}
				{!running && report !== null
					? <Box marginTop={1}><Text>{trackerReportSummary(report)}</Text></Box>
					: null}
			</Panel>
		);
	}

	return (
		<Panel title="Repos" active>
			{repos.length === 0
				? <Text dimColor>{props.daemon.running ? 'no repositories registered — press a to add one' : 'daemon down — start it in the Daemon pane'}</Text>
				: repos.map((r, i) => <RepoRow key={r.path} repo={r} selected={i === clamped} />)}
			<Box marginTop={1}>
				<KeyHints hints={[['↑/↓', 'select'], ['a', 'add'], ['d', 'remove'], ['i', 'reindex'], ['t', 'tracker setup']]} />
			</Box>
		</Panel>
	);
}

function RepoRow(props: { repo: RegisteredRepo; selected: boolean }): ReactElement {
	const r = props.repo;
	const sel = props.selected ? { color: 'cyan' as const } : {};
	return (
		<Box>
			<Text {...sel}>{props.selected ? '❯ ' : '  '}</Text>
			<Text color={STATUS_COLOR[r.status]}>●</Text>
			<Text> {r.status.padEnd(8)} </Text>
			<Text {...sel} bold={props.selected}>{r.path}</Text>
			<Text dimColor>  (indexed {formatWhen(r.lastIndexed)})</Text>
		</Box>
	);
}
