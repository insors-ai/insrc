/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Model Tiers pane — view + edit the per-role model tiering
 * (`models.analyze.tiers` / `coreFloor` / `roleTiers`). Renders the EFFECTIVE
 * tier for each role by overlaying config onto the built-in DEFAULT_TIERS + the
 * role taxonomy (see `computeEffectiveTiers`), then lets you edit a tier's
 * runner/model, the coreFloor, or a role's override. All reads/writes go
 * through the daemon-owned config service (`show`/`write`/`reload`); each edit
 * persists one dot-path (a sparse delta), so config.json stays minimal.
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { parseTiering, type TierName } from '../../config/analyze.js';
import { useServices, useUi, useCaptured } from '../ui/context.js';
import { Panel, KeyHints, TextPrompt } from '../ui/widgets.js';
import {
	computeEffectiveTiers, tierFieldPath, roleTierPath, CORE_FLOOR_PATH, isTierName,
	ROLE_TIERS_PATH, nextRoleTiers,
	type EffectiveTiers, type EffectiveRole,
} from './model-tiers.js';

function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A flat, navigable editable row over the effective tiers. */
type Row =
	| { kind: 'tier'; tier: TierName; field: 'runner' | 'model'; label: string; value: string; path: string }
	| { kind: 'floor'; label: string; value: string; path: string }
	| { kind: 'role'; role: EffectiveRole; label: string; value: string; path: string };

function buildRows(eff: EffectiveTiers): Row[] {
	const rows: Row[] = [];
	for (const tier of ['core', 'mid', 'cheap'] as const) {
		rows.push({ kind: 'tier', tier, field: 'runner', label: `${tier}.runner`, value: eff.tiers[tier].runner, path: tierFieldPath(tier, 'runner') });
		rows.push({ kind: 'tier', tier, field: 'model',  label: `${tier}.model`,  value: eff.tiers[tier].model  || '(cli default)', path: tierFieldPath(tier, 'model') });
	}
	rows.push({ kind: 'floor', label: 'coreFloor', value: eff.coreFloor, path: CORE_FLOOR_PATH });
	for (const r of eff.roles) {
		rows.push({ kind: 'role', role: r, label: r.id, value: r.effectiveTier, path: roleTierPath(r.id) });
	}
	return rows;
}

const ROLE_WINDOW = 10;

