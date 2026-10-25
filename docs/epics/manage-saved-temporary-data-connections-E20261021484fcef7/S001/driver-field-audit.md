# S001 driver field audit

Source classification for task t1. This is an input to later runtime profiles, not an enabled editor or a proof of materialization. Synthetic fixtures and exact source digests live in `src/daemon/db/__tests__/fixtures/driver-field-matrix.json`.

| Kind | Family | Public editable leaves | Credential-bearing (never raw public) | Retained only | Source |
| --- | --- | --- | --- | --- | --- |
| postgres | rdbms | label, schemaSource.type, schemaSource.path, pii | url | family, secretRef, ephemeral, path, namespace.allow, recursive, partitioning, options | src/daemon/db/drivers/pg.ts |
| cockroachdb | rdbms | label, schemaSource.type, schemaSource.path, pii | url | family, secretRef, ephemeral, path, namespace.allow, recursive, partitioning, options | src/daemon/db/drivers/pg.ts |
| mysql | rdbms | label, schemaSource.type, schemaSource.path, pii | url | family, secretRef, ephemeral, path, namespace.allow, recursive, partitioning, options | src/daemon/db/drivers/mysql.ts |
| mariadb | rdbms | label, schemaSource.type, schemaSource.path, pii | url | family, secretRef, ephemeral, path, namespace.allow, recursive, partitioning, options | src/daemon/db/drivers/mysql.ts |
| mssql | rdbms | label, schemaSource.type, schemaSource.path, pii | url | family, secretRef, ephemeral, path, namespace.allow, recursive, partitioning, options | src/daemon/db/drivers/mssql.ts |
| oracle | rdbms | label, schemaSource.type, schemaSource.path, pii | url | family, secretRef, ephemeral, path, namespace.allow, recursive, partitioning, options | src/daemon/db/drivers/oracle.ts |
| clickhouse | rdbms | label, schemaSource.type, schemaSource.path, pii | url | family, secretRef, ephemeral, path, namespace.allow, recursive, partitioning, options | src/daemon/db/drivers/clickhouse.ts |
| sqlite | rdbms | label, path, schemaSource.type, schemaSource.path, pii | none | family, secretRef, ephemeral, url, namespace.allow, recursive, partitioning, options | src/daemon/db/drivers/sqlite.ts |
| redis | kv | label, namespace.allow, pii | url | family, secretRef, ephemeral, path, schemaSource.type, schemaSource.path, recursive, partitioning, options | src/daemon/db/drivers/redis.ts |
| valkey | kv | label, namespace.allow, pii | url | family, secretRef, ephemeral, path, schemaSource.type, schemaSource.path, recursive, partitioning, options | src/daemon/db/drivers/redis.ts |
| keydb | kv | label, namespace.allow, pii | url | family, secretRef, ephemeral, path, schemaSource.type, schemaSource.path, recursive, partitioning, options | src/daemon/db/drivers/redis.ts |
| mongodb | kv | label, namespace.allow, pii | url | family, secretRef, ephemeral, path, schemaSource.type, schemaSource.path, recursive, partitioning, options | src/daemon/db/drivers/mongodb.ts |
| cassandra | kv | label, namespace.allow, options.contactPoints, options.localDataCenter, options.keyspace, pii | none | family, secretRef, ephemeral, url, path, schemaSource.type, schemaSource.path, recursive, partitioning | src/daemon/db/drivers/cassandra.ts |
| nats | kv | label, namespace.allow, options.bucket, pii | options.servers | family, secretRef, ephemeral, url, path, schemaSource.type, schemaSource.path, recursive, partitioning | src/daemon/db/drivers/nats.ts |
| dynamodb | kv | label, namespace.allow, options.region, options.profile, pii | options.endpoint | family, secretRef, ephemeral, url, path, schemaSource.type, schemaSource.path, recursive, partitioning | src/daemon/db/drivers/dynamodb.ts |
| etcd | kv | label, namespace.allow, options.user, pii | options.hosts, options.password | family, secretRef, ephemeral, url, path, schemaSource.type, schemaSource.path, recursive, partitioning | src/daemon/db/drivers/etcd.ts |
| memcached | kv | label, options.user, pii | options.servers, options.password | family, secretRef, ephemeral, url, path, schemaSource.type, schemaSource.path, namespace.allow, recursive, partitioning | src/daemon/db/drivers/memcached.ts |
| csv | file | label, path, recursive, partitioning, options.delimiter, options.header, options.quote, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow | src/daemon/db/drivers/duckdb-file.ts |
| tsv | file | label, path, recursive, partitioning, options.delimiter, options.header, options.quote, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow | src/daemon/db/drivers/duckdb-file.ts |
| jsonl | file | label, path, recursive, partitioning, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow, options | src/daemon/db/drivers/duckdb-file.ts |
| ndjson | file | label, path, recursive, partitioning, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow, options | src/daemon/db/drivers/duckdb-file.ts |
| json | file | label, path, recursive, partitioning, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow, options | src/daemon/db/drivers/duckdb-file.ts |
| parquet | file | label, path, recursive, partitioning, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow, options | src/daemon/db/drivers/duckdb-file.ts |
| arrow | file | label, path, recursive, partitioning, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow, options | src/daemon/db/drivers/duckdb-file.ts |
| feather | file | label, path, recursive, partitioning, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow, options | src/daemon/db/drivers/duckdb-file.ts |
| avro | file | label, path, recursive, partitioning, options.glob, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow | src/daemon/db/drivers/duckdb-file.ts |
| bson | file | label, path, recursive, partitioning, options.glob, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow | src/daemon/db/drivers/duckdb-file.ts |
| fixed-width | file | label, path, recursive, partitioning, options.glob, options.columns[].name, options.columns[].start, options.columns[].length, options.columns[].type, options.encoding, options.trim, options.skipFirstLine, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow | src/daemon/db/drivers/duckdb-file.ts |
| xlsx | file | label, path, recursive, partitioning, options.glob, pii | none | family, secretRef, ephemeral, url, schemaSource.type, schemaSource.path, namespace.allow | src/daemon/db/drivers/duckdb-file.ts |

