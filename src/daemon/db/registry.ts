/**
 * Driver registry for the data driver.
 *
 * Drivers self-register at daemon boot via `registerDriver`. The
 * config loader uses `kindExists` / `familyOf` to validate entries
 * before we try to build pools out of them.
 *
 * The registry is a module-level singleton -- there is one daemon
 * process and one driver catalogue within it.
 */

import { getLogger } from '../../shared/logger.js';
import type {
	DriverFactory,
	DriverFamily,
	DriverRegistration,
} from '../../shared/db-driver.js';

const log = getLogger('db-registry');

const REGISTRY = new Map<string, DriverRegistration>();

export function registerDriver(reg: DriverRegistration): void {
	const existing = REGISTRY.get(reg.kind);
	if (existing !== undefined) {
		// Re-registration overwrites; useful for tests that swap a real
		// driver for a stub. Log once so real bugs don't hide.
		log.warn({ kind: reg.kind }, 'driver kind re-registered -- replacing');
	}
	REGISTRY.set(reg.kind, reg);
	log.debug({ kind: reg.kind, family: reg.family }, 'driver registered');
}

export function unregisterDriver(kind: string): void {
	REGISTRY.delete(kind);
}

export function kindExists(kind: string): boolean {
	return REGISTRY.has(kind);
}

export function familyOf(kind: string): DriverFamily | undefined {
	return REGISTRY.get(kind)?.family;
}

export function getFactory(kind: string): DriverFactory | undefined {
	return REGISTRY.get(kind)?.factory;
}

export function listRegisteredKinds(): readonly {
	readonly kind: string;
	readonly family: DriverFamily;
}[] {
	return Array.from(REGISTRY.values()).map(r => ({
		kind: r.kind,
		family: r.family,
	}));
}

/** Test-only. Clears every registration. */
export function _resetRegistryForTests(): void {
	REGISTRY.clear();
}
