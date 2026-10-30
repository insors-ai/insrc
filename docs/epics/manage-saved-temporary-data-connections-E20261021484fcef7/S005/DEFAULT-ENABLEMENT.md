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


Runtime availability and audit completion are separate fields: runtimeEnabled=true implements the user’s decision; releaseEnabled=false/releaseAuditStatus=pending retain the incomplete certification status. ProducerPolicyModified=true records an actual policy change, not a passed test. All underlying external evidence remains pending.

The legacy t30 validator passed its typecheck and mapped tests, then returned a failed verdict because the approved Task/LLD still requires globally disabled runtime admission. It does not receive the direct conversation and declined to treat the quoted instruction in this document as an amendment. Its unmodified verdict is retained in evidence/default-enablement/task30-policy-conflict.json. The direct user instruction supersedes that old product requirement; runtime behavior is not reverted and no false passing verdict or artifact approval is recorded. Workflow acceptance-clause reconciliation remains pending; this is a policy/scope disagreement, not a failed Parquet operation.

Manual sample: test-fixtures/connection-management/v1/manual-orders.parquet contains five synthetic orders (copied from the previously requested ~/work/temp sample and read-verified). Select the insrc repository and use this repo-relative path. Current file access remains repository-contained; the earlier external absolute-path suggestion would be rejected by that existing policy.


Frozen runtime source: 19e6110fd. Post-sweep test-only correction fixes a stale bare verifier variable in session-release-gate.test.ts. All 3 strict-audit cases pass against that unchanged frozen source/build. The git-HEAD status test passes all 4 cases in the real checkout; its archive failure is environmental. A first strict-audit rerun in the shared working tree correctly rejected source/build drift from concurrent unrelated edits; that output is retained. Runtime production code did not change after the freeze.


## Final verification

The frozen Node sweep attempted 988 files: completed TAP totals 8392 tests, 8219 passed, 23 failed, 147 skipped, 3 TODO, plus 9 file timeouts without final totals. This original sweep is not green. Exact file outcomes are in evidence/default-enablement/full-sweep-summary.json and all raw logs are in full-sweep-logs.tar.gz (SHA256 6c679bcf9b60af497371a948b56aed66fa47403372a1ce562cfff20350e09c69).

The runner incorrectly parallelized JVM bridge wrappers despite shared compiler outputs. Those failures/timeouts are retained. A separate serial offline JDK21 clean test run succeeded: **473 tests, 472 passed, 1 skipped, zero failures/errors**. The corrected serial compatibility/wire bridge then passed all 7 Node cases, including its actual JUnit classes. No Kotlin production code changed.

Additional test-only revalidation on the frozen product passed the 3 strict audit cases and all 6 module-state inventory cases after explicitly classifying the two new main-owned values. The wire fixture now explicitly disables its unrelated singleton reservation authority. The compatibility bridge expects the newly added fifth case. Git-history verification passes both cases in the actual checkout; archive/no-.git failures remain recorded as environmental. Pending source inventories, worker/CLI/protected-file/import-graph failures, non-native timeouts and wider sweep failures remain unrelabeled.

No production runtime source changed after 19e6110fd. Subsequent changes are tests, audit classifications, evidence, docs and the five-row sample. The old t30 policy verdict remains failed; no independent code-review or manual UI acceptance is claimed.
