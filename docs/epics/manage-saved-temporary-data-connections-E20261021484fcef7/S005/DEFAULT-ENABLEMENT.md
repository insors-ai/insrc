# Default connection management — 2026-10-30

User decision: “how can i be asked to test if the feature itself isn’t enabled? enable this feature by default”. This explicitly supersedes the earlier S005 t30 fail-closed-on-release-evidence acceptance clause and the historical no-production-policy-change constraint. Existing feature tracking remains Epic 484fcef7efaf229e / S005, t30. No new artifact approval is inferred; this records the explicit instruction.

Runtime connectionManagementEnablement now enables the implemented foundation, Test, sessions and removal by default. The previous strict audit is retained as verifyConnectionManagementRelease. Historical shipped gate/evidence JSON and pending prerequisites are not promoted or fabricated. A stable runtime-policy digest pins each running Saved owner; it is not a completed source/audit proof. Existing releaseDigest checkpoints remain readable.

Saved management previously opened only offline-adopted registries. A fresh registered repository now gets an exclusive, signed managed registry at daemon startup, or lazily on the first selected-root capability request for repositories added later. The per-root pending map deduplicates concurrent initialization, and daemon shutdown closes all such owners. Nonregistered roots, existing legacy files, symlinks, damaged/interrupted metadata, missing signing keys, mismatched root identity or unsupported filesystem protection still fail safely. Existing data is never automatically adopted or overwritten; its offline migration/recovery path remains intact.

Initialization claims the management marker atomically; writes a protected empty baseline and durable preparing intent; creates the root signing key and signed state; then publishes an already read-only staged registry using exclusive hard-link creation. EEXIST preserves any racing registry. Partial failures retain a recovery marker. The usual openManagedRoot ownership, keychain, revision, protected-registry and writer-fence checks then apply.

Checkpoint relationship/compatibility:

| State field | Ownership and cardinality | Compatibility |
| --- | --- | --- |
| root → checkpoint | One canonical registered root owns one signed checkpoint and registry identity. | No registry membership is auto-created. |
| oldDaemon | Exactly one origin for legacy offline adoption; verified stopped-daemon evidence. | Existing version-2 checkpoints remain accepted. |
| initializedBy | Alternative origin for a fresh absent registry; current owner PID/identity/time, missing baseline and no rollback references. | Mutually exclusive with oldDaemon. Older binaries reject this new origin safely; it never masquerades as stopped-daemon proof. |
| checkpoint → registry | Committed inode/device/digest/revision anchors are checked before mutation. | Ticket, revision, keychain and filesystem checks are unchanged. |

The real default-enabled test also found that blank optional Label was rejected by the private probe protocol. The worker projection now omits blank labels; Save retains the supported blank value and the list uses the Connection ID. No credential or endpoint is added to diagnostics.

Verification: Node22 backend build passes. New tests use runtime defaults (no injected enablement), a disposable registered-root predicate, an in-memory keystore and the real DuckDB Parquet driver/probe child: Test reaches the file, signed Save persists, normal startup reopens the signed state, removal commits, and source bytes are unchanged. Refusal cases preserve legacy/symlink/unregistered/interrupted state without signing-key writes. Historical strict-audit negative controls remain active. This is actual local Parquet integration evidence, not complete SQL/KV/service or manual client acceptance.

Automatic approval review initially rejected the rerun because it treated the change as an earlier UI-only request. After read-only diff inspection, the retry quoted the explicit default-enable instruction and identified preserved safeguards; it was accepted. No rejection is bypassed, and no installed daemon has been changed during tests.


Regression corrections: old missing-feature tests now inject disabled action ports explicitly, while default-policy integration asserts real capabilities. The legacy namespace child explicitly closes the unrelated production singleton so its custom registered-root runtime is the only reservation authority. Real single/threaded daemon checks assert default temporary features while unregistered Saved roots, forged removal requests and failed private-channel claims remain refused. New source sites were individually reviewed/classified, including the filesystem owner lease (not a driver acquisition). No wholesale audit regeneration was done.

The focused correction cohort passed 28/30; the two remaining source-inventory failures are historical drift outside this change: seven pre-existing unclassified provider/client-core files and method-class.ts’s stale sc6 digest. These are retained rather than relabeled. Broad initial regression results (650 tests, 11 failures, 4 skips) are preserved; obsolete policy expectations and own new-source classification failures were then corrected and rerun. A final frozen sweep follows the code commit.
