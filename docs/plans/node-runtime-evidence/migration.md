# Source runtime migration and recovery evidence

Story 175ab0d1d56838a9/s1, task t6, 2026-11-21.

Existing `stageManagedRelease` now provisions through the shared shell owner,
uses absolute matching Node/npm, sanitizes lifecycle environment, runs the built
native probe, verifies predecessor/candidate pins, and only then publishes the
candidate's source-runtime binding. The existing journal, descriptor, source
qualification, release floor and rollback machinery still owns activation.
The predecessor runtime remains a separate pin. Stopped legacy migration reads
its owned prior runtime record rather than guessing from the new bootstrap
process; unknown, malformed or mutable records withhold migration.

Fresh installers run the same build/native/binding ordering. Interrupted or
failed preparation cannot leave a candidate install-success marker. Binding
publication syncs the file and directory, uses atomic rename and validates
private ownership; consumption checks root, policy, archive and inventory.
A valid source binding supersedes the retired global runtime record. Explicit
`--migrate-runtime` permits staging while retaining the old record for rollback;
arbitrary external runtime overrides remain rejected. Bound source installations
cannot take shell/TUI in-place mutation paths when no managed controller claims
them. Unbound developer checkouts remain explicit tooling contexts.

`insrc-mcp` joins the existing canonical launcher fence and dispatch allowlist.
No new lifecycle mechanism, database rewrite or automatic runtime deletion was
introduced. The existing LLD component ownership remains accurate: source roots
bind to the shared verified store; managed descriptors own selected releases.

Evidence:

- `5aaaecba-c951-48dc-80bb-180c80a5d6d0`: store interruption/corruption checks,
  owned-runtime adapter and launcher fence passed. Its staging failure matrix
  passed all five failure phases; one older installer fixture needed adaptation
  to the intentionally disabled public qualification policy.
- `ad0d743b-f8ba-4e81-8308-30470695c29a`: signed source staging and managed update
  transaction/recovery suites passed, as did TUI/MCP and shell native matrices.
  The new migration fixture exposed a missing fixture node_modules directory;
  this was corrected without changing production behavior.
- `51c87917-22af-4d8f-9e8d-d28a08846743`: actual official source staging passed:
  native-probe failure retained prior selection; successful preparation bound
  the candidate to owned Node22.22.1 while retaining the prior host runtime.
- `8b80f34b-4919-4225-9131-a6b9390fd1be`: migration, actual five native-module
  loads, binding consumption/interruption, source marker parity and Node path
  tests passed.
- `7a691118-7da1-473b-8762-1c5d23214d08`: actual shell/TUI in-place mutation
  refusal for a bound source passed; marker suites passed. The shell matrix's
  developer setup needed its empty node_modules directory and injection
  variables normalized; the product's sanitization assertions were retained.
- `0dcb81b3-62d6-41f3-a318-403d7d4057b6`: stopped legacy runtime record and signed
  staging suites passed. Three unchanged native shell cases passed; the affected
  first case passed after setup correction in
  `aab6313c-d52b-4701-b990-8b2a4b223d8e`.
- `551ec22f-36b2-4a2f-8349-b00e14f9b274`: packaging, policy and all store tests
  passed, including real rename failure injection and symlinked binding-parent
  rejection.

Each completed canonical run records actor closure in its cleanup.json. Native
migration tests use the official distribution and actual npm/Node identities;
minimal candidate build fixtures prove transaction ordering. Full fresh dependency
installation/build and public target promotion remain t7 qualification work.
