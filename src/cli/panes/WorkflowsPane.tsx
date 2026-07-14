/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Workflows pane — the Epic chain for the selected repo. The list view
 * shows every Epic (a `DEF-*.json` under `.insrc/artifacts/`); Enter
 * opens a detail view with the chain state + a cursor over the
 * actionable items (the next pending artifact and any pending
 * amendments), which `a` approves and `x` rejects (with a reason).
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { ChainReport } from '../../workflow/chain.js';
import type { AmendmentRecord } from '../../workflow/amendments/types.js';
import type { EpicSummary } from '../services/workflow.js';
import { useServices, useUi } from '../ui/context.js';
import { Panel, KeyHints, TextPrompt } from '../ui/widgets.js';

const APPROVER = process.env['USER'] ?? 'unknown';

type ActionItem =
	| { readonly kind: 'artifact'; readonly path: string; readonly label: string }
	| { readonly kind: 'amendment'; readonly id: string; readonly label: string };

export function WorkflowsPane(props: { repoPath: string; nonce: number }): ReactElement {
	const svc = useServices();
	const [epics, setEpics] = useState<EpicSummary[]>([]);
	const [listCursor, setListCursor] = useState(0);
	const [openHash, setOpenHash] = useState<string | undefined>(undefined);
	const [reload, setReload] = useState(0);

	useEffect(() => {
		try { setEpics(svc.workflow.listEpics(props.repoPath)); }
		catch { setEpics([]); }
	}, [svc, props.repoPath, props.nonce, reload]);

	const inList = openHash === undefined;
	const clamped = Math.min(listCursor, Math.max(0, epics.length - 1));

	useInput((_input, key) => {
		if (!inList) return;
		if (key.upArrow)   setListCursor(c => Math.max(0, c - 1));
		else if (key.downArrow) setListCursor(c => Math.min(epics.length - 1, c + 1));
		else if (key.return && epics[clamped] !== undefined) setOpenHash(epics[clamped]!.epicHash);
	}, { isActive: inList });

	if (!inList) {
		return (
			<EpicDetail
				repoPath={props.repoPath}
				epicHash={openHash}
				onBack={() => setOpenHash(undefined)}
				onChanged={() => setReload(n => n + 1)}
			/>
		);
	}

	return (
		<Panel title={`Workflows · ${short(props.repoPath)}`} active>
			{epics.length === 0
				? <Text dimColor>no Epics under {props.repoPath}/.insrc/artifacts — select a repo in the Repos pane</Text>
				: epics.map((e, i) => (
					<Box key={e.epicHash}>
						<Text {...(i === clamped ? { color: 'cyan' as const } : {})}>{i === clamped ? '❯ ' : '  '}</Text>
						<Text {...(i === clamped ? { color: 'cyan' as const } : {})} bold={i === clamped}>{e.epicSlug ?? e.epicHash}</Text>
						<Text dimColor>  {e.epicHash}</Text>
					</Box>
				))}
			<Box marginTop={1}>
				<KeyHints hints={[['↑/↓', 'select'], ['↵', 'open']]} />
			</Box>
		</Panel>
	);
}

