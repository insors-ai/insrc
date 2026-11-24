# S2 task t3: preparation ownership validation checkpoint

Existing tracked work: `TASK-c3d71313f34bce71-s2-t3`, [insors-ai/insrc#267](https://github.com/insors-ai/insrc/issues/267).
This is evidence for the task being developed, not a separate defect or approval artifact.

## Status

S2's plan is approved. Tasks t1 and t2 passed the registered build validator.
Task t3 has not passed; t4–t9 have not started. No S2 BUILD approval is requested.
The current host daemon and its v2 installation have not been changed.

The first t3 validation passed its typecheck and four worker tests but rejected:

- Treating direct-child close plus an empty original process group as complete descendant closure.
- Checking only selected staged entries rather than every inventory file's membership, size, permissions and digest.
- Insufficient explicit foreign-checkpoint and retry/cleanup guard coverage.

The second and third findings were addressed within t3: dev staging now reuses the complete payload inventory verifier; tests cover missing, changed, resized and extra files, foreign checkpoints, denied retry/cleanup closure guards and preservation of uncertain attempts. Actual manager retry and deletion integration remains t7.

## Confirmed ownership gap

A controlled macOS reproduction at commit `62b9a0e91` launched an owned Node command that started a detached child in a new process group. The child did not register with the coordinator. The direct command exited, but the detached child kept running.

The strict coordinator recorded:

```json
{
  "runId": "ae8ff256-52da-44c1-9c32-61c05bf494ad",
  "confirmedClosed": true,
  "closureMode": "owned-groups",
  "escapedDescendantStillRunning": true
}
```

The diagnostic then wrote the fixture's release file, observed its completion marker, and removed its temporary directory. It did not discover or signal a PID. No fixture processes were intentionally left running.

Local diagnostic source: `.insrc/tmp/s2-t3-review/escaped-descendant.mjs` (ignored).
Invocation: Node 22.22.1 with that script from the repository root.

The implementation reconciles admitted command IDs, nested coordinator close/disposal journals, cleanup hashes, worker lock ownership and source/output fingerprints. Those checks cannot discover an arbitrary descendant that starts another session/group and never registers. Consequently the existing implementation cannot substantiate the broader whole-descendant interpretation of the approved LLD/plan.

## Design decision needed

Recommended clarification: the guarantee covers installer-admitted command actors, retained process groups and cooperating registered descendants. Known unresolved ownership still blocks publication/retry/cleanup. Arbitrary unregistered detached processes are explicitly outside that guarantee; this is process ownership, not execution isolation.

Alternative: retain arbitrary-descendant containment and design a suitable isolation/platform ownership boundary before continuing. No existing native API in this repository provides that boundary. Do not silently weaken the approved contract or certify the current process-group evidence as universal containment.

This is a cross-platform design question. Linux documents subreaper adoption of orphan descendants, and Windows documents job-object inheritance and breakaway controls; neither mechanism is implemented or qualified here. These are research candidates, not completed designs. [Linux documentation](https://www.man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html), [Windows job objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

For macOS, Apple's kernel header states that automatic `NOTE_TRACK`/`NOTE_CHILD` fork following is unsupported. Endpoint Security clients require an Apple-granted entitlement; Apple's client example also handles the not-privileged/root failure. That route conflicts with the current no-elevation/deferred-signing requirements. This does not prove that every possible macOS design is impossible; it rules out assuming those APIs solve the gap without changing constraints. [Apple kernel header](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/event.h), [entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.developer.endpoint-security.client), [client requirements](https://developer.apple.com/documentation/endpointsecurity/client?changes=latest_minor&language=objc).

## Validation limits and nearby baseline failures

- Per-task tests only; the final combined installer regression and complete-payload/native-host smoke remain t9.
- The expanded t3 worker file passed four tests locally, including the additional staged-file and guard cases; TypeScript no-emit passed.
- After extracting the shared complete-tree verifier, all four surrounding bundle tests passed, including extraction, runtime digest, cancellation and retry preservation (48.98 seconds total).
- Earlier surrounding coordinator/metadata checks passed 21 cases before the latest staged-file changes; no claim of rerunning unchanged checks is implied.
- T2's toolchain and coordinator checks passed 11 cases. Three additional legacy command assertions still expect removed broker/watchdog stages, removed spawn exemptions or the removed daemon-process-client test. Those expectations predate the t2 changes and remain outside this task.
- Fixture/native-host evidence is not UTM, OrbStack or Windows release qualification. Unsupported descendant-disposal evidence must remain uncertain.

The user was asked to choose the ownership guarantee before any dependent contract change. Until that decision and any necessary tracked design revision, t3 remains unvalidated and t4 is not admitted.
