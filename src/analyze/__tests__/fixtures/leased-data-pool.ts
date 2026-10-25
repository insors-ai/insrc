/** Test-only lease port. Consumer fixtures cannot fall back to raw acquire/list APIs. */
import type { ConnectionConfig, Driver } from '../../../shared/db-driver.js';
import type { SafeConnection } from '../../../shared/connection-management.js';
import type { DriverPool } from '../../../daemon/db/pool.js';
import { guardedDriver } from '../../../daemon/db/driver-guard.js';
export function leasedDataPool(root: string, configs: readonly ConnectionConfig[], driverFor: (id: string) => unknown | Promise<unknown>): DriverPool {
	return {
		reload: async () => ({ warnings: [] }),
		safeList: (): readonly SafeConnection[] => configs.map(c => ({ key: { repoRoot: root, scope: 'saved' as const, id: c.id }, revision: 'fixture', kind: c.kind, family: c.family ?? 'file', effectiveFamily: c.family ?? 'file', ...(c.label === undefined ? {} : { label: c.label }), publicConfig: { ...(c.path === undefined ? {} : { path: c.path }), ...(c.recursive === undefined ? {} : { recursive: c.recursive }) }, credentialPresence: {}, hasUrl: c.url !== undefined, hasPath: c.path !== undefined, ...(c.ephemeral === true ? { ephemeral: true as const } : {}) })),
		withConnection: async <T>(id: string, use: (driver: Driver) => Promise<T>): Promise<T> => {
			const guard = guardedDriver(await driverFor(id) as Driver);
			try {
				return await use(guard.driver);
			}
			finally {
				await guard.finish();
			}
		},
	} as unknown as DriverPool;
}
