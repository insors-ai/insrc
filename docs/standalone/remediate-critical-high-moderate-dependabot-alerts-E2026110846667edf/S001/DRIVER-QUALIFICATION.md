# SMTP and saved-driver qualification

Ran on Node 22.22.1. The resolved batch-two package graph excludes all 30 mapped affected ranges.

| Check | Result | Evidence |
| --- | --- | --- |
| SMTP STARTTLS | Passed | The SMTP fixture verifies certificate trust, authenticated delivery, attachment content, required-TLS failure, authentication failure and partial recipient rejection. |
| MySQL | Passed live | Three cases in the existing MySQL integration test used a saved URL in the repository's connection document and acquired the driver through the daemon pool cache. The temporary MySQL 8.4 service returned schema, filtered rows and an explain plan. |
| Cassandra | Passed live | The saved-driver regression loads its connection document with contact points and keyspace, discovers the seeded table columns and reads one key through the registered driver. Ran against a disposable Cassandra 5.0 service. |
| etcd | Passed live | The saved-driver regression loads its connection document with the service host, discovers fields in a seeded prefix and reads the expected value. Ran against a disposable etcd 3.5.21 service. |
| SQL Server | Pending live | No SQL Server endpoint was available. The saved-driver regression loads a saved URL through the registered driver, uses the Tedious connection lifecycle and checks schema and bounded-read SQL at the SDK boundary with a simulated server response. This covers configuration, query generation and response mapping. It supplies no live wire, server or Azure authentication evidence. |
| ZIP overwrite | Passed on 0.6.1, reproduced on 0.5.18 | Both versions ran the same test fixture with overwrite and permission preservation enabled. Each of the three extraction APIs replaced the outside sentinel bytes and changed mode to 0644 on 0.5.18. Each preserved the original bytes and mode 0600 on 0.6.1. |

The ZIP test loads the resolved Cassandra dependency by default. To repeat the baseline comparison, unpack the npm archive for adm-zip 0.5.18 in an isolated directory and set `INSRC_TEST_ADM_ZIP_BASELINE` to the unpacked package directory before running the same test file. The baseline fixture result is independently named in the TAP output.

The saved-driver test exposes the Cassandra and etcd cases when `INSRC_TEST_CASSANDRA_ADDRESS` and `INSRC_TEST_ETCD_ADDRESS` point to disposable services. Seed Cassandra with a keyspace `insrc_test`, a table `orders (id int PRIMARY KEY, label text)` and one row. Seed etcd with `orders/first` containing the JSON object `{"label":"verified"}`. The localhost services were stopped after the checks.

## Installed SDK diagnostics audit

The full sweep flagged the intentionally pinned SDK versions and source hashes after the upgrade. The audit was repeated against the actual installed packages before refreshing those pins.

- MySQL 3.24.6 keeps its raw packet and command diagnostics behind the per-connection debug option. The driver continues to set debug and trace to false for temporary resources. The unconditional packet-order warning still formats only numeric sequence fields. The tracing module was byte-identical to the previous version.
- Cassandra 4.10.0 keeps the audited client and client-options source byte-identical, including the configurable log emitter. The quiet driver still supplies its resource-local no-op emitter.
- gRPC 1.14.7 changes the tracer lookup to skip empty tracer names and return early with tracing disabled. The process-level logger remains. The existing prohibition on temporary etcd resources stays in place.
- Tedious remains 19.2.2. Its audited connection and debug files are byte-identical. The SQL Server driver still uses default username/password authentication. Live SQL Server remains deferred under the revised plan.
