/** Release evidence is generated only after the S001 build/test gates pass. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalRequestJson } from './management-tickets.js';
export interface ManagementEnablement {
	readonly ready: boolean;
	readonly digest: string;
}
export const CONNECTION_FOUNDATION_GATE_FILES = [
	'daemon/db/management-enablement', 'daemon/db/connection-reservations', 'daemon/db/management-files', 'daemon/db/management-owner-lease',
	'daemon/db/management-state', 'daemon/db/management-adoption', 'daemon/db/management-startup',
	'daemon/db/managed-store', 'daemon/db/management-tickets', 'daemon/db/management', 'daemon/db/driver-profiles',
	'daemon/db/secrets', 'daemon/db/pool', 'daemon/db/pool-cache', 'daemon/db/driver-work',
	'daemon/db/file-policy', 'daemon/db/file-execution', 'daemon/db/converter-cache', 'daemon/db/drivers/duckdb-file',
	'shared/connection-management', 'shared/connection-management-wire',
] as const;
export const CONNECTION_TEST_GATE_FILES = [
	'bin/insrc-connection-test', 'daemon/db/draft-test', 'daemon/db/draft-probe', 'daemon/db/probe-kinds',
	'daemon/request-context', 'daemon/server', 'daemon/threads/channel', 'daemon/threads/router',
	'daemon/threads/maintenance-entry', 'daemon/connection-management-rpc', 'daemon/db-rpc',
	'daemon/db/runtime-config', 'daemon/db/dynamo-identity', 'shared/logger',
	'daemon/db/drivers/pg', 'daemon/db/drivers/mysql', 'daemon/db/drivers/sqlite', 'daemon/db/drivers/mssql',
	'daemon/db/drivers/oracle', 'daemon/db/drivers/clickhouse', 'daemon/db/drivers/redis', 'daemon/db/drivers/mongodb',
	'daemon/db/drivers/cassandra', 'daemon/db/drivers/nats', 'daemon/db/drivers/dynamodb', 'daemon/db/drivers/etcd',
	'daemon/db/drivers/memcached', 'daemon/db/drivers/duckdb-file',
] as const;
export const CONNECTION_SESSION_GATE_FILES = [
	'daemon/db/session-owner', 'daemon/db/session-entries', 'daemon/db/session-ledger', 'daemon/db/session-management', 'daemon/db/connection-reservations', 'daemon/db/management-root', 'daemon/connection-session-rpc',
	'daemon/connection-management-rpc', 'daemon/request-context', 'daemon/server', 'daemon/index',
	'daemon/threads/router', 'daemon/threads/channel', 'daemon/threads/method-class', 'daemon/threads/worker-requests',
	'shared/step-context', 'shared/connection-management', 'shared/connection-management-wire',
] as const;
export async function connectionManagementEnablement(evidenceUrl: URL = new URL('../../assets/connection-management-gates.json', import.meta.url), additionalScopes: readonly string[] = []): Promise<ManagementEnablement> {
	try {
		const evidence = JSON.parse(await readFile(evidenceUrl, 'utf8')) as {
			version: number;
			ready: boolean;
			sourceFiles: Record<string, string>;
			compiledFiles: Record<string, string>;
			inventoryDigest: string;
			testReportDigest: string;
			scopes: string[];
		};
		if (evidence.version !== 2 || evidence.ready !== true || !/^[a-f0-9]{64}$/.test(evidence.inventoryDigest) || !/^[a-f0-9]{64}$/.test(evidence.testReportDigest) || ['sc1', 'sc2', 'sc3', 'sc4', 'sc8', ...additionalScopes].some(scope => !evidence.scopes?.includes(scope)))
			throw new Error();
		const files = import.meta.url.endsWith('.ts') ? evidence.sourceFiles : evidence.compiledFiles;
		if (!files || Object.keys(files).length < 10)
			throw new Error();
		const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
		if ([...CONNECTION_FOUNDATION_GATE_FILES, ...CONNECTION_TEST_GATE_FILES, ...(additionalScopes.includes('sc5') ? CONNECTION_SESSION_GATE_FILES : [])].some(path => !Object.hasOwn(files, path + extension))) throw new Error();
		for (const [path, expected] of Object.entries(files)) {
			if (path.startsWith('/') || path.split('/').includes('..') || !/^[a-f0-9]{64}$/.test(expected))
				throw new Error();
			if (createHash('sha256').update(await readFile(new URL('../../' + path, import.meta.url))).digest('hex') !== expected)
				throw new Error();
		}
		return { ready: true, digest: createHash('sha256').update(canonicalRequestJson({ version: evidence.version, sourceFiles: evidence.sourceFiles, compiledFiles: evidence.compiledFiles, inventoryDigest: evidence.inventoryDigest, scopes: [...evidence.scopes].sort() })).digest('hex') };
	}
	catch {
		return { ready: false, digest: '0'.repeat(64) };
	}
}
