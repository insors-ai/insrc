/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure view model of a repo's tracker settings (Story s3): the rows the settings
 * modal shows, built from the daemon's `repoFields` (config.catalog) and one
 * `repo.settings.get` payload. No IO and no ink, so it is testable on its own.
 */

import type { RepoFieldDef, RepoFieldKind } from '../../config/repo-fields.js';
import type { RepoSettingsPayload } from '../../daemon/repo-settings.js';

export interface SettingsRow {
	readonly key: string;
	readonly label: string;
	readonly kind: RepoFieldKind;
	/** The section the row belongs to: the daemon's `group`. */
	readonly group: RepoFieldDef['group'];
	/** What the row shows. */
	readonly value: string;
	/** The repo's own stored value, as the edit prompt's starting text; empty when unset. */
	readonly current: string;
	/** Only local rows are editable. */
	readonly editable: boolean;
	readonly note?: string;
	/** For an unset Build row of a repo with no commands: the typical value of its project type, shown as the row's placeholder. */
	readonly placeholder?: string;
	readonly type: RepoFieldDef['type'];
}

export function signinText(s: RepoSettingsPayload['signin']): string {
	if (s.state === 'signed-in') return `signed in as ${s.login ?? '?'}`;
	return s.reason !== undefined && s.reason.length > 0 ? `${s.state}: ${s.reason}` : s.state;
}

export function targetText(r: RepoSettingsPayload['resolved']): string {
	if (r.type === 'none') return `none (${r.source})`;
	if (r.error !== undefined) return `unresolved: ${r.error}`;
	return `${r.owner ?? '?'}/${r.repo ?? '?'} (${r.source})`;
}

function policyValueText(v: unknown): string {
	if (Array.isArray(v)) return v.length === 0 ? '(none)' : v.join(', ');
	if (typeof v === 'object' && v !== null) {
		return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${policyValueText(x)}`).join(' · ');
	}
	return String(v);
}

function policyText(policy: RepoSettingsPayload['policy'], key: string): string {
	if (!policy.ok) return `unavailable: ${policy.reason}`;
	if (policy.mode === 'none') return 'no team policy';
	return key in policy.values ? policyValueText(policy.values[key]) : '(not set)';
}

/** The suggested value of an unset Build row; a daemon that sends no buildSetup gives none. */
function suggestedValue(f: RepoFieldDef, payload: RepoSettingsPayload): string | undefined {
	if (f.group !== 'Build' || f.kind !== 'local' || payload.values[f.key] !== undefined) return undefined;
	const setup = payload.buildSetup as RepoSettingsPayload['buildSetup'] | undefined;
	if (setup === undefined || setup.commandsSource !== 'none') return undefined;
	return (setup.suggestion as Readonly<Record<string, string>> | undefined)?.[f.key];
}

/** One row per field, in table order. */
export function buildSettingsRows(fields: readonly RepoFieldDef[], payload: RepoSettingsPayload): SettingsRow[] {
	return fields.map((f): SettingsRow => {
		const own = payload.values[f.key];
		const current = own === undefined ? '' : String(own);
		let value: string;
		if (f.kind === 'local') {
			value = own !== undefined ? String(own) : f.default !== undefined ? `${String(f.default)} (default)` : '(not set)';
		} else if (f.kind === 'status') {
			value = f.key === 'signin' ? signinText(payload.signin) : targetText(payload.resolved);
		} else {
			value = policyText(payload.policy, f.key);
		}
		const placeholder = suggestedValue(f, payload);
		return {
			key: f.key, label: f.label, kind: f.kind, group: f.group, value, current, editable: f.kind === 'local', type: f.type,
			...(f.note !== undefined ? { note: f.note } : {}),
			...(placeholder !== undefined ? { placeholder } : {}),
		};
	});
}

/** The keys the 'use suggested' action writes, in write order. */
const SUGGESTED_KEYS = ['typecheckCommand', 'testCommand', 'resultFormat'] as const;

/** The typical build commands offered for a repo that has none: only when its commands source is 'none' and its type has a suggestion. */
export function offeredSuggestion(payload: RepoSettingsPayload | null): Readonly<Record<(typeof SUGGESTED_KEYS)[number], string>> | undefined {
	const setup = payload?.buildSetup as RepoSettingsPayload['buildSetup'] | undefined;
	return setup !== undefined && setup.commandsSource === 'none' ? setup.suggestion : undefined;
}

export type SuggestedResult<P> =
	| { readonly ok: true; readonly payload: P }
	| { readonly ok: false; readonly message: string };

/**
 * Writes the suggested values one key at a time through `set` (repo.settings.set). When a write is
 * refused, or throws, the keys already written are cleared again so no lone command is left, and the
 * reason is returned. Never throws. `P` is what a successful write hands back (the payload, for a client that shows it).
 */
export async function writeSuggested<P>(
	suggestion: Readonly<Record<(typeof SUGGESTED_KEYS)[number], string>>,
	set: (key: string, value: string | null) => Promise<{ ok: true; payload: P } | { ok: false; error: { message: string } }>,
): Promise<SuggestedResult<P>> {
	const written: string[] = [];
	let last: { payload: P } | undefined;
	const attempt = async (key: (typeof SUGGESTED_KEYS)[number]): Promise<string | undefined> => {
		try {
			const r = await set(key, suggestion[key]);
			if (r.ok) { last = { payload: r.payload }; written.push(key); return undefined; }
			return r.error.message;
		} catch (e) { return e instanceof Error ? e.message : String(e); }
	};
	for (const key of SUGGESTED_KEYS) {
		const failure = await attempt(key);
		if (failure === undefined) continue;
		const stuck: string[] = [];
		for (const done of written.reverse()) {
			try { const r = await set(done, null); if (!r.ok) stuck.push(done); } catch { stuck.push(done); }
		}
		return { ok: false, message: `${failure} (suggested commands were not applied${stuck.length > 0 ? `; could not clear ${stuck.join(', ')}` : ''})` };
	}
	return last === undefined ? { ok: false, message: 'nothing was written' } : { ok: true, payload: last.payload };
}
