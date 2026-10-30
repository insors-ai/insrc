/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Model Tiers pane — view + edit the global model tiers, the coreFloor and the
 * per-role tier map (Epic ce99b72065d03b1b, Story s5). Every family, model and
 * effort it offers comes from the daemon's model definitions (models.definitions);
 * the TUI holds no list of its own (k2). A tier is always written whole —
 * { runner, model, effort } with one config.write — so a runner is never saved
 * with another family's model. A model its family does not serve is typed with
 * `n` and goes through the unknown-model check screen; the pane never saves it
 * directly. A family with a `host` runs its CLI on Ollama (Epic b220bb61, Story
 * s3): its models are a closed list labelled cloud or local, `n` is withheld,
 * and an undeclared model is shown as not supported (the tier does not run).
 * All config I/O goes through the daemon (config.show / config.write).
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { parseTiering, type TierModel, type TierName } from '../../config/analyze.js';
import type { ConfigWriteResult } from '../services/config.js';
import { daemonProblem, type ModelDefinitionsResult } from '../services/models.js';
import { useServices, useUi, useCaptured } from '../ui/context.js';
import { Panel, KeyHints, TextPrompt } from '../ui/widgets.js';
import {
	computeEffectiveTiers, CORE_FLOOR_PATH, isTierName, ROLE_TIERS_PATH, nextRoleTiers, TIER_NAMES,
	tierPath, switchFamily, switchModel, effortChoices, nextInCycle, resolveTypedModel, familyOf, servedModel,
	type EffectiveTiers, type EffectiveRole,
} from './model-tiers.js';
import { ModelCheckScreen, type ModelCheckTarget } from './ModelCheckScreen.js';

function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A flat, navigable row: one per tier, the coreFloor, then one per role. */
type Row =
	| { kind: 'tier'; tier: TierName }
	| { kind: 'floor' }
	| { kind: 'role'; role: EffectiveRole };

type Prompt =
	| { kind: 'model'; tier: TierName }
	| { kind: 'floor' }
	| { kind: 'role'; role: EffectiveRole };

/** The message shown when the daemon cannot answer. */
export const MODEL_TIERS_DOWN = 'the daemon is not running — start it to edit model tiers';

const ROLE_WINDOW = 10;

