/**
 * A fixture for the ac6 test (Epic c2ba6fa6, Story s11, t11): start the MCP
 * server as src/bin/insrc-mcp.ts does, then try to open the live graph store
 * and the live vector store of this process's home, and write what happened to
 * the file named by the first argument. Run as a child with HOME set to a
 * temporary directory.
 */
import { writeFileSync } from 'node:fs';

import { setLogMode } from '../../../shared/logger.js';

setLogMode('mcp');
const out = process.argv[2]!;

const { runInsrcMcpStdio } = await import('../../server.js');
await runInsrcMcpStdio();

const attempt = async (open: () => Promise<unknown>): Promise<{ opened: boolean; name?: string; code?: string }> => {
	try {
		await open();
		return { opened: true };
	} catch (e) {
		const err = e as { name?: string; code?: string };
		return { opened: false, ...(err.name !== undefined ? { name: err.name } : {}), ...(typeof err.code === 'string' ? { code: err.code } : {}) };
	}
};

const { getGraphStore } = await import('../../../db/graph/store.js');
const { getLanceConn } = await import('../../../db/lance/conn.js');
const { PATHS } = await import('../../../shared/paths.js');
const graph  = await attempt(() => getGraphStore());
const vector = await attempt(() => getLanceConn());
writeFileSync(out, JSON.stringify({ graph, vector, lmdb: PATHS.lmdb, lance: PATHS.lance }));
process.exit(0);
