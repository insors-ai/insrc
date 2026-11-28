# Round2 review checkpoint

The reviewer accepts all6bootstrap fixes at2f6bcaea7 and the accurate prior17open/partial/design-pending dispositions. BUILD22 remains unapproved, with remaining implementation, plan alignment, full scoped regression and current macOS/Linux qualification pending.

Registered design.story produced LLD7 draft. It removes the undefined enforced manual-recovery promise and specifies exact runtime-invalid/protection diagnostics; manual operator movement has no product lock or shutdown proof, with concurrent-use risk requiring an owner choice. It documents shell-only/pre-fork cancellation latency. R2-4/R2-5 are pending existingT5 code/test work after approval/plan alignment. No new issues were created.

Read-only POSIX protection is a proposal alongside writable SDK isolation, not implementation. It requires explicit owner selection and a compatible-reader rollout: older control binaries enforce original writable modes and can reject protected entries. Mixed-version compatibility is not promised. Alternatives include retaining SDK isolation only with explicit accidental-write risk, or separately designing a real recovery command.

Owner questions:q14408171(manual guidance versus recovery command),q3f4b548f(read-only protection/compatibility versus SDK-only). No asynchronous answer or artifact approval has arrived; no yes is inferred. Resolve these before final LLD/PLAN approval and implementation.

Current work is design/evidence only: no src/scripts changes, tests, VM action, host daemon/Ollama operation, runtime chmod or blocked-isolate cleanup. Source definitions/endpoints/30subject mapping checked; no pixel rendering. The required Linux rerun must include real dash signal cleanup, since the retained bootstrap run is macOS bash in POSIX mode. Windows stays deferred. Original review packets and feedback remain unchanged.