export function ModelTiersPane(): ReactElement {
	const svc = useServices();
	const ui = useUi();
	const captured = useCaptured();

	const [raw, setRaw] = useState<Record<string, unknown> | undefined>(undefined);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);
	const [malformed, setMalformed] = useState(false);
	const [sel, setSel] = useState(0);
	const [editing, setEditing] = useState<Row | undefined>(undefined);
	const [nonce, setNonce] = useState(0);

	// Load the config snapshot (daemon owns config I/O — never open config.json here).
	useEffect(() => {
		let live = true;
		setLoading(true); setError(undefined);
		svc.config.show()
			.then(cfg => { if (live) { setRaw(cfg); } })
			.catch((err: unknown) => { if (live) setError(err instanceof Error ? err.message : String(err)); })
			.finally(() => { if (live) setLoading(false); });
		return () => { live = false; };
	}, [svc, nonce]);

	const eff = useMemo<EffectiveTiers | undefined>(() => {
		if (raw === undefined) return undefined;
		const models = raw['models'];
		const analyze = isObj(models) ? models['analyze'] : undefined;
		if (analyze !== undefined && !isObj(analyze)) { setMalformed(true); return computeEffectiveTiers(parseTiering({})); }
		setMalformed(false);
		return computeEffectiveTiers(parseTiering(isObj(analyze) ? analyze : {}));
	}, [raw]);

	const rows = useMemo<Row[]>(() => (eff !== undefined ? buildRows(eff) : []), [eff]);
	const cur = rows[Math.min(sel, Math.max(0, rows.length - 1))];

	const commit = (row: Row, input: string): void => {
		const v = input.trim();
		// Empty submit is a no-op cancel.
		if (v.length === 0) { setEditing(undefined); ui.capture(false); return; }
		let path = row.path;
		let value: unknown = v;
		if (row.kind === 'tier' && row.field === 'runner') {
			if (v !== 'ollama' && v !== 'cli-claude' && v !== 'cli-codex') { ui.toast(`✗ runner must be ollama | cli-claude | cli-codex`); setEditing(undefined); ui.capture(false); return; }
		} else if (row.kind === 'floor') {
			if (!isTierName(v)) { ui.toast(`✗ coreFloor must be core | mid | cheap`); setEditing(undefined); ui.capture(false); return; }
		} else if (row.kind === 'role') {
			if (!isTierName(v)) { ui.toast(`✗ tier must be core | mid | cheap`); setEditing(undefined); ui.capture(false); return; }
			// Role ids contain dots (e.g. "context.assemble", "design.contract.detail").
			// The daemon's config.write splits the path on every '.', so a per-role
			// dotted path (models.analyze.roleTiers.context.assemble) would MIS-NEST as
			// roleTiers.context.assemble — unreadable by parseTiering (which reads the
			// flat key roleTiers["context.assemble"]). Instead write the WHOLE roleTiers
			// map at the dotless path so the flat dotted key is preserved.
			const models  = isObj(raw?.['models'])    ? raw!['models']    as Record<string, unknown> : {};
			const analyze = isObj(models['analyze'])  ? models['analyze']  as Record<string, unknown> : {};
			const current = isObj(analyze['roleTiers'])
				? (analyze['roleTiers'] as Record<string, TierName>) : undefined;
			// Reverting to the taxonomy default clears the override (sparse — no redundant key).
			const taxDefault = row.role.assignedTier === row.role.effectiveTier && row.role.source === 'taxonomy';
			const clear = v === (taxDefault ? row.role.assignedTier : undefined);
			// Critical role below floor: the coreFloor guard clamps it up; note it rather than block.
			if (row.role.criticality === 'critical' && eff !== undefined) {
				const rank = { cheap: 0, mid: 1, core: 2 } as const;
				if (rank[v] < rank[eff.coreFloor]) ui.toast(`note: ${row.role.id} is critical — coreFloor raises it to ${eff.coreFloor}`);
			}
			path = ROLE_TIERS_PATH;
			value = nextRoleTiers(current, row.role.id, clear ? null : v);
		}
		setEditing(undefined); ui.capture(false);
		void svc.config.write(path, value)
			.then(res => res.ok ? svc.config.reload() : Promise.reject(new Error('write rejected')))
			.then(() => { ui.toast(`saved ${path}`); setNonce(n => n + 1); })
			.catch((err: unknown) => ui.toast(`✗ save failed: ${err instanceof Error ? err.message : String(err)}`));
	};

	useInput((input, key) => {
		if (rows.length === 0) return;
		if (key.upArrow || input === 'k') { setSel(s => Math.max(0, s - 1)); return; }
		if (key.downArrow || input === 'j') { setSel(s => Math.min(rows.length - 1, s + 1)); return; }
		if (input === 'e' && cur !== undefined) {
			const initial = cur.kind === 'role' ? cur.role.assignedTier : (cur.kind === 'tier' && cur.field === 'model' ? '' : cur.value);
			setEditing({ ...cur, value: initial });
			ui.capture(true);
			return;
		}
		if (input === 'r') { setNonce(n => n + 1); return; }
	}, { isActive: editing === undefined && !captured && !loading && error === undefined });

	if (loading) return <Panel title="Model Tiers" active><Text dimColor>loading config…</Text></Panel>;
	if (error !== undefined) {
		return (
			<Panel title="Model Tiers" active>
				<Text color="red">could not load tiering config — {error}</Text>
				<Box marginTop={1}><KeyHints hints={[['r', 'retry']]} /></Box>
			</Panel>
		);
	}
	if (eff === undefined || cur === undefined) return <Panel title="Model Tiers" active><Text dimColor>no config</Text></Panel>;

	if (editing !== undefined) {
		const label = editing.kind === 'role'
			? `${editing.label} tier (core/mid/cheap, or the default to clear):`
			: editing.kind === 'floor' ? 'coreFloor (core/mid/cheap):'
			: `${editing.label} (${editing.field === 'runner' ? 'ollama/cli-claude/cli-codex' : 'model id'}):`;
		return (
			<Panel title="Model Tiers" active>
				<TextPrompt label={label} initial={editing.value} onSubmit={v => commit(editing, v)} onCancel={() => { setEditing(undefined); ui.capture(false); }} />
			</Panel>
		);
	}

	// Window the role rows around the selection so the list fits the terminal.
	const CONFIG_ROWS = 7; // 6 tier fields + coreFloor
	const roleSel = Math.max(0, sel - CONFIG_ROWS);
	const start = Math.max(0, Math.min(roleSel - Math.floor(ROLE_WINDOW / 2), Math.max(0, eff.roles.length - ROLE_WINDOW)));
	const shown = eff.roles.slice(start, start + ROLE_WINDOW);

	const rowMark = (i: number): string => (i === sel ? '›' : ' ');
	/** Highlight-color spread (avoids passing color:undefined under exactOptionalPropertyTypes). */
	const hi = (active: boolean): { color?: 'cyan' } => (active ? { color: 'cyan' } : {});

	return (
		<Panel title="Model Tiers" active>
			{malformed && <Text color="yellow">⚠ models.analyze is malformed — showing built-in defaults; editing writes fresh keys</Text>}
			<Box flexDirection="column">
				<Text bold>Tiers <Text dimColor>(runner / model)</Text></Text>
				{(['core', 'mid', 'cheap'] as const).map(t => {
					const iR = rows.findIndex(r => r.kind === 'tier' && r.tier === t && r.field === 'runner');
					const iM = iR + 1;
					const src = eff.tierSource[t];
					return (
						<Text key={t}>
							{`  ${t.padEnd(5)} `}
							<Text {...hi(sel === iR)}>{rowMark(iR)}{eff.tiers[t].runner}</Text>
							{' / '}
							<Text {...hi(sel === iM)}>{rowMark(iM)}{eff.tiers[t].model || '(cli default)'}</Text>
							<Text dimColor> {src === 'default' ? '(default)' : '(set)'}</Text>
						</Text>
					);
				})}
			</Box>
			<Box marginTop={1}>
				<Text>coreFloor  </Text>
				<Text {...hi(sel === 6)}>{rowMark(6)}{eff.coreFloor}</Text>
				<Text dimColor> {eff.coreFloorSource === 'default' ? '(default)' : '(set)'} · critical roles never resolve below this</Text>
			</Box>
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Roles <Text dimColor>({eff.roles.length}) — effective tier</Text></Text>
				{shown.map((r, k) => {
					const idx = CONFIG_ROWS + start + k;
					return (
						<Text key={r.id} {...hi(sel === idx)}>
							{`${rowMark(idx)}${r.id.padEnd(30)} `}
							<Text color={tierColor(r.effectiveTier)}>{r.effectiveTier}</Text>
							{r.source === 'override' ? <Text color="yellow"> (override)</Text> : <Text dimColor> (default)</Text>}
							{r.clamped ? <Text color="magenta"> ↑floor</Text> : <Text />}
						</Text>
					);
				})}
				{eff.roles.length > ROLE_WINDOW && <Text dimColor>  … {eff.roles.length - ROLE_WINDOW} more (↑/↓ to scroll)</Text>}
			</Box>
			{eff.staleOverrides.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="yellow">Stale overrides <Text dimColor>(role not in the current taxonomy — preserved)</Text></Text>
					{eff.staleOverrides.map(s => <Text key={s.id} dimColor>  {s.id} → {s.tier}</Text>)}
				</Box>
			)}
			<Box marginTop={1}>
				<KeyHints hints={[['↑/↓', 'select'], ['e', 'edit'], ['r', 'reload']]} />
			</Box>
		</Panel>
	);
}

function tierColor(t: TierName): string {
	return t === 'core' ? 'green' : t === 'mid' ? 'cyan' : 'gray';
}
