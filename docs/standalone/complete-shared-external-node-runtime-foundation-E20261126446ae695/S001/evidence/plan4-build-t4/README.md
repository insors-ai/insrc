# PLAN4 T4 — protected native publication and exact root-only recovery

T4 was admitted after the current T1–T3 registered gates passed. Final Story
BUILD approval remains outstanding; T5–T10 are still pending under PLAN4.

Publication reuses the original native controller/stage capabilities. It verifies
the closed source stage, removes write permissions from descendants through
checked nofollow descriptors and persists each change, while keeping the candidate
root0700. After permission-transition verification, the actual native exclusive
cross-parent rename publishes the same inode. Under the same live ownership it
seals only the canonical root0500, flushes root/source/destination namespaces and
strictly verifies the published content/modes with positive closure before return.

Existing canonical root0700 entries may be finalized only after independent full
permission-transition verification. That path performs no download, content
rewrite, descendant repair, replacement or adoption of an old retained stage.
Old unsealed/mixed layouts are retained and use the existing exact diagnostics.
Post-publication mode/durability/verification/close uncertainty quarantines the
original stage and retains canonical evidence. Non-ENOENT canonical stat failures
are actionable InstallerError results before any acquisition.

The existing captured-home fixture helper is awaited, including failure cleanup.
Source call lookup supplements the analyzer's incomplete graph: publishRuntime
is called by ensurePrivateRuntime and runtime-install tests. Existing verifier,
durability, close and stage capabilities are reused; runtime-protection.ts is a
bounded permission helper, not a public manager action or launch proof.

Focused validation:

- Initial run76cd94de-de05-40e5-9134-2aa4bc328795: build/typecheck passed,
  owned-home cleanup8/8 passed, runtime-install9/10 passed (376.79s). The copied
  old-layout fixture was rejected before its intended diagnostic. This failed
  evidence is retained. The corrected fixture moves the original closed source
  inode and explicitly verifies all source content/modes and private ancestors
  before asserting refusal; product verification was not weakened.
- Targeted runcc9823f7-a879-429e-91c5-ac9e95ab228f: the corrected old-layout
  test and new postpublication-root-close uncertainty test both passed (83.44s).
  Only these two named cases were selected. The selected controller-store file
  had no matching test cases: its TAP filename wrapper is not controller coverage.
- Both coordinators confirmed owned-group closure without cancellation/evidence
  errors and released their leases. Source inputs are pinned independently.
- Full current runtime-install11-case coverage will be rerun by the registered
  gate. Current surrounding evidence covers19 unique cases across runtime-install
  and owned-home. The direct full controller-store run also passed all7 cases;
  its native fixtures observed exact owned-child exit. The registered gate is pending.

No host daemon/Ollama operation, Windows native enablement, new lifecycle peer,
lock transfer, automatic corrupt-entry conversion or broad regression is included.
Current macOS/Linux VM qualification remains T10, after T9 scoped regression.

The original registered call at commit45152f3bb exceeded the MCP300s response
ceiling. Its test process continued (seven cases had passed when the client
timed out); no duplicate validation was started. The captured profile is fixed
for that run, and the prior three repository settings were restored and verified.
The original run completed: BUILD27/TESTS27 passed at45152f3bb, all11 cases
passed in433.14s. Its source-bound records and raw TAP are retained separately.

Post-gate self-check found two narrow retry requirements to tighten before T4 is
considered finished: reject root0500 at the finalization mutator, and reconfirm
namespace durability on verified sealed-entry reuse (including after a previous
root-chmod/flush failure). These are corrections within the existing T4 owner,
not a new issue or design choice. New assertions require a sealed entry's ctime
to stay unchanged and exercise failed then successful offline durability retry
under a later controller, with canonical/staging evidence retained. Current
corrected-source validation and a fresh registered gate remain pending.

The retry-guard focused rune0ee8b48-1209-4ad2-9f46-48c2134e3add passed all3
selected cases in180.57s, with build/typecheck, positive owned-group closure and
no cleanup/evidence errors. It covers native publication plus sealed-root
rejection, exact later-controller root-only recovery, and post-seal failed then
successful namespace durability retry without mode/inode/ctime changes. Current
corrected-source full registered validation is the remaining T4 gate.
The isolated copy-mode probe explains the first fixture failure: cpSync created
root/distribution0755 rather than0700; production verification correctly refused.
