/** Runtime availability is independent of the historical release-evidence audit. */
import { readFile, readdir } from 'node:fs/promises';
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
	'daemon/db/secrets', 'daemon/db/driver-guard', 'daemon/db/pool', 'daemon/db/pool-cache', 'daemon/db/driver-work',
	'daemon/db/driver-log-policy', 'shared/db-driver', 'daemon/db/file-policy', 'daemon/db/file-execution', 'daemon/db/converter-cache', 'daemon/db/drivers/duckdb-file',
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
	'daemon/db/session-owner', 'daemon/db/session-entries', 'daemon/db/session-resources', 'daemon/db/session-ledger', 'daemon/db/session-management', 'daemon/db/connection-reservations', 'daemon/db/management-root', 'daemon/connection-session-rpc',
	'daemon/connection-management-rpc', 'daemon/request-context', 'daemon/server', 'daemon/index',
	'daemon/threads/router', 'daemon/threads/channel', 'daemon/threads/method-class', 'daemon/threads/worker-requests',
	'mcp/session-bootstrap', 'mcp/forward-step', 'bin/insrc-mcp', 'daemon/steps/host',
	'daemon/steps/analysis-admission', 'daemon/steps/analyze-oneshot', 'daemon/steps/analyze-step/handler', 'daemon/steps/analyze-step/answer-turn',
	'daemon/steps/analyze-step/phases/start', 'daemon/steps/analyze-step/phases/plan', 'daemon/steps/analyze-step/phases/narrow', 'daemon/steps/analyze-step/phases/bundle',
	'shared/step-context', 'shared/connection-management', 'shared/connection-management-wire',
] as const;

/** sc6 also consumes the full session prerequisite set; these helpers cannot be omitted. */
export const CONNECTION_REMOVAL_GATE_FILES = ['shared/connection-removal', 'daemon/db/removal-retirement'] as const;

/** The complete deployed production tree, including new consumers and pure helpers. */
async function productionSources(directory: URL, prefix = ''): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.name === '__tests__') continue;
		const name = prefix + entry.name;
		if (entry.isDirectory()) files.push(...await productionSources(new URL(entry.name + '/', directory), name + '/'));
		else if (entry.isFile() && /\.tsx?$/.test(name) && !/\.(?:d|test)\.tsx?$/.test(name)) files.push(name);
	}
	return files.sort();
}

