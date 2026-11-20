/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-repo tracker settings modal (Story s3), opened from the Repos pane with `s`.
 * Lists the rows the daemon defines (`repoFields` from config.catalog) with this
 * repo's values (`repo.settings.get`). Local rows are editable; sign-in, target and
 * policy rows are read-only. A refusal from the daemon is shown as its message.
 * ↑/↓ select · enter edit · esc close. An empty edit clears the row. The Build rows are a section of their
 * own; for a repo with no build commands whose type has typical ones, `u` writes them (use suggested).
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { RepoFieldDef } from '../../config/repo-fields.js';
import type { RepoSettingsPayload } from '../../daemon/repo-settings.js';
import { useServices } from '../ui/context.js';
import { Panel, KeyHints, TextPrompt } from '../ui/widgets.js';
import { buildSettingsRows, offeredSuggestion, writeSuggested } from './repo-settings-model.js';
import type { SettingsRow } from './repo-settings-model.js';

export function RepoSettingsModal(props: { repo: string; onClose: () => void }): ReactElement {
	const svc = useServices();
	const [fields, setFields] = useState<readonly RepoFieldDef[]>([]);
	const [payload, setPayload] = useState<RepoSettingsPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [cursor, setCursor] = useState(0);
	const [editing, setEditing] = useState<SettingsRow | null>(null);
	const [note, setNote] = useState<string | null>(null);

	useEffect(() => {
		let live = true;
		void (async () => {
			try {
				const catalog = await svc.config.catalog();
				const result = await svc.config.repoSettings(props.repo);
				if (!live) return;
				setFields(catalog.repoFields ?? []);
				if (result.ok) setPayload(result.payload); else setError(result.error.message);
			} catch (e) {
				if (live) setError(e instanceof Error ? e.message : String(e));
			} finally {
				if (live) setLoading(false);
			}
		})();
		return () => { live = false; };
	}, [props.repo]);

	const rows = payload === null ? [] : buildSettingsRows(fields, payload);
	const at = Math.min(cursor, Math.max(0, rows.length - 1));
	const row = rows[at];

	const save = (target: SettingsRow, text: string): void => {
		setEditing(null);
		const value: string | boolean | null = text.trim() === '' ? null : target.type === 'boolean' ? text.trim() === 'true' : text.trim();
		void (async () => {
			try {
				const result = await svc.config.setRepoSetting(props.repo, target.key, value);
				if (result.ok) { setPayload(result.payload); setError(null); setNote(`saved ${target.label}`); }
				else { setError(result.error.message); setNote(null); }
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e)); setNote(null);
			}
		})();
	};

	const suggestion = offeredSuggestion(payload);

	const useSuggested = (): void => {
		if (suggestion === undefined) return;
		void (async () => {
			const result = await writeSuggested(suggestion, (key, value) => svc.config.setRepoSetting(props.repo, key, value));
			if (result.ok) { setPayload(result.payload); setError(null); setNote('applied the suggested build commands'); }
			else { setError(result.message); setNote(null); }
		})();
	};

	useInput((input, key) => {
		if (key.escape || input === 'q') props.onClose();
		else if (input === 'u') useSuggested();
		else if (key.upArrow) setCursor(c => Math.max(0, c - 1));
		else if (key.downArrow) setCursor(c => Math.min(rows.length - 1, c + 1));
		else if (key.return && row !== undefined) {
			if (row.editable) { setNote(null); setEditing(row); }
			else setNote(`${row.label} is read-only`);
		}
	}, { isActive: editing === null });

	return (
		<Panel title={`Repos · tracker settings · ${props.repo}`} active>
			{loading ? <Text dimColor>loading…</Text> : null}
			{error !== null ? <Text color="red">✗ {error}</Text> : null}
			{rows.map((r, i) => (
				<Box key={r.key} flexDirection="column">
					{i === 0 || rows[i - 1]?.group !== r.group ? <Text bold underline>{r.group}</Text> : null}
					<Box>
						<Text {...(i === at ? { color: 'cyan' as const } : {})}>{i === at ? '❯ ' : '  '}</Text>
						<Text bold={i === at}>{r.label.padEnd(18)}</Text>
						<Text> {r.value}</Text>
						<Text dimColor>{r.placeholder !== undefined ? `  suggested: ${r.placeholder}` : ''}{r.editable ? '' : '  (read-only)'}{r.note !== undefined ? `  ${r.note}` : ''}</Text>
					</Box>
				</Box>
			))}
			{note !== null ? <Text dimColor>{note}</Text> : null}
			{editing !== null
				? (
					<Box marginTop={1}>
						<TextPrompt
							label={`${editing.label} (empty clears):`}
							initial={editing.current}
							{...(editing.placeholder !== undefined ? { placeholder: editing.placeholder } : {})}
							onSubmit={(text) => save(editing, text)}
							onCancel={() => setEditing(null)}
						/>
					</Box>
				)
				: <Box marginTop={1}><KeyHints hints={[['↑/↓', 'select'], ['enter', 'edit'], ...(suggestion !== undefined ? [['u', 'use suggested build commands'] as [string, string]] : []), ['esc', 'close']]} /></Box>}
		</Panel>
	);
}
