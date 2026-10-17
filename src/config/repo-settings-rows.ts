/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure view model of a repo's tracker settings (Story s3): the rows the settings
 * modal shows, built from the daemon's `repoFields` (config.catalog) and one
 * `repo.settings.get` payload. No IO and no ink, so it is testable on its own.
 */

import type { RepoFieldDef, RepoFieldKind } from './repo-fields.js';
import type { RepoSettingsPayload } from '../daemon/repo-settings.js';

export interface SettingsRow {
	readonly key: string;
	readonly label: string;
	readonly kind: RepoFieldKind;
	/** What the row shows. */
	readonly value: string;
	/** The repo's own stored value, as the edit prompt's starting text; empty when unset. */
	readonly current: string;
	/** Only local rows are editable. */
	readonly editable: boolean;
	readonly note?: string;
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
		return {
			key: f.key, label: f.label, kind: f.kind, value, current, editable: f.kind === 'local', type: f.type,
			...(f.note !== undefined ? { note: f.note } : {}),
		};
	});
}
