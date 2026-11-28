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