/** Local release-bundle files, never request-provided paths. */
async function releaseDocument(bundle: URL, name: unknown, expected: string): Promise<Record<string, unknown>> {
	if (typeof name !== 'string' || !/^[A-Za-z0-9_-]+\.json$/.test(name)) throw new Error();
	const bytes = await readFile(new URL(name, bundle));
	if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error();
	const value: unknown = JSON.parse(bytes.toString());
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
	return value as Record<string, unknown>;
}
const SESSION_RELEASE_PROOFS = ['INVENTORY', 'AUTH', 'RECONNECT', 'STREAM', 'MEMORY', 'REPLAY', 'COLLISION', 'NAMESPACE', 'LEASE', 'ISOLATION', 'DRIVER-LOGS', 'FILES', 'COMPAT', 'MCP', 'CLIENT-EGRESS', 'CONTEXT', 'SCOPE', 'FREEFORM', 'CACHE', 'RECURSION', 'PROVIDER', 'CONSUMER-LOGS', 'EMBED-DENY', 'ADHERENCE-CACHE', 'EXPIRY', 'GATE', 'SWEEP'] as const;
export async function verifyConnectionManagementRelease(evidenceUrl: URL = new URL('../../assets/connection-management-gates.json', import.meta.url), additionalScopes: readonly string[] = []): Promise<ManagementEnablement> {
	try {
		const evidence = JSON.parse(await readFile(evidenceUrl, 'utf8')) as {
			version: number;
			ready: boolean;
			sourceFiles: Record<string, string>;
			compiledFiles: Record<string, string>;
			inventoryDigest: string;
			testReportDigest: string;
			inventoryFile?: string | undefined;
			testReportFile?: string | undefined;
			scopes: string[];
		};
		const session = additionalScopes.includes('sc5') || additionalScopes.includes('sc6');
		if (evidence.version !== 2 || evidence.ready !== true || !/^[a-f0-9]{64}$/.test(evidence.inventoryDigest) || !/^[a-f0-9]{64}$/.test(evidence.testReportDigest) || ['sc1', 'sc2', 'sc3', 'sc4', 'sc8', ...additionalScopes, ...(session ? ['sc5', 'sc6', 'sc7'] : [])].some(scope => !evidence.scopes?.includes(scope)))
			throw new Error();
		const inventory = await releaseDocument(evidenceUrl, evidence.inventoryFile, evidence.inventoryDigest);
		const report = await releaseDocument(evidenceUrl, evidence.testReportFile, evidence.testReportDigest);
		if (report['releaseReady'] !== true) throw new Error();
		if (canonicalRequestJson(inventory['productionFiles']) !== canonicalRequestJson(evidence.sourceFiles)) throw new Error();
		const classified = inventory['files'] as Record<string, { sourceDigest?: string | undefined; classification?: string | undefined; rationale?: string | undefined }>;
		if (!classified || canonicalRequestJson(Object.keys(classified).sort()) !== canonicalRequestJson(Object.keys(evidence.sourceFiles).map(path => 'src/' + path).sort())) throw new Error();
		for (const [path, hash] of Object.entries(evidence.sourceFiles)) {
			const row = classified['src/' + path];
			if (row?.sourceDigest !== hash || typeof row.classification !== 'string' || !row.classification || row.classification === 'unclassified' || typeof row.rationale !== 'string' || row.rationale.length < 20) throw new Error();
		}
		const sourceRoot = new URL('../../../src/', import.meta.url), compiledRoot = new URL('../../../out/', import.meta.url);
		const required = [...CONNECTION_FOUNDATION_GATE_FILES, ...CONNECTION_TEST_GATE_FILES, ...(session ? [...CONNECTION_SESSION_GATE_FILES, ...CONNECTION_REMOVAL_GATE_FILES] : [])];
		for (const [root, files, extension] of [[sourceRoot, evidence.sourceFiles, '.ts'], [compiledRoot, evidence.compiledFiles, '.js']] as const) {
			if (!files || Array.isArray(files) || Object.keys(files).length < 10 || required.some(path => !Object.hasOwn(files, path + extension))) throw new Error();
			for (const [path, expected] of Object.entries(files)) {
				if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.' || !part) || !/^[a-f0-9]{64}$/.test(expected) || !(extension === '.ts' ? /\.tsx?$/.test(path) : path.endsWith('.js')))
					throw new Error();
				if (createHash('sha256').update(await readFile(new URL(path, root))).digest('hex') !== expected) throw new Error();
			}
		}
		const compiledNames = Object.keys(evidence.sourceFiles).map(path => path.replace(/\.tsx?$/, '.js')).sort();
		if (canonicalRequestJson(compiledNames) !== canonicalRequestJson(Object.keys(evidence.compiledFiles).sort())) throw new Error();
		if (session) {
			const prerequisites = report['externalPrerequisites'] as Record<string, { status?: string | undefined; clients?: Record<string, { status?: string | undefined; evidence?: unknown[] | undefined }> | undefined }>;
			if (['S001', 'S002SqlServer', 'S002Sweep', 'providerService', 'S004', 'S005'].some(key => prerequisites?.[key]?.status !== 'verified')) throw new Error();
			if (['vscode', 'jetbrains'].some(client => { const row = prerequisites['S005']?.clients?.[client]; return row?.status !== 'verified' || !Array.isArray(row.evidence) || !row.evidence.length; })) throw new Error();
			const proofs = report['proofs'] as Record<string, { status?: string | undefined; records?: unknown[] | undefined }>;
			if (SESSION_RELEASE_PROOFS.some(label => { const row = proofs?.['CM-S3-' + label]; return row?.status !== 'verified' || !Array.isArray(row.records) || !row.records.length; })) throw new Error();
			const build = JSON.parse(await readFile(new URL('assets/connection-management-build.json', compiledRoot), 'utf8')) as { version: number; producerDigest: string; sourceFiles: Record<string, string>; compiledFiles: Record<string, string> };
			if (build.version !== 1 || build.producerDigest !== createHash('sha256').update(await readFile(new URL('../../../copy-assets.mjs', import.meta.url))).digest('hex')) throw new Error();
			if (canonicalRequestJson(Object.keys(evidence.sourceFiles).sort()) !== canonicalRequestJson(await productionSources(sourceRoot)) || canonicalRequestJson(evidence.sourceFiles) !== canonicalRequestJson(build.sourceFiles) || canonicalRequestJson(evidence.compiledFiles) !== canonicalRequestJson(build.compiledFiles))
				throw new Error();
		}
		if (evidenceUrl.href === new URL('../../assets/connection-management-gates.json', import.meta.url).href) {
			const otherRoot = import.meta.url.endsWith('.ts') ? compiledRoot : sourceRoot;
			const otherUrl = new URL('assets/connection-management-gates.json', otherRoot);
			if (canonicalRequestJson(JSON.parse(await readFile(otherUrl, 'utf8'))) !== canonicalRequestJson(evidence)) throw new Error();
			await releaseDocument(otherUrl, evidence.inventoryFile, evidence.inventoryDigest);
			await releaseDocument(otherUrl, evidence.testReportFile, evidence.testReportDigest);
		}
		return { ready: true, digest: createHash('sha256').update(canonicalRequestJson({ version: evidence.version, sourceFiles: evidence.sourceFiles, compiledFiles: evidence.compiledFiles, inventoryDigest: evidence.inventoryDigest, scopes: [...evidence.scopes].sort() })).digest('hex') };
	}
	catch {
		return { ready: false, digest: '0'.repeat(64) };
	}
}

/** Enabled by default by explicit product policy. This is not release-audit evidence.
 * The identity pins this runtime policy for managed owners; request authorization,
 * registry ownership, credentials, signed tickets and worker checks remain separate.
 */
export async function connectionManagementEnablement(_evidenceUrl?: undefined, scopes: readonly string[] = []): Promise<ManagementEnablement> {
 if(scopes.some(scope=>!['sc1','sc2','sc3','sc4','sc5','sc6','sc7','sc8'].includes(scope)))return {ready:false,digest:'0'.repeat(64)};
 return {ready:true,digest:createHash('sha256').update('insrc:connection-management:default-enabled:v2').digest('hex')};
}
