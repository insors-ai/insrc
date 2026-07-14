/**
 * Shared helpers for live-DB integration tests.
 *
 * Tests opt in via `INSRC_DB_TESTS=1` AND each driver's URL env var
 * (e.g. `INSRC_TEST_PG_URL`). When either is missing the test
 * pre-skips with a single console line so CI without docker can
 * still run the suite with default config.
 *
 * See test/fixtures/db-driver/docker-compose.yml for the canonical
 * local setup. Ports there are off-default so they don't collide
 * with the developer's own local instances.
 */

import { test } from 'node:test';

export interface IntegrationConfig {
	readonly enabled: boolean;
	readonly url?: string;
	/** Reason for skipping, surfaced in the per-test skip message. */
	readonly skipReason?: string;
}

export function configFor(envName: string): IntegrationConfig {
	if (process.env['INSRC_DB_TESTS'] !== '1') {
		return { enabled: false, skipReason: 'INSRC_DB_TESTS != 1' };
	}
	const url = process.env[envName];
	if (url === undefined || url === '') {
		return { enabled: false, skipReason: `${envName} not set` };
	}
	return { enabled: true, url };
}

/**
 * Skip the rest of a node:test suite when the integration env isn't
 * configured. Use:
 *
 *   const cfg = configFor('INSRC_TEST_PG_URL');
 *   skipUnless(cfg, 'postgres integration');
 *   if (!cfg.enabled) { return; }
 *
 *   describe('PostgresDriver (integration)', ...);
 */
export function skipUnless(cfg: IntegrationConfig, label: string): void {
	if (!cfg.enabled) {
		test(`[skip] ${label}: ${cfg.skipReason ?? 'disabled'}`, { skip: true }, () => undefined);
	}
}
