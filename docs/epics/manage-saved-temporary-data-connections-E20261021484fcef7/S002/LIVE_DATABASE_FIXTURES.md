# Local database fixtures

S002 tests create disposable containers named `insrc-cm-s2-<random UUID>` with
localhost-only published ports, fake credentials and no host-directory mounts.
They stop only their own container IDs, with automatic removal of disposable data.
Existing containers, the insrc daemon and saved connections are not modified.

The live SQL Server check requires Microsoft's SQL Server container EULA to be
accepted (`ACCEPT_EULA=Y`). It is pending explicit user authorization. The intended
fixture is `mcr.microsoft.com/mssql/server:2022-latest`, running the Developer
edition for this test, with an ephemeral port and a 3 GiB memory limit. It will
execute `SELECT 1`, verify authentication failure, close the connection and remove
the test container. No SQL Server container has been started or EULA accepted by
this build.

Oracle uses the downloaded Oracle Free test image. Other probe fixtures use local
Redis, MongoDB, Cassandra, NATS, etcd and Memcached images. Authentication-provider
tests use fake credentials and local protocol servers; they never contact AWS.

Relevant task suites run during implementation. The complete project test sweep
is reserved for after all S002 implementation tasks have been built.