## Compatibility and rejection rules

- Never project credentialFields, raw URL, secretRef or unknown values.
- Keep/Replace/Clear credentials are implemented in t3; this audit changes no registry/keychain.
- Container public fields are exact leaf schemas; never allow arbitrary nested objects.
- Preserve pinned family and raw dialect verbatim. Unrepresentable dialects remain read-only.
- Etcd/memcached option passwords currently are not resolved by URL-only pool secret resolution; t3/t6 must add typed secret materialization without persisting plaintext.
- Actual registered kinds, rather than the stale index.ts count comment, are authoritative.
- Any unclassified existing field is preserved server-side, never projected, and blocks adoption/edit until classified. New unclassified fields and nested keys are rejected. No field is made public by name heuristics.

Raw URL and URL-array containers are credential-bearing even if a fixture has no password. The future form may expose only explicitly parsed non-secret components. PostgreSQL/Redis SDK parameters, Mongo multi-host/SRV, and arbitrary legacy URLs must not be normalized by a generic parser. SQLite gives path precedence and uses URL.pathname without percent-decoding for file: URLs (a%20b remains a%20b, not a b). Oracle and MSSQL currently use hierarchical URL parsing; semicolon/TNS forms do not gain support from this matrix.

File options are exact leaves: CSV delimiter/header/quote; converted directory glob; fixed-width columns (name/start/length/type), encoding/trim/skipFirstLine. recursive and partitioning apply to directories for all file kinds. Other options are not silently exposed.

The typed source inventory also covers injected aliases, barrel exports, driver factories and late measurement work. The three library/lock exclusions have explicit rationales. Every new source site or changed input digest must be classified before enabling writes. Existing direct acquisition remains unchanged in t1 and is migrated by t9–t12/t19.

No registry, keychain, live daemon lifecycle or source-data migration is performed by this audit.
