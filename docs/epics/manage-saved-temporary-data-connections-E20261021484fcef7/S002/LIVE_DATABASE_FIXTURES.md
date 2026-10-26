# Local database fixtures

S002 tests create disposable containers named `insrc-cm-s2-<random UUID>` with
localhost-only published ports, fake credentials and no host-directory mounts.
They stop only their own container IDs, with automatic removal of disposable data.
Existing containers, the insrc daemon and saved connections are not modified.

## SQL Server: coverage pending

On 2026-10-25 the user explicitly accepted deferring actual SQL Server coverage
and continuing the build. This Mac is ARM64. The follow-up target is a disposable
SQL Server Developer container on a Linux x64 CI runner or remote x64 Linux host;
no CI job has been provisioned or executed yet. Microsoft's container support
requirements exclude ARM64 emulation:
[SQL Server container requirements](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/quickstart-install-docker?view=sql-server-ver16).

The intended fixture is `mcr.microsoft.com/mssql/server:2022-latest`, using an
ephemeral localhost port, fake credentials and no host mounts. The runner operator
must authorize Microsoft's EULA (`ACCEPT_EULA=Y`) before starting it. The check must
execute authenticated `SELECT 1`, reject incorrect credentials and an unavailable
service, and verify connection disposal and fixture removal. No SQL Server
container has been started or EULA accepted by this build.

Existing MSSQL SDK-boundary tests pass, but do not establish actual-service
coverage. Task t7 remains unverified for that requirement; user-approved deferral
does not convert it to a passing test or enable the release capability.

Oracle uses the downloaded Oracle Free test image. Other probe fixtures use local
Redis, MongoDB, Cassandra, NATS, etcd and Memcached images. Authentication-provider
tests use fake credentials and local protocol servers; they never contact AWS.

Relevant task suites run during implementation. The complete project test sweep
is reserved for after all S002 implementation tasks have been built.
