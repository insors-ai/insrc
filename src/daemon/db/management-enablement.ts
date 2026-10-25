/** Release evidence is generated only after the S001 build/test gates pass. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalRequestJson } from './management-tickets.js';
export interface ManagementEnablement {
	readonly ready: boolean;
	readonly digest: string;
}
export async function connectionManagementEnablement(evidenceUrl: URL = new URL('../../assets/connection-management-gates.json', import.meta.url)): Promise<ManagementEnablement> {
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
		if (evidence.version !== 2 || evidence.ready !== true || !/^[a-f0-9]{64}$/.test(evidence.inventoryDigest) || !/^[a-f0-9]{64}$/.test(evidence.testReportDigest) || ['sc1', 'sc2', 'sc3', 'sc8'].some(scope => !evidence.scopes?.includes(scope)))
			throw new Error();
		const files = import.meta.url.endsWith('.ts') ? evidence.sourceFiles : evidence.compiledFiles;
		if (!files || Object.keys(files).length < 10)
			throw new Error();
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
