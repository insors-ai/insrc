/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Repos pane's models view (Epic ce99b72065d03b1b, Story s5): one repo's
 * role-to-tier map and coreFloor. Tiers are global (models.tiers), so this view
 * has no runner, model or effort field — it shows the global tier models
 * read-only and writes only ['models','byRepo',<repo>,'tasks'] (the whole map,
 * role ids as flat keys) and ['models','byRepo',<repo>,'coreFloor']. The repo
 * path is one literal segment, so a dotted path stays a single key.
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { parseTiering, type TierName } from '../../config/analyze.js';
import { reasoningRoleTaxonomy } from '../../config/role-taxonomy.js';
import type { ConfigWriteResult } from '../services/config.js';
import { daemonProblem, type ModelDefinitionsResult } from '../services/models.js';
import { useServices, useUi } from '../ui/context.js';
import { Panel, KeyHints, TextPrompt } from '../ui/widgets.js';
import { computeEffectiveTiers, familyOf, isTierName, nextRoleTiers, TIER_NAMES } from './model-tiers.js';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The message shown when the daemon cannot answer. */
export const REPO_MODELS_DOWN = 'the daemon is not running — start it to edit this repo\'s model settings';

const ROLE_WINDOW = 10;

type Row = { kind: 'floor' } | { kind: 'role'; id: string };

