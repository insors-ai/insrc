# S003 task 10 — immutable factory logging authority

The session owner mints an opaque token for each exact canonical-root overlay. A private WeakMap binds immutable factory contexts to that token and its liveness check. Contexts carry the existing memory-only sc8 file policy and owner/root/id/revision identity; serialization, copied contexts and input-selected quiet flags cannot grant authority.

Temporary resource construction checks registered factory identity before handing over config. Owned config objects require their original owner/revision context even when passed directly to a tagged factory. Unknown factories and wrappers that drop context refuse. All 29 aliases in the 14 concrete driver modules forward context to the constructor guard before SDK initialization. Saved factories retain optional context and ordinary saved behavior.

Each constructor now captures a resource-local sink. Its quiet branch never resolves the normal logger or evaluates a lazy formatter, and remains quiet after authority expiry. No global logger, console or environment setting is changed. SDK/application event call sites still use their original logging until task 11; this intermediate task does not claim SDK privacy closure or normal daemon canary proof.

Three new authority tests pass. Twenty session-resource/reservation/registry cases and 23 profile/SQLite behavior cases pass. The field-audit run initially detected stale source and acquisition baselines; reviewed changes add no public configuration fields, and the updated three-case audit passes. Both session inventory cases pass (6,866 sites across 505 files). Typecheck and build pass. The release manifest remains ready:false with no enabled scopes; no full test sweep or daemon restart was performed.

The release hash closure now requires the helper and shared factory contract, preventing evidence that omits the new authority boundary. Session private resolver sites from task 9 are explicitly classified in the older acquisition inventory as well as the session inventory.
