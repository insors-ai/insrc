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
import { Panel, KeyHints, TextPrompt, ConfirmPrompt } from '../ui/widgets.js';
import { formatWhen } from '../ui/format.js';

const STATUS_COLOR: Record<RegisteredRepo['status'], string> = {
	ready: 'green', indexing: 'yellow', pending: 'gray', error: 'red',
};

type Modal = 'none' | 'add' | 'confirm-remove';

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

	useInput((input, key) => {
		if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
		else if (key.downArrow) setCursor(c => Math.min(repos.length - 1, c + 1));
		else if (input === 'a') { setModal('add'); ui.capture(true); }
		else if (input === 'i' && current !== undefined) act('reindex', async () => `reindexing ${await svc.repo.reindex(current.path)}`);
		else if (input === 'd' && current !== undefined) { setModal('confirm-remove'); ui.capture(true); }
	}, { isActive: modal === 'none' && !captured });

	if (modal === 'add') {
		return (
			<Panel title="Repos · add" active>
				<TextPrompt
					label="repo path:"
					onCancel={() => { setModal('none'); ui.capture(false); }}
					onSubmit={(path) => {
						setModal('none'); ui.capture(false);
						if (path.trim().length > 0) act('add', async () => `registered ${await svc.repo.add(path.trim())} — indexing started`);
					}}
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

	return (
		<Panel title="Repos" active>
			{repos.length === 0
				? <Text dimColor>{props.daemon.running ? 'no repositories registered — press a to add one' : 'daemon down — start it in the Daemon pane'}</Text>
				: repos.map((r, i) => <RepoRow key={r.path} repo={r} selected={i === clamped} />)}
			<Box marginTop={1}>
				<KeyHints hints={[['↑/↓', 'select'], ['a', 'add'], ['d', 'remove'], ['i', 'reindex']]} />
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