export function ModelTiersPane(): ReactElement {
	const svc = useServices();
	const ui = useUi();
	const captured = useCaptured();

	const [raw, setRaw] = useState<Record<string, unknown> | undefined>(undefined);
	const [defs, setDefs] = useState<ModelDefinitionsResult | undefined>(undefined);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<ReturnType<typeof daemonProblem> | undefined>(undefined);
	const [malformed, setMalformed] = useState(false);
	const [sel, setSel] = useState(0);
	const [prompt, setPrompt] = useState<Prompt | undefined>(undefined);
	const [checking, setChecking] = useState<ModelCheckTarget | undefined>(undefined);
	const [restartPending, setRestartPending] = useState(false);
	const [nonce, setNonce] = useState(0);
	// A write and the reload after it are in flight: edits write whole objects from the loaded config, so the next waits for the fresh one.
	const [saving, setSaving] = useState(false);

	// Load the config snapshot and the definitions (the daemon owns both).
	useEffect(() => {
		let live = true;
		setLoading(true); setError(undefined);
		void (async () => {
			try {
				const cfg = await svc.config.show();
				const d = await svc.models.definitions();
				if (live) { setRaw(cfg); setDefs(d); }
			} catch (err) {
				if (live) setError(daemonProblem(err));
			} finally {
				if (live) { setLoading(false); setSaving(false); }
			}
		})();
		return () => { live = false; };
	}, [svc, nonce]);

	const eff = useMemo<EffectiveTiers | undefined>(() => {
		if (raw === undefined || defs === undefined) return undefined;
		const models = raw['models'];
		if (models !== undefined && !isObj(models)) { setMalformed(true); return computeEffectiveTiers(parseTiering({}), defs); }
		setMalformed(false);
		return computeEffectiveTiers(parseTiering(isObj(models) ? models : {}), defs);
	}, [raw, defs]);

	const rows = useMemo<Row[]>(() => (eff === undefined ? [] : [
		...TIER_NAMES.map((tier): Row => ({ kind: 'tier', tier })),
		{ kind: 'floor' },
		...eff.roles.map((role): Row => ({ kind: 'role', role })),
	]), [eff]);
	const cur = rows[Math.min(sel, Math.max(0, rows.length - 1))];

	const report = (path: string, res: ConfigWriteResult): void => {
		if (!res.ok) {
			ui.toast(`✗ not saved: ${res.reason ?? 'refused'}${res.detail !== undefined ? ` — ${res.detail}` : ''}`);
		} else {
			if (res.restartRequired === true) setRestartPending(true);
			ui.toast(`saved ${path}${res.restartRequired === true ? ' — restart the daemon to apply (R)' : ''}`);
		}
		setNonce(n => n + 1);
	};

	const save = (path: string, value: unknown): void => {
		setSaving(true);
		void svc.config.write(path, value)
			.then(res => report(path, res))
			.catch((err: unknown) => { ui.toast(`✗ save failed: ${err instanceof Error ? err.message : String(err)}`); setNonce(n => n + 1); });
	};

	const saveTier = (tier: TierName, next: TierModel | undefined): void => {
		if (next === undefined) return;
		save(tierPath(tier), { runner: next.runner, model: next.model, effort: next.effort ?? '' });
	};

	const restart = (): void => {
		const task = ui.task('restarting the daemon…');
		void svc.daemon.restart(line => task.push(line))
			.then(res => {
				if (res.ok) { task.done('daemon restarted'); setRestartPending(false); setNonce(n => n + 1); }
				else task.fail(`restart failed: ${res.error ?? 'unknown error'}`);
			})
			.catch((err: unknown) => task.fail(`restart failed: ${err instanceof Error ? err.message : String(err)}`));
	};

	const closePrompt = (): void => { setPrompt(undefined); ui.capture(false); };

	const commit = (p: Prompt, input: string): void => {
		const v = input.trim();
		closePrompt();
		if (v.length === 0 || eff === undefined || defs === undefined) return;
		if (p.kind === 'model') {
			const tier = eff.tiers[p.tier];
			const typed = resolveTypedModel(defs, tier.runner, v);
			if (typed.kind === 'served') saveTier(p.tier, switchModel(defs, tier, typed.model));
			else if (typed.kind === 'refused') ui.toast(`✗ ${typed.reason}`);
			else setChecking({ tier: p.tier, family: tier.runner, modelId: v });
			return;
		}
		if (!isTierName(v)) { ui.toast('✗ tier must be core | mid | cheap'); return; }
		if (p.kind === 'floor') { save(CORE_FLOOR_PATH, v); return; }
		// Role ids contain dots: the whole tasks map is written at the dotless path so they stay flat keys.
		const models = isObj(raw?.['models']) ? raw!['models'] as Record<string, unknown> : {};
		const current = isObj(models['tasks']) ? models['tasks'] as Record<string, TierName> : undefined;
		const taxDefault = p.role.source === 'taxonomy' && p.role.assignedTier === v;
		if (p.role.criticality === 'critical') {
			const rank = { cheap: 0, mid: 1, core: 2 } as const;
			if (rank[v] < rank[eff.coreFloor]) ui.toast(`note: ${p.role.id} is critical — coreFloor raises it to ${eff.coreFloor}`);
		}
		save(ROLE_TIERS_PATH, nextRoleTiers(current, p.role.id, taxDefault ? null : v));
	};

	useInput((input, key) => {
		if (rows.length === 0 || eff === undefined || defs === undefined || cur === undefined) return;
		if (saving && ['f', 'm', 'e', 'n'].includes(input)) { ui.toast('saving — edit again once the pane reloads'); return; }
		if (key.upArrow || input === 'k') { setSel(s => Math.max(0, s - 1)); return; }
		if (key.downArrow || input === 'j') { setSel(s => Math.min(rows.length - 1, s + 1)); return; }
		if (input === 'r') { setNonce(n => n + 1); return; }
		if (input === 'R' && restartPending) { restart(); return; }
		if (cur.kind === 'tier') {
			const tier = eff.tiers[cur.tier];
			const family = familyOf(defs, tier.runner);
			const hosted = family?.host !== undefined;
			if (input === 'f') {
				const next = nextInCycle(defs.families.map(f => f.id), tier.runner);
				if (next !== undefined) saveTier(cur.tier, switchFamily(defs, cur.tier, next));
				return;
			}
			if (input === 'm') {
				const models = family?.models.map(m => m.id) ?? [];
				const next = nextInCycle(models, tier.model);
				if (next !== undefined) saveTier(cur.tier, switchModel(defs, tier, next));
				return;
			}
			if (input === 'e') {
				if (tier.notSupported) { ui.toast(`${tier.model} is not supported by ${family?.displayName ?? tier.runner}: pick a listed model with m`); return; }
				if (!tier.served) { ui.toast(`${tier.model} is not a listed model: pick one with m, or check it with n`); return; }
				const choices = effortChoices(defs, tier);
				if (hosted && choices.length <= 1) { ui.toast('this model takes no effort setting'); return; }
				const next = nextInCycle(choices, tier.effort ?? '');
				if (next !== undefined) saveTier(cur.tier, { ...tier, effort: next });
				return;
			}
			// A family on a host offers only its listed models: no typed id, no unknown-model check.
			if (input === 'n' && !hosted) { setPrompt({ kind: 'model', tier: cur.tier }); ui.capture(true); return; }
			return;
		}
		if (input === 'e') {
			setPrompt(cur.kind === 'floor' ? { kind: 'floor' } : { kind: 'role', role: cur.role });
			ui.capture(true);
		}
	}, { isActive: prompt === undefined && checking === undefined && !captured && !loading && error === undefined });

	// The not-running / cannot-answer screen: r retries once the daemon is back.
	useInput(input => { if (input === 'r') setNonce(n => n + 1); }, { isActive: error !== undefined && !captured && !loading });

	if (loading) return <Panel title="Model Tiers" active><Text dimColor>loading config and model definitions…</Text></Panel>;
	if (error !== undefined) {
		return (
			<Panel title="Model Tiers" active>
				<Text color="red">{error.down ? MODEL_TIERS_DOWN : error.text}</Text>
				<Box marginTop={1}><KeyHints hints={[['r', 'retry']]} /></Box>
			</Panel>
		);
	}
	if (eff === undefined || defs === undefined || cur === undefined) return <Panel title="Model Tiers" active><Text dimColor>no config</Text></Panel>;

	if (checking !== undefined) {
		const target = checking;
		return (
			<ModelCheckScreen
				target={target}
				defs={defs}
				onClose={(saved, restartRequired) => { setChecking(undefined); if (restartRequired === true) setRestartPending(true); if (saved) setNonce(n => n + 1); }}
				onPickServed={(id, fresh) => { setChecking(undefined); saveTier(target.tier, switchModel(fresh, eff.tiers[target.tier], id)); }}
			/>
		);
	}

	if (prompt !== undefined) {
		const label = prompt.kind === 'model'
			? `${prompt.tier} model id for ${familyOf(defs, eff.tiers[prompt.tier].runner)?.displayName ?? eff.tiers[prompt.tier].runner} (a listed id or alias, or a new one to check):`
			: prompt.kind === 'floor' ? 'coreFloor (core/mid/cheap):'
			: `${prompt.role.id} tier (core/mid/cheap, or the default to clear):`;
		const initial = prompt.kind === 'role' ? prompt.role.assignedTier : prompt.kind === 'floor' ? eff.coreFloor : '';
		return (
			<Panel title="Model Tiers" active>
				<TextPrompt label={label} initial={initial} onSubmit={v => commit(prompt, v)} onCancel={closePrompt} />
			</Panel>
		);
	}

	// Window the role rows around the selection so the list fits the terminal.
	const CONFIG_ROWS = TIER_NAMES.length + 1;
	const roleSel = Math.max(0, sel - CONFIG_ROWS);
	const start = Math.max(0, Math.min(roleSel - Math.floor(ROLE_WINDOW / 2), Math.max(0, eff.roles.length - ROLE_WINDOW)));
	const shown = eff.roles.slice(start, start + ROLE_WINDOW);

	const rowMark = (i: number): string => (i === sel ? '›' : ' ');
	/** Highlight-color spread (avoids passing color:undefined under exactOptionalPropertyTypes). */
	const hi = (active: boolean): { color?: 'cyan' } => (active ? { color: 'cyan' } : {});

	return (
		<Panel title="Model Tiers" active>
			{malformed && <Text color="yellow">⚠ models is malformed — showing the definitions' defaults; editing writes fresh keys</Text>}
			<Box flexDirection="column">
				<Text bold>Tiers <Text dimColor>(family / model / effort — from the daemon's definitions)</Text></Text>
				{TIER_NAMES.map((t, i) => {
					const tier = eff.tiers[t];
					const family = familyOf(defs, tier.runner)?.displayName ?? tier.runner;
					const model = servedModel(defs, tier.runner, tier.model);
					const aliases = model !== undefined && model.aliases.length > 0 ? ` (${model.aliases.join(', ')})` : '';
					const hosting = tier.hosting !== undefined ? ` [${tier.hosting}]` : '';
					// A served model that does not take the configured effort runs at the CLI's default effort.
					const effortRejected = model !== undefined && tier.effort !== undefined && tier.effort !== '' && !model.efforts.includes(tier.effort);
					return (
						<Text key={t} {...hi(sel === i)}>
							{`${rowMark(i)}${t.padEnd(5)} ${family} / ${tier.model || '(cli default)'}${aliases}${hosting} / ${tier.effort ? tier.effort : '(cli default effort)'}`}
							<Text dimColor> {eff.tierSource[t] === 'default' ? '(default)' : '(set)'}</Text>
							{effortRejected && <Text color="yellow"> not accepted — runs at the CLI default</Text>}
							{tier.notSupported
								? <Text color="red"> not supported by {family}: the tier will not run; pick a listed model with m</Text>
								: !tier.served && <Text color="yellow"> not served: runs the default until approved and the daemon restarted</Text>}
						</Text>
					);
				})}
			</Box>
			{restartPending && <Text color="yellow">restart the daemon to apply (R)</Text>}
			<Box marginTop={1}>
				<Text {...hi(sel === CONFIG_ROWS - 1)}>{rowMark(CONFIG_ROWS - 1)}coreFloor  {eff.coreFloor}</Text>
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
				<KeyHints hints={cur.kind === 'tier'
					? [['↑/↓', 'select'], ['f', 'family'], ['m', 'model'], ...(familyOf(defs, eff.tiers[cur.tier].runner)?.host !== undefined ? [] : [['n', 'new model id'] as const]), ['e', 'effort'], ...(restartPending ? [['R', 'restart daemon'] as const] : []), ['r', 'reload']]
					: [['↑/↓', 'select'], ['e', 'edit'], ...(restartPending ? [['R', 'restart daemon'] as const] : []), ['r', 'reload']]} />
			</Box>
		</Panel>
	);
}

function tierColor(t: TierName): string {
	return t === 'core' ? 'green' : t === 'mid' ? 'cyan' : 'gray';
}
