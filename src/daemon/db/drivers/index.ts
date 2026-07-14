/**
 * Driver barrel. Each driver module `registerDriver()`s at top-level
 * import time; pulling this module once at daemon boot is the
 * bootstrap.
 *
 * Phase 1 Round 1: Postgres, Redis (+valkey/keydb), CSV (+tsv).
 * Phase 1 Round 2: MySQL/MariaDB, SQLite, MongoDB, JSONL/NDJSON, JSON.
 * Phase 1 Round 3: MSSQL, Oracle, Cassandra, NATS (JetStream KV),
 *   Excel, Avro, Arrow/Feather, BSON, fixed-width.
 * Phase 5:        CockroachDB (pg-compatible), ClickHouse, DynamoDB,
 *   etcd, Memcached (limited), Parquet.
 *
 * 23 distinct kinds total (17 phase 1 + 6 phase 5).
 */

// RDBMS
import './pg.js';            // postgres + cockroachdb
import './mysql.js';         // mysql + mariadb
import './sqlite.js';
import './mssql.js';
import './oracle.js';
import './clickhouse.js';
// KV
import './redis.js';         // redis + valkey + keydb
import './mongodb.js';
import './cassandra.js';
import './nats.js';
import './dynamodb.js';
import './etcd.js';
import './memcached.js';
// File -- consolidated onto the DuckDB-backed driver
// (plans/data-driver-duckdb-files.md). Native kinds (csv / tsv /
// jsonl / ndjson / json / parquet / arrow / feather) flow straight
// through DuckDB's reader functions; non-native kinds (avro / bson /
// fixed-width / xlsx) stage through the Phase 2 converters into
// Parquet first, then read via the same SQL surface. The bespoke
// per-format drivers (csv.ts, parquet.ts, avro.ts, ...) have been
// retired -- only `duckdb-file.ts` registers `family: 'file'` factories.
import './duckdb-file.js';

import { listRegisteredKinds } from '../registry.js';
import { getLogger } from '../../../shared/logger.js';

const log = getLogger('db-drivers');

export function registerBuiltinDataDrivers(): void {
	const kinds = listRegisteredKinds();
	log.info({ count: kinds.length, kinds: kinds.map(k => k.kind) }, 'data drivers registered');
}
