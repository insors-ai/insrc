# PLAN4 T1 — production and qualification deadline separation

Owning task: `446ae69566d352dd/s1/t1`. LLD8 and PLAN4 are approved. Registered
implementation admission succeeded before these edits. Final Story BUILD
approval remains outstanding.

Ordinary installer imports now use `operation-time-budgets.mjs`, which never
selects policy from the environment. The original qualification module is an
explicit trusted preloader: it admits exactly normal or slow-vm, with the
existing frozen numeric bounds. A frozen process-local context lets separately
compiled and bundled controls share that admission; a new Node worker receives
an explicit preloader argument only from an already admitted parent. No manager
request, receipt, runtime identity, or ambient selector grants admission.

The retained harness uses the same policy without introducing an import-time
selector into dev delivery, Git discovery, or source-worker helpers. Its normal
ownership, closure, explicit-short-budget, and conflicting-child-profile rules
remain in place. The resource copier includes and attests the adjacent policy
module. Controlled source and installed-payload fixtures copy that dependency.

Ordinary limits remain network 600,000ms and verification 120,000ms, including
unset, normal, slow-vm, invalid and empty selector cases. Tests exercise fresh
manager/terminal imports, manager inspection, actual owned local Git discovery,
runtime verification/acquisition guards, and injected download transports.
Explicit qualified probes retain the fixed slow limits of 2,400,000ms and
480,000ms and bounded manager/worker propagation.

The official runtime policy JSON, inventory/completion serialization, profile
digests, public fields and target enablement are unchanged. T1 introduces only
the internal verifier lane type; T2 implements those checks. The additional
release-owned publisher/CI target guard remains owned by T6.

## Focused validation

- Initial coordinator run `fffd89c6-96a5-460c-8dcf-5c3ed1a422b0`: nine of ten
  files passed. Four toolchain cases failed because their copied harness lacked
  the newly adjacent policy file. The negative-toolchain case passed. Initial
  results and TAP logs are retained without relabelling this run as green.
- Corrective run `497aa7f0-2a19-4008-aadf-8f8ac9aa2438`: all seven cases in the
  two affected files passed after fixing that fixture copy and strengthening
  the production action probe. Across the latest file results, all 30 selected
  cases in ten files pass. These are task-surrounding checks, not the full suite.
- Both coordinator runs used Node22.22.1, completed their build/typecheck stages,
  recorded `owned-groups` confirmed closure with no cancellation/evidence errors,
  and released the checkout. Their raw results and closure journals are adjacent.
- Shared-harness controller checks: all 20 passed in 125.08s; raw TAP and the
  completed checkout-run closure journals are retained here. Registered T1
  validation passed all seven acceptance checks, typecheck (14.198s), and all
  13 mapped cases (8.581s) at `0fa2f8c20`. BUILD23/TESTS23 and the raw gate
  result/TAP are retained. Temporary build settings were restored and verified.

`source-inputs.json` binds the edited inputs by SHA256. The original failure and
the corrective run have separate evidence prefixes. Previous macOS/Linux VM
evidence remains historical: T9 regression and current T10 native qualification
are still required. No installed host daemon/Ollama operation, Windows native
qualification, field migration, or release enablement was performed.

Only T1 has been revalidated against PLAN4 at this checkpoint. The other nine
BUILD rows retain earlier-round results and do not establish current completion.
