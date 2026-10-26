/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The unknown-model check screen (Epic ce99b72065d03b1b, Story s5), opened by the
 * Model Tiers pane for a model id its family does not serve.
 *
 * The user names the effort levels to check (default: the effort names the
 * family's models list), the daemon checks the model through the family's CLI
 * (models.check), and the screen shows each level's verdict with its evidence.
 * Approve records the decision (models.approve) but saves nothing: the running
 * daemon still uses its cached definitions, which may even list the id as
 * rejected, so the tier is saved only after a restart (R = restart, then save).
 * The approval is never sent twice. A connection lost mid-request is shown as
 * an interrupted check, or — for a decision — as an unknown outcome the user
 * resolves by reloading the definitions.
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import type { TierName } from '../../config/analyze.js';
import type { CliFamilyId } from '../../daemon/model-catalog.js';
import type { DecisionResult, ModelCheckResult, ModelDefinitionsResult } from '../services/models.js';
import { useServices, useUi } from '../ui/context.js';
import { Panel, KeyHints, TextPrompt } from '../ui/widgets.js';
import { familyOf, servedModel, tierPath } from './model-tiers.js';

export interface ModelCheckTarget {
	readonly tier:    TierName;
	readonly family:  string;
	readonly modelId: string;
}

type Step =
	| { kind: 'claims' }
	| { kind: 'checking' }
	| { kind: 'refused'; error: string; served?: { readonly id: string; readonly defs: ModelDefinitionsResult } | undefined }
	| { kind: 'expired' }
	| { kind: 'result'; result: ModelCheckResult }
	| { kind: 'interrupted' }
	| { kind: 'deciding' }
	| { kind: 'approved'; efforts: readonly string[]; busy: boolean; problem?: string | undefined }
	| { kind: 'unknown'; action: 'approve' | 'reject'; status?: string | undefined };

/** A request whose connection was lost after it was sent (the daemon may have carried it out). */
function disconnected(err: unknown): boolean {
	return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'disconnected';
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const VERDICT: Record<string, string> = { accepted: 'accepted', rejected: 'rejected', 'recognised-unconfirmed': 'recognised — unconfirmed' };

export function ModelCheckScreen(props: {
	target: ModelCheckTarget;
	defs: ModelDefinitionsResult;
	/** saved: the tier was written; restartRequired: that write still needs a daemon restart to apply. */
	onClose: (saved: boolean, restartRequired?: boolean) => void;
	/** The id turned out to be served already (the definitions changed): save it as a normal pick, resolved against the fresh definitions. */
	onPickServed: (modelId: string, defs: ModelDefinitionsResult) => void;
}): ReactElement {
	const svc = useServices();
	const ui = useUi();
	const { target, defs } = props;
	const family = familyOf(defs, target.family);
	const kind = family?.cliKind ?? target.family;
	const defaultClaims = [...new Set((family?.models ?? []).flatMap(m => m.efforts))];

	const [step, setStep] = useState<Step>({ kind: 'claims' });
	const [claimed, setClaimed] = useState<readonly string[]>(defaultClaims);
	const [allowed, setAllowed] = useState<ReadonlySet<string>>(new Set());
	const [cursor, setCursor] = useState(0);

	useEffect(() => { ui.capture(step.kind === 'claims'); }, [step.kind, ui]);
	useEffect(() => () => ui.capture(false), [ui]);
	// A restart-then-save still running when the screen goes away must not write the tier.
	const live = useRef(true);
	useEffect(() => () => { live.current = false; }, []);

	const runCheck = (efforts: readonly string[]): void => {
		setClaimed(efforts);
		setStep({ kind: 'checking' });
		svc.models.check({ family: target.family as CliFamilyId, modelId: target.modelId, claimedEfforts: efforts })
			.then(r => {
				if (!('checkId' in r)) {
	const error = r.error;
	setStep({ kind: 'refused', error });
	// The daemon refuses an id it already serves: if the fresh definitions list it, offer it as a normal pick.
	svc.models.definitions()
		.then(d => { const served = servedModel(d, target.family, target.modelId); if (served !== undefined && live.current) setStep({ kind: 'refused', error, served: { id: served.id, defs: d } }); })
		.catch(() => { /* nothing to offer: the refusal is already shown */ });
	return;
}
				setAllowed(new Set(r.efforts.filter(e => e.verdict !== 'rejected').map(e => e.effort)));
				setCursor(0);
				setStep({ kind: 'result', result: r });
			})
			.catch((err: unknown) => setStep(disconnected(err) ? { kind: 'interrupted' } : { kind: 'refused', error: message(err) }));
	};

	const decide = (action: 'approve' | 'reject', result: ModelCheckResult): void => {
		const efforts = result.efforts.filter(e => allowed.has(e.effort)).map(e => e.effort);
		setStep({ kind: 'deciding' });
		const call: Promise<DecisionResult> = action === 'approve'
			? svc.models.approve({ checkId: result.checkId, efforts })
			: svc.models.reject({ checkId: result.checkId });
		call.then(d => {
			if (!d.ok) {
	ui.toast(`✗ ${d.reason}: ${d.detail}`);
	// unknown-check: the daemon no longer holds this check (a restart or eviction) — only a fresh check helps.
	setStep(d.reason === 'unknown-check' ? { kind: 'expired' } : { kind: 'result', result });
	return;
}
			if (action === 'reject') { ui.toast(`rejected ${target.modelId} — restart the daemon to apply`); props.onClose(false); return; }
			setStep({ kind: 'approved', efforts, busy: false });
		}).catch((err: unknown) => {
			if (disconnected(err)) setStep({ kind: 'unknown', action });
			else { ui.toast(`✗ ${message(err)}`); setStep({ kind: 'result', result }); }
		});
	};

	/** Restart, then — only if it worked — save the tier. The approval is not sent again. */
	const restartThenSave = (efforts: readonly string[]): void => {
		const task = ui.task('restarting the daemon…');
		setStep({ kind: 'approved', efforts, busy: true, problem: 'restarting…' });
		void (async () => {
			try {
				const res = await svc.daemon.restart(line => task.push(line));
				if (!res.ok) throw new Error(res.error ?? 'unknown error');
				task.done('daemon restarted');
			} catch (err) {
				task.fail(`restart failed: ${message(err)}`);
				if (live.current) setStep({ kind: 'approved', efforts, busy: false, problem: `approval recorded; restart failed: ${message(err)} — the tier was not saved (R retries)` });
				return;
			}
			if (!live.current) return;
			try {
				const saved = await svc.config.write(tierPath(target.tier), { runner: target.family, model: target.modelId, effort: efforts[0] ?? '' });
				if (!saved.ok) {
					setStep({ kind: 'approved', efforts, busy: false, problem: `approval recorded; the tier was not saved: ${saved.reason ?? 'refused'}${saved.detail !== undefined ? ` — ${saved.detail}` : ''}` });
					return;
				}
				const restartRequired = saved.restartRequired === true;
				ui.toast(`saved ${tierPath(target.tier)} = ${target.modelId}${restartRequired ? ' — restart the daemon to apply (R)' : ''}`);
				props.onClose(true, restartRequired);
			} catch (err) {
				setStep({ kind: 'approved', efforts, busy: false, problem: `approval recorded; the tier was not saved: ${message(err)}` });
			}
		})();
	};

	/** After a lost connection: read the definitions to see whether the decision was recorded. */
	const reload = (action: 'approve' | 'reject'): void => {
		svc.models.definitions()
			.then(d => {
				const f = familyOf(d, target.family);
				const approved = f?.models.some(m => m.id === target.modelId && m.source === 'user-approved') === true;
				const rejected = f?.rejectedModels?.includes(target.modelId) === true;
				setStep({ kind: 'unknown', action, status: approved ? 'recorded: approved — restart the daemon to use it'
					: rejected ? 'recorded: rejected'
					: 'not visible yet: a decision applies after a daemon restart; restart and reload, or check again' });
			})
			.catch((err: unknown) => setStep({ kind: 'unknown', action, status: `could not reload: ${message(err)}` }));
	};

	useInput((input, key) => {
		if (step.kind === 'approved' && step.busy) return;   // restart / save in progress
		if (key.escape) { props.onClose(false); return; }
		if ((step.kind === 'interrupted' || step.kind === 'expired') && input === 'c') { runCheck(claimed); return; }
		if (step.kind === 'refused' && step.served !== undefined && input === 's') { props.onPickServed(step.served.id, step.served.defs); return; }
		if (step.kind === 'unknown' && input === 'l') { reload(step.action); return; }
		if (step.kind === 'unknown' && input === 'c') { runCheck(claimed); return; }
		if (step.kind === 'approved' && input === 'R') { restartThenSave(step.efforts); return; }
		if (step.kind !== 'result') return;
		const { result } = step;
		if (input === 'x') { decide('reject', result); return; }
		// A model that does not run can only be rejected (or left): no levels to pick, nothing to approve.
		if (!result.runs) return;
		if (key.upArrow || input === 'k') { setCursor(c => Math.max(0, c - 1)); return; }
		if (key.downArrow || input === 'j') { setCursor(c => Math.min(result.efforts.length - 1, c + 1)); return; }
		if (input === ' ') {
			const e = result.efforts[cursor];
			if (e === undefined || e.verdict === 'rejected') return;
			setAllowed(prev => { const next = new Set(prev); if (next.has(e.effort)) next.delete(e.effort); else next.add(e.effort); return next; });
			return;
		}
		if (input === 'a') decide('approve', result);
	}, { isActive: step.kind !== 'claims' });

	const title = <Text bold>Check {target.modelId} through the {kind} CLI <Text dimColor>({target.tier} tier)</Text></Text>;

	if (step.kind === 'claims') {
		return (
			<Panel title="Model Tiers" active>
				{title}
				<TextPrompt
					label="Claimed efforts (comma-separated; empty for none):"
					initial={defaultClaims.join(', ')}
					onSubmit={v => runCheck(v.split(',').map(x => x.trim()).filter(x => x.length > 0))}
					onCancel={() => props.onClose(false)}
				/>
			</Panel>
		);
	}

	return (
		<Panel title="Model Tiers" active>
			{title}
			{step.kind === 'checking' && <Text dimColor>checking {target.modelId} through the {kind} CLI…</Text>}
			{step.kind === 'deciding' && <Text dimColor>recording the decision…</Text>}
			{step.kind === 'refused' && <Text color="red">{step.error}</Text>}
{step.kind === 'refused' && step.served !== undefined && <Text>{`${step.served.id} is served by the family now — save it as the ${target.tier} model (s)`}</Text>}
{step.kind === 'expired' && <Text color="yellow">the daemon no longer holds this check (it restarted or dropped it) — check again (c)</Text>}
			{step.kind === 'interrupted' && <Text color="yellow">the check was interrupted: the daemon closed the connection — check again (c)</Text>}
			{step.kind === 'unknown' && (
				<Box flexDirection="column">
					<Text color="yellow">outcome unknown: the daemon disconnected before answering — reload (l) to see whether the {step.action === 'approve' ? 'approval' : 'rejection'} was recorded</Text>
					{step.status !== undefined && <Text>{step.status}</Text>}
				</Box>
			)}
			{step.kind === 'approved' && (
				<Box flexDirection="column">
					<Text bold>Approved {target.modelId} (levels: {step.efforts.length > 0 ? step.efforts.join(', ') : 'none'}) — restart the daemon to use it</Text>
					{step.problem !== undefined && <Text {...(step.busy ? { dimColor: true } : { color: 'red' })}>{step.problem}</Text>}
				</Box>
			)}
			{step.kind === 'result' && (
				<Box flexDirection="column">
					{step.result.efforts.length === 0 && <Text dimColor>no effort levels claimed</Text>}
					{step.result.efforts.map((e, i) => {
						const verdict = `${e.effort} — ${VERDICT[e.verdict] ?? e.verdict}: ${e.evidence}`;
						if (!step.result.runs) return <Text key={e.effort}>{`  ${verdict}`}</Text>;
						return (
							<Text key={e.effort} {...(i === cursor ? { color: 'cyan' } : {})}>
								{`${i === cursor ? '›' : ' '}[${allowed.has(e.effort) ? 'x' : ' '}] ${verdict}`}
							</Text>
						);
					})}
					<Text dimColor>runs: {step.result.runs ? 'yes' : 'no'}{step.result.inputLimit !== undefined ? ` · input limit: ${step.result.inputLimit.max} ${step.result.inputLimit.unit}` : ''}</Text>
					{step.result.error !== undefined && <Text color="red">{step.result.error}</Text>}
				</Box>
			)}
			<Box marginTop={1}>
				{/* Keyed by the hint set: a remount, so a hint that moves (esc) never keeps a stale layout. */}
				<KeyHints key={step.kind === 'result' ? `result:${step.result.runs}` : step.kind} hints={
					step.kind === 'result'
						? (step.result.runs
						? [['↑/↓', 'select'], ['space', 'allow level'], ['a', 'approve'], ['x', 'reject'], ['esc', 'back']]
						: [['x', 'reject'], ['esc', 'back']])
						: step.kind === 'approved' ? (step.busy ? [] : [['R', 'restart and save'], ['esc', 'later']])
: step.kind === 'refused' && step.served !== undefined ? [['s', 'save as the tier model'], ['esc', 'back']]
: step.kind === 'expired' ? [['c', 'check again'], ['esc', 'back']]
						: step.kind === 'interrupted' ? [['c', 'check again'], ['esc', 'back']]
						: step.kind === 'unknown' ? [['l', 'reload'], ['c', 'check again'], ['esc', 'back']]
						: [['esc', 'back']]
				} />
			</Box>
		</Panel>
	);
}
