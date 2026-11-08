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
