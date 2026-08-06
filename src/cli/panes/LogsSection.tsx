/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Logs section of the Debug pane (Story s5) — a live, filterable, read-only tail.
 *
 * Lists the log categories (daemon + agent) with no stream until a selection
 * (ac1); on select it subscribes via `debug.tailLog` into a bounded ring buffer,
 * disposing any prior subscription first (single stream, ac2) and on unmount /
 * category-change (via the effect cleanup). It renders the buffer through the
 * LogView widget, filtered by a persistent { minLevel?, module?, text? } filter
 * bar applied as a pure predicate (matchesFilter, ac3); the filter entry uses a
 * capture-gated TextPrompt. Strictly read-only — no key deletes/rotates/clears a
 * log (k2).
 */

import { Box, Text, useInput } from 'ink';
import { useContext, useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { DebugService, LogCategoryId, LogFilter, LogLine } from '../services/debug-types.js';
import { matchesFilter } from '../services/debug.js';
import { useCaptured, UiContext } from '../ui/context.js';
import { LogView, TextPrompt } from '../ui/widgets.js';

/** Max lines retained in the ring buffer (bounded memory). */
const MAX_BUFFER = 1000;
/** Max lines LogView renders at once. */
const MAX_VIEW = 20;

/** pino numeric level -> short label, for display + the level-filter parse. */
const LEVELS: readonly { readonly name: string; readonly n: number }[] = [
	{ name: 'trace', n: 10 }, { name: 'debug', n: 20 }, { name: 'info', n: 30 },
	{ name: 'warn', n: 40 }, { name: 'error', n: 50 }, { name: 'fatal', n: 60 },
];

function levelLabel(level: number | undefined): string {
	if (level === undefined) return '';
	const hit = LEVELS.find(l => l.n === level);
	return hit ? hit.name.toUpperCase() : String(level);
}

/** Parse a level-filter token (a name like 'warn' or a number); '' clears it. */
function parseLevel(token: string): number | undefined {
	const t = token.trim().toLowerCase();
	if (t === '') return undefined;
	const named = LEVELS.find(l => l.name === t);
	if (named) return named.n;
	const n = Number.parseInt(t, 10);
	return Number.isFinite(n) ? n : undefined;
}

/** Render one LogLine to a display string (parsed → level+module+msg, else raw). */
function formatLine(l: LogLine): string {
	if (l.msg !== undefined) {
		const lvl = levelLabel(l.level);
		const mod = l.module !== undefined ? ` ${l.module}` : '';
		return `${lvl ? lvl + ' ' : ''}${mod ? mod.trim() + ':' : ''} ${l.msg}`.replace(/\s+/g, ' ').trim();
	}
	return l.raw;
}

type EditField = 'level' | 'module' | 'text' | null;

export function LogsSection(props: { readonly services: { readonly debug: DebugService } }): ReactElement {
	const { debug } = props.services;
	const captured = useCaptured();
	const ui = useContext(UiContext); // optional — absent in standalone component tests
	const categories = debug.logCategories();

	const [cursor, setCursor] = useState(0);
	const [selected, setSelected] = useState<LogCategoryId | undefined>(undefined);
	const [buffer, setBuffer] = useState<readonly LogLine[]>([]);
	const [filter, setFilter] = useState<LogFilter>({});
	const [editing, setEditing] = useState<EditField>(null);

	// Single-stream subscription: React disposes the prior tail before starting a
	// new one (category change) and on unmount (ac2/lc2). The tailer's own
	// disposed-guard suppresses any post-dispose emit.
	useEffect(() => {
		if (selected === undefined) return;
		setBuffer([]);
		const dispose = debug.tailLog(selected, lines => {
			setBuffer(prev => (lines.length === 0 ? prev : [...prev, ...lines].slice(-MAX_BUFFER)));
		});
		return () => { dispose(); };
	}, [selected, debug]);

	// Mirror the edit state into the app-wide capture gate when a UiContext is
	// present, so the pane's ←/→ nav + this section's keys suspend during entry.
	useEffect(() => {
		if (ui === null) return;
		ui.capture(editing !== null);
		return () => { ui.capture(false); };
	}, [editing, ui]);

	useInput((input, key) => {
		if (categories.length === 0) return;
		if (key.upArrow) {
			setCursor(c => Math.max(0, c - 1));
		} else if (key.downArrow) {
			setCursor(c => Math.min(categories.length - 1, c + 1));
		} else if (key.return) {
			const next = categories[Math.min(cursor, categories.length - 1)]?.id;
			if (next !== undefined) setSelected(prev => (prev === next ? prev : next));
		} else if (input === 'l') {
			setEditing('level');
		} else if (input === 'm') {
			setEditing('module');
		} else if (input === 'f') {
			setEditing('text');
		} else if (input === 'x') {
			setFilter({});
		}
	}, { isActive: !captured && editing === null });

	const applyEdit = (value: string): void => {
		const v = value.trim();
		setFilter(prev => {
			if (editing === 'level') { const lv = parseLevel(v); return lv === undefined ? omit(prev, 'minLevel') : { ...prev, minLevel: lv }; }
			if (editing === 'module') return v === '' ? omit(prev, 'module') : { ...prev, module: v };
			if (editing === 'text') return v === '' ? omit(prev, 'text') : { ...prev, text: v };
			return prev;
		});
		setEditing(null);
	};

	const visible = buffer.filter(l => matchesFilter(l, filter)).map(formatLine);
	const active = Math.min(cursor, Math.max(0, categories.length - 1));

	return (
		<Box flexDirection="column">
			<Text bold>Logs</Text>
			{categories.map((c, i) => (
				<Text key={c.id} {...(i === active ? { color: 'cyan' as const } : {})}>
					{i === active ? '›' : ' '} {c.id === selected ? '●' : '○'} {c.title}
				</Text>
			))}

			<Box marginTop={1}>
				<Text dimColor>filter: {describeFilter(filter)}</Text>
			</Box>

			{editing !== null
				? (
					<TextPrompt
						label={editing === 'level' ? 'min level (trace/debug/info/warn/error or number; empty clears)' : editing === 'module' ? 'module contains (empty clears)' : 'text contains (empty clears)'}
						onSubmit={applyEdit}
						onCancel={() => setEditing(null)}
					/>
				)
				: selected === undefined
					? <Box marginTop={1}><Text dimColor>select a category (↑/↓ + Enter) to start tailing</Text></Box>
					: (
						<Box flexDirection="column" marginTop={1}>
							{visible.length === 0
								? <Text dimColor>  no matching lines</Text>
								: <LogView lines={visible} max={MAX_VIEW} />}
						</Box>
					)}

			<Box marginTop={1}>
				<Text dimColor>  ↑/↓ select · Enter tail · l level · m module · f text · x clear</Text>
			</Box>
		</Box>
	);
}

/** Remove one key from a LogFilter (immutably) — used to clear a filter field. */
function omit(f: LogFilter, k: keyof LogFilter): LogFilter {
	const next: { minLevel?: number; module?: string; text?: string } = { ...f };
	delete next[k];
	return next;
}

/** One-line human summary of the active filter (or 'none'). */
function describeFilter(f: LogFilter): string {
	const parts: string[] = [];
	if (f.minLevel !== undefined) parts.push(`level>=${levelLabel(f.minLevel) || f.minLevel}`);
	if (f.module !== undefined) parts.push(`module~${f.module}`);
	if (f.text !== undefined) parts.push(`text~${f.text}`);
	return parts.length > 0 ? parts.join(' · ') : 'none';
}
