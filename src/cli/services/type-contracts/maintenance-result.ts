/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * COMPILE-TIME contract fixture for `MaintenanceResult` (story S001, t11).
 *
 * `__tests__` is excluded from tsconfig, so a type-level assertion placed
 * there is never checked. This file lives under src/** (included in the
 * build) so `npm run build` (tsc) enforces it: a rename, retype, or
 * required-ing of any existing MaintenanceResult field — or dropping the
 * optionality / readonly-ness of `configReconcile` — FAILS the build here.
 * It emits no runtime behaviour.
 */

import type { MaintenanceResult } from '../maintenance.js';

// `configReconcile` is OPTIONAL → a result may omit it. Making it required
// (or renaming ok/steps) breaks this assignment.
export const _minimalResult: MaintenanceResult = { ok: true, steps: [] };

// The full shape, with the additive optional summaries present. `error` inside
// configReconcile is `string | undefined` (exactOptionalPropertyTypes);
// `steeringRefresh` is a flat per-file outcome list (SteeringRefreshReport).
export const _fullResult: MaintenanceResult = {
	ok: false,
	steps: ['sync', 'install', 'build', 'reconcile', 'steering-refresh'],
	configReconcile: { changed: true, filled: 3, repaired: 1, pruned: 6, error: undefined },
	steeringRefresh: [
		{ file: '/repo/CLAUDE.md', action: 'replaced' },
		{ file: '/repo/AGENTS.md', action: 'skipped', note: 'no markers' },
	],
};

// Pin the existing field types exactly (retyping `ok` or `steps` breaks these).
type ExactlyBoolean<T> = [T] extends [boolean] ? ([boolean] extends [T] ? true : never) : never;
type ExactlyStringArray<T> = [T] extends [readonly string[]] ? ([readonly string[]] extends [T] ? true : never) : never;
export const _okIsBoolean: ExactlyBoolean<MaintenanceResult['ok']> = true;
export const _stepsIsStringArray: ExactlyStringArray<MaintenanceResult['steps']> = true;

// `configReconcile` must be omittable (optional). `Required<>` would make it
// mandatory; assert the base type still allows the property to be absent.
export type _ConfigReconcileOptional =
	Record<never, never> extends Pick<MaintenanceResult, 'configReconcile'> ? true : never;
export const _configReconcileOptional: _ConfigReconcileOptional = true;

// `steeringRefresh` is likewise additive + optional — omittable exactly like
// `configReconcile`. Making it required (or renaming it) breaks this.
export type _SteeringRefreshOptional =
	Record<never, never> extends Pick<MaintenanceResult, 'steeringRefresh'> ? true : never;
export const _steeringRefreshOptional: _SteeringRefreshOptional = true;
