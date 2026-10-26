/** Exact production driver allowlist, independent of lazy factory success. */
export const PROBE_MODULES = {
 postgres:'pg',cockroachdb:'pg',mysql:'mysql',mariadb:'mysql',sqlite:'sqlite',mssql:'mssql',oracle:'oracle',clickhouse:'clickhouse',
 redis:'redis',valkey:'redis',keydb:'redis',mongodb:'mongodb',cassandra:'cassandra',nats:'nats',dynamodb:'dynamodb',etcd:'etcd',memcached:'memcached',
 csv:'duckdb-file',tsv:'duckdb-file',json:'duckdb-file',jsonl:'duckdb-file',ndjson:'duckdb-file',parquet:'duckdb-file',arrow:'duckdb-file',feather:'duckdb-file',avro:'duckdb-file',bson:'duckdb-file','fixed-width':'duckdb-file',xlsx:'duckdb-file',
} as const;
export function probeModule(kind:string): string | undefined {
 return Object.hasOwn(PROBE_MODULES,kind)? PROBE_MODULES[kind as keyof typeof PROBE_MODULES]:undefined;
}
