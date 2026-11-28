# PLAN4 T6 — application integrity and publisher boundaries (in progress)

T6 was admitted after the current T1–T5 gates passed. Its code has not yet
passed the registered task validation gate. Historical BUILD rows do not
establish current T6 completion. T7–T10 and final Story BUILD approval remain
pending.

The implementation adds private process-local operation/candidate authority,
bound to the original independent full inventory check and same-inode native
publication. Cloned/serialized data cannot grant reuse. Missing context causes
fresh verification; failures/cancellation invalidate the operation. Bounded
installed-control opening remains separate. T7/T8 must consume the compatible
context in their own stages; manager-wide reuse is not claimed here.

| Relationship | Direction, cardinality and ownership | Compatibility |
| --- | --- | --- |
| Live operation to prepared candidates | One operation owns zero or more candidate-reference proofs in its private WeakMap; each proof belongs to that operation and original candidate object. | Failure/cancellation invalidates reuse; a new operation or cloned candidate needs a fresh full check. |
| Verified inventory to verification scope | Each original inventory object has one current private verification record, binding its scope, canonical content, root inode and check signal. | Native publication may move that same inode; serialized inventory data carries no authority. |
| Preparation/verification caller to live operation | Each call may pass one optional in-process operation reference through PreparationContext or DeliveryPort.verify. | No public request/receipt field is added; absent or untrusted context performs fresh verification. |

Publisher reads now capture and recheck every regular file, including
single-link files, through no-follow descriptors. Provenance remains limited to
allowed roots, generated files, excluded inputs, blocked paths and pinned
distribution hashes. Native application dependencies remain legitimate.
Windows execution/publication is explicitly excluded independently of receipt
flags; Windows metadata computation remains available and CI is default false.
No Windows native execution was attempted.

Publisher runtime lifetime is separate from candidate staging. A short
allocated home avoids installation endpoint path limits and is recorded in the
retained run. Candidate cleanup cannot delete it. Fixtures provide captured
homes and require positive actor closure before protected-home cleanup.

The read-only analyzer request timed out without a state token. Source traces
and exact call-site searches supplied the fallback; no graph validation or
completed analyzer result is claimed, and no duplicate request was started.

Initial surrounding run 3ede676c-4700-4764-adad-b1716808eb60 typechecked and
passed application-policy 3/3 and source-link 4/4. Bundle passed 7/8; its
scan-count assertion incorrectly included extraction fsync opens. Publisher
passed 10/11; its probe and the full-payload fixture failed on a too-long Unix
endpoint path. The counter now observes verification read opens only and the
publisher home is short and explicitly recorded. The corruption/recovery and
cancellation case passed. All coordinator groups closed in that initial run.

Rerun cfe7787f-d647-4449-a81f-cc87c69b9c7d encountered actual ENOSPC on the
internal disk during runtime extraction. Its coordinator groups closed; failed
fixture evidence was retained. This is not a passing validation result.

An owned 32 GiB APFS sparse image was created on the existing USB disk without
changing VM data or requiring elevated commands. The image was mounted with
ownership enabled, and a captured ordinary-UID501 permission probe confirmed
EACCES for a read-only file. Exact official archive bytes were verified before
seeding its fixture cache. The scratch record is retained beside this file.

Scratch-backed run 75a26623-80fb-41a4-9954-9b9aa3e5b497 was interrupted after
internal space recovered. Its retained cleanup record says confirmedClosed=false
and the checkout lease is blocked. All coordinator child disposals are closed,
but one detached fixture marker remains (recorded PID48240, payload fixture
/Volumes/insrc-plan4/tmp/insrc-foundation-payload-MqdI6l). No PID/age-based
cleanup, lease recovery, fixture deletion or scratch-image detach was attempted.
Human confirmation that the remaining actor has ended is required before the
documented exact-run recovery and another validation attempt. The installed
v2 daemon and Ollama were not changed.

The user subsequently reported rebooting the Mac because the filesystem ran
out of space. That machine-wide termination supplies the required closure
confirmation. The exact blocked run above was recovered through recoverRun
with confirmedActorsEnded=true; its workspace/evidence were retained, with no
PID/age inference or unrelated lease recovery. Post-reboot free space was43 GiB.
The two previously measured temporary areas (13 GiB and4.4 GiB) were now9.5 MiB
and396 KiB. Pre-reboot swap measurements were not captured, so the remaining
space recovery cannot be attributed precisely. The external scratch image is
unmounted after reboot and was left intact. Focused tests resume serially on
the internal disk; the heavy full-payload case remains unvalidated and is
deferred to the final T9 regression pass with resource headroom checked first.

Post-reboot surrounding run4db2dc1b-6603-4aef-a691-646f16ed5d8d passed all26 cases across the four complete mapped files under Node22.22.1, serial concurrency1. The coordinator typecheck/build passed, all owned groups confirmed closed, no evidence/cancellation errors occurred, and the checkout lease was released. Bundle8/8 included the corrected independent-read counter and close-uncertainty failure retention; publisher11/11 included the actual protected external runtime/native probe; source-links4/4 and application-policy3/3 passed. Free space remained about39 GiB. Registered task validation remains the next gate; full-payload and VM evidence are still pending T9/T10.

The first registered gate atd78db412a completed as BUILD30/TESTS30 with25/26 cases passing. The publisher probe itself ran, but its fixture inherited legacy closure mode when invoked directly by the gate, causing the strict owned-group cleanup check to fail and retain its captured root. The surrounding coordinator had supplied that flag. Both publisher-probe and complete-payload fixture runs now select owned-group closure on their own run environment, independently of the caller. The first failed gate/TAP and restored settings are retained; no passing T6 gate is claimed yet.

The focused publisher rerun removed INSRC_BUILD_CONFIRM_CLOSURE, INSRC_TEST_RUN_ID and INSRC_TEST_ROOT from the invoking environment. All11 publisher cases passed, including the actual external runtime/native probe and its qualified owned-group cleanup, in45.57s. The production files remain identical to the first task commit; only the two fixture run environments changed. The heavy fixture is still deferred to T9, and T6 requires a fresh registered gate.