export function RepoModelsView(props: { repoPath: string; onClose: () => void }): ReactElement {
	const svc = useServices();
	const ui = useUi();
	const { repoPath } = props;

	const [raw, setRaw] = useState<Record<string, unknown> | undefined>(undefined);
	const [defs, setDefs] = useState<ModelDefinitionsResult | undefined>(undefined);
	const [error, setError] = useState<ReturnType<typeof daemonProblem> | undefined>(undefined);
	const [sel, setSel] = useState(0);
	const [prompt, setPrompt] = useState<Row | undefined>(undefined);
	const [nonce, setNonce] = useState(0);
	// A write and the reload after it are in flight: each edit writes the whole tasks map, so the next waits for the fresh one.
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let live = true;
		setError(undefined);
		void (async () => {
			try {
				const cfg = await svc.config.show();
				const d = await svc.models.definitions();
				if (live) { setRaw(cfg); setDefs(d); }
			} catch (err) {
				if (live) setError(daemonProblem(err));
			} finally {
				if (live) setSaving(false);
			}
		})();
		return () => { live = false; };
	}, [svc, nonce]);

	useEffect(() => () => ui.capture(false), [ui]);

	const models = isObj(raw?.['models']) ? raw!['models'] as Record<string, unknown> : {};
	const byRepo = isObj(models['byRepo']) ? models['byRepo'] as Record<string, unknown> : {};
	const entry = isObj(byRepo[repoPath]) ? byRepo[repoPath] as Record<string, unknown> : {};
	const tasks = isObj(entry['tasks']) ? entry['tasks'] as Record<string, TierName> : undefined;
	const coreFloor = typeof entry['coreFloor'] === 'string' ? entry['coreFloor'] : undefined;

	const roles = reasoningRoleTaxonomy().roles;
	const rows: Row[] = [{ kind: 'floor' }, ...roles.map((r): Row => ({ kind: 'role', id: r.id }))];
	const cur = rows[Math.min(sel, rows.length - 1)];
	const global = useMemo(() => (defs === undefined ? undefined : computeEffectiveTiers(parseTiering(models), defs)), [raw, defs]);

	const save = (path: string[], value: unknown): void => {
		setSaving(true);
		void svc.config.write(path, value)
			.then((res: ConfigWriteResult) => {
				ui.toast(!res.ok
					? `✗ not saved: ${res.reason ?? 'refused'}${res.detail !== undefined ? ` — ${res.detail}` : ''}`
					: `saved ${path.join(' › ')}${res.restartRequired === true ? ' — restart the daemon to apply' : ''}`);
				setNonce(n => n + 1);
			})
			.catch((err: unknown) => { ui.toast(`✗ save failed: ${err instanceof Error ? err.message : String(err)}`); setNonce(n => n + 1); });
	};

	const commit = (row: Row, input: string): void => {
		setPrompt(undefined); ui.capture(false);
		const v = input.trim();
		const clear = v.length === 0 || v === 'global';
		if (!clear && !isTierName(v)) { ui.toast('✗ tier must be core | mid | cheap, or global to clear'); return; }
		const tier = clear ? null : v as TierName;
		if (row.kind === 'floor') save(['models', 'byRepo', repoPath, 'coreFloor'], tier);
		else save(['models', 'byRepo', repoPath, 'tasks'], nextRoleTiers(tasks, row.id, tier));
	};

	useInput((input, key) => {
		if (key.escape) { props.onClose(); return; }
		if (error !== undefined) { if (input === 'r') setNonce(n => n + 1); return; }
		if (key.upArrow || input === 'k') { setSel(s => Math.max(0, s - 1)); return; }
		if (key.downArrow || input === 'j') { setSel(s => Math.min(rows.length - 1, s + 1)); return; }
		// A reload while a save is in flight could finish first and unlock editing on the old snapshot.
		if (input === 'r') { if (!saving) setNonce(n => n + 1); return; }
		if (input === 'e' && cur !== undefined) {
			if (saving) { ui.toast('saving — edit again once the view reloads'); return; }
			setPrompt(cur); ui.capture(true);
		}
	}, { isActive: prompt === undefined });

	const title = `Repos · models · ${repoPath}`;
	if (error !== undefined) {
		return (
			<Panel title={title} active>
				<Text color="red">{error.down ? REPO_MODELS_DOWN : error.text}</Text>
				<Box marginTop={1}><KeyHints hints={[['r', 'retry'], ['esc', 'back']]} /></Box>
			</Panel>
		);
	}
	if (raw === undefined || defs === undefined || global === undefined) return <Panel title={title} active><Text dimColor>loading…</Text></Panel>;

	if (prompt !== undefined) {
		const label = prompt.kind === 'floor' ? 'repo coreFloor (core/mid/cheap, or global to clear):' : `${prompt.id} tier in this repo (core/mid/cheap, or global to clear):`;
		const initial = prompt.kind === 'floor' ? (coreFloor ?? 'global') : (tasks?.[prompt.id] ?? 'global');
		return (
			<Panel title={title} active>
				<TextPrompt label={label} initial={initial} onSubmit={v => commit(prompt, v)} onCancel={() => { setPrompt(undefined); ui.capture(false); }} />
			</Panel>
		);
	}

	const roleSel = Math.max(0, sel - 1);
	const start = Math.max(0, Math.min(roleSel - Math.floor(ROLE_WINDOW / 2), Math.max(0, roles.length - ROLE_WINDOW)));
	const mark = (i: number): string => (i === sel ? '›' : ' ');
	const hi = (i: number): { color?: 'cyan' } => (i === sel ? { color: 'cyan' } : {});

	return (
		<Panel title={title} active>
			<Text bold>Global tiers <Text dimColor>(read-only — edit them in the Model Tiers pane)</Text></Text>
			{TIER_NAMES.map(t => {
				const tier = global.tiers[t];
				return <Text key={t} dimColor>{`  ${t.padEnd(5)} ${familyOf(defs, tier.runner)?.displayName ?? tier.runner} / ${tier.model || '(cli default)'}`}</Text>;
			})}
			<Box marginTop={1}><Text {...hi(0)}>{`${mark(0)}coreFloor  ${coreFloor ?? 'global'}`}</Text></Box>
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Roles <Text dimColor>({roles.length}) — this repo's tier, or global</Text></Text>
				{roles.slice(start, start + ROLE_WINDOW).map((r, k) => {
					const idx = 1 + start + k;
					return <Text key={r.id} {...hi(idx)}>{`${mark(idx)}${r.id.padEnd(30)} ${tasks?.[r.id] ?? 'global'}`}</Text>;
				})}
				{roles.length > ROLE_WINDOW && <Text dimColor>  … {roles.length - ROLE_WINDOW} more (↑/↓ to scroll)</Text>}
			</Box>
			<Box marginTop={1}><KeyHints hints={[['↑/↓', 'select'], ['e', 'edit'], ['r', 'reload'], ['esc', 'back']]} /></Box>
		</Panel>
	);
}