function EpicDetail(props: {
	repoPath: string;
	epicHash: string;
	onBack: () => void;
	onChanged: () => void;
}): ReactElement {
	const svc = useServices();
	const ui = useUi();
	const [report, setReport] = useState<ChainReport | undefined>(undefined);
	const [pending, setPending] = useState<AmendmentRecord[]>([]);
	const [cursor, setCursor] = useState(0);
	const [rejecting, setRejecting] = useState<ActionItem | undefined>(undefined);
	const [reload, setReload] = useState(0);

	useEffect(() => {
		try {
			setReport(svc.workflow.chain(props.repoPath, props.epicHash));
			setPending(svc.workflow.amendments(props.repoPath, props.epicHash).filter(a => a.status === 'pending') as AmendmentRecord[]);
		} catch (err) {
			ui.toast(`✗ ${err instanceof Error ? err.message : String(err)}`);
			props.onBack();
		}
	}, [svc, props.repoPath, props.epicHash, reload]);

	const actions = report !== undefined ? buildActions(report, pending) : [];
	const clamped = Math.min(cursor, Math.max(0, actions.length - 1));
	const focused = actions[clamped];

	const refresh = (): void => { setReload(n => n + 1); props.onChanged(); };

	const doApprove = (item: ActionItem): void => {
		try {
			if (item.kind === 'artifact') {
				const r = svc.workflow.approve(item.path);
				ui.toast(`approved ${r.approval.workflow}${r.tracker !== undefined ? ` · tracker ${r.tracker.status}` : ''}`);
			} else {
				svc.workflow.approveAmendment(props.repoPath, item.id, APPROVER);
				ui.toast(`approved amendment ${item.id}`);
			}
			refresh();
		} catch (err) { ui.toast(`✗ ${err instanceof Error ? err.message : String(err)}`); }
	};

	const doReject = (item: ActionItem, reason: string): void => {
		try {
			if (item.kind === 'artifact') svc.workflow.reject(item.path, reason);
			else svc.workflow.rejectAmendment(props.repoPath, item.id, reason);
			ui.toast(`rejected ${item.kind === 'artifact' ? 'artifact' : item.id}`);
			refresh();
		} catch (err) { ui.toast(`✗ ${err instanceof Error ? err.message : String(err)}`); }
	};

	useInput((input, key) => {
		if (key.escape || input === 'b') { props.onBack(); return; }
		if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
		else if (key.downArrow) setCursor(c => Math.min(actions.length - 1, c + 1));
		else if (input === 'a' && focused !== undefined) doApprove(focused);
		else if (input === 'x' && focused !== undefined) { setRejecting(focused); ui.capture(true); }
	}, { isActive: rejecting === undefined });

	if (rejecting !== undefined) {
		const target = rejecting;
		return (
			<Panel title="Workflows · reject" active>
				<TextPrompt
					label="reason:"
					onCancel={() => { setRejecting(undefined); ui.capture(false); }}
					onSubmit={(reason) => {
						setRejecting(undefined); ui.capture(false);
						if (reason.trim().length > 0) doReject(target, reason.trim());
					}}
				/>
			</Panel>
		);
	}

	if (report === undefined) {
		return <Panel title="Workflows" active><Text dimColor>loading…</Text></Panel>;
	}

	const r = report;
	return (
		<Panel title={`Workflows · ${r.epicSlug ?? r.epicHash}`} active>
			<Text>define  {mark(r.define.exists, r.define.approved, r.define.rejected)}   hld  {mark(r.hld.exists, r.hld.approved, r.hld.rejected)}</Text>
			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>stories</Text>
				{r.stories.map(s => (
					<Text key={s.id}>
						  {s.id} {s.title.slice(0, 40)}  {mark(s.hasLld, s.approved, false)}
						{s.stale ? <Text color="yellow"> STALE({s.staleReason ?? '?'})</Text> : <Text />}
					</Text>
				))}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>next: </Text><Text>{r.nextAction.kind}</Text>
				<Text dimColor>   amendments: {r.amendments.pending} pending / {r.amendments.approved} approved</Text>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>actionable</Text>
				{actions.length === 0
					? <Text dimColor>  (nothing to approve/reject here — run the next workflow via the MCP tool)</Text>
					: actions.map((it, i) => (
						<Text key={it.kind === 'artifact' ? it.path : it.id} {...(i === clamped ? { color: 'cyan' as const } : {})}>
							{i === clamped ? '❯ ' : '  '}{it.label}
						</Text>
					))}
			</Box>

			<Box marginTop={1}>
				<KeyHints hints={[['↑/↓', 'select'], ['a', 'approve'], ['x', 'reject'], ['b/Esc', 'back']]} />
			</Box>
		</Panel>
	);
}

function buildActions(r: ChainReport, pending: readonly AmendmentRecord[]): ActionItem[] {
	const out: ActionItem[] = [];
	const na = r.nextAction;
	if (na.kind === 'approve-define' && r.define.path !== undefined) out.push({ kind: 'artifact', path: r.define.path, label: `approve Define (${short(r.define.path)})` });
	else if (na.kind === 'approve-hld' && r.hld.path !== undefined) out.push({ kind: 'artifact', path: r.hld.path, label: `approve HLD (${short(r.hld.path)})` });
	else if (na.kind === 'approve-lld') {
		const story = r.stories.find(s => s.id === na.storyId);
		if (story?.path !== undefined) out.push({ kind: 'artifact', path: story.path, label: `approve LLD ${na.storyId} (${short(story.path)})` });
	}
	for (const a of pending) out.push({ kind: 'amendment', id: a.id, label: `amendment ${a.id} (${a.amendment.type})` });
	return out;
}

function mark(exists: boolean, approved: boolean, rejected: boolean): ReactElement {
	if (!exists)  return <Text dimColor>—</Text>;
	if (rejected) return <Text color="red">✗ rejected</Text>;
	if (approved) return <Text color="green">✓ approved</Text>;
	return <Text color="yellow">• pending</Text>;
}

function short(p: string): string {
	const parts = p.split('/');
	return parts.length <= 3 ? p : `…/${parts.slice(-2).join('/')}`;
}
