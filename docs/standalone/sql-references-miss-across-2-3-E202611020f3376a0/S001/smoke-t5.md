## Installed-daemon smoke (ISSUE-0f3376a0 S001 t5), 2026-11-03

Installed daemon updated to e68162aa (npm install skipped on the install marker) and restarted. The running daemon (pid 82821) was later restarted from the insrc TUI by another party; it runs the same checkout e68162aa. Repository /private/tmp/insrc-sql-smoke-rp registered with repo.add (real path, so the file watcher sees its saves). References read with entity.closure (REFERENCES, out, depth 1) over the daemon IPC; script /tmp/sql-smoke.mts.

```
## files
db/defs.sql:
CREATE TABLE app.users (id int);
CREATE TABLE "Ledger" (id int);
CREATE TABLE ledger (id int);
db/views.sql:
CREATE VIEW q AS SELECT * FROM db.app.users;
CREATE VIEW ql AS SELECT * FROM "Ledger";
CREATE VIEW lo AS SELECT * FROM LEDGER;
CREATE VIEW u AS SELECT * FROM users;
repo.add -> {"ok":true}

## after the first index (entity.closure REFERENCES out, depth 1)
q -> ["app.users@db/defs.sql"]
ql -> ["\"Ledger\"@db/defs.sql"]
lo -> ["ledger@db/defs.sql"]
u -> ["app.users@db/defs.sql"]

## saved db/audit.sql: CREATE TABLE audit.users (id int);  (the watcher indexes it and settles)
## after the settle
q -> ["app.users@db/defs.sql"]
ql -> ["\"Ledger\"@db/defs.sql"]
lo -> ["ledger@db/defs.sql"]
u -> []
```

Daemon log for the settle that indexed db/audit.sql:

```
cross-file Pass 2: SQL references re-checked  targets=2 returned=2
cross-file resolver pass complete  mode=settle resolved=1 ambiguous=1 stillUnresolved=0
```

Result: pass. After the first index:

- q: the qualified db.app.users meets app.users (segment suffix).
- ql: the quoted "Ledger" links the case-sensitive "Ledger".
- lo: LEDGER links the unquoted ledger; the two are separate entities.
- u: the bare users links app.users.

Saving audit.users made the settle re-check both inferred edges into app.users. q re-resolved, because db.app.users does not meet audit.users; u became ambiguous between app.users and audit.users, so its edge is gone. ql and lo were not affected.
