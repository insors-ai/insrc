# S003 task 9 — private driver resources and full callback leases

Temporary resources use the existing RevisionLeaseGate, guardedDriver and driver-work retention primitives. They do not reuse saved DriverPool storage, resolve saved secrets, or call legacy registerEphemeral. Config/credentials stay in immutable owner generations; SDK resources are private to session/root/revision. Construction and every callback operation/result recheck authority. A callback view hides raw SDK/config state and revokes on exit; its lease survives multiple calls, abandoned underlying work and late iterator cleanup. SDK-owned errors become fresh fixed errors inside the view.

| Owner / source | Owned target | Cardinality and lifetime |
| --- | --- | --- |
| Session | Canonical root overlay | One session owns multiple exact-root overlays; sibling counters enforce shared limits. |
| Overlay entry revision | SDK resource record | Zero or one construction/current SDK object per revision; retired handles remain private cleanup records. |
| Server-minted frozen access object | Lazy resolver factory | One weak binding per exact object; copied JSON/handles cannot redeem it. The factory validates the original transport/root/generation before saved lookup. |
| Callback lease | Guarded view and actual work | One lease spans construction, the complete callback, iterators and registered late operations. Updates refuse while it is active. |
| Closing session | Driver cleanup drains | Authority and configs drop synchronously; end/shutdown await owned driver construction/use/disposal. Failed closed handles stay retained and prevent false success. |

Request completion is now an explicit local authority check as well as an abort signal. A completed request cannot start a new resolver call from a retained access object. Serialized wire requests still carry only cloneable identity/epoch; no lifecycle or resolver function crosses a worker boundary. Saved-only resolver behavior stays unchanged.

Registration commits entry/revision/receipt before activation. Automatic activation occurs after releasing the root mutation gate; explicit activation retries the same committed revision. Concurrent identical mutations share the in-flight result, and status can report committed truth during activation. Retired cleanup phase is separately recorded and drained. Whole analysis run revision/cache policy and other run/probe/conversion cleanup remain their later tasks.

Seven new integration cases pass using real session sockets. They cover multi-call busy update/retry and revoked views, failed-constructor activation retry, late success/rejection construction after end, abandoned late iterator cleanup before end completes, owner/root/revision-specific immutable credential delivery through a private factory port, copied/completed/revoked access refusal before saved lookup, and actual readonly SQLite rows isolated across two owners, roots and revisions. Late-construction tests wait for a refused status round-trip proving end admission before releasing the constructor. Existing 54 directly relevant lease/memory/replay/owner/namespace/stream/lifetime cases, eight wire/context/local-lifetime regressions and both inventory cases also pass (71 total). Build passes.

Concrete SDK diagnostic quiet authority and normal-daemon log proof remain t10/t11; the private factory-port credential test is not live PostgreSQL/KV evidence. Full analysis integration and the complete expiry/resource matrix remain later tasks. Production release evidence stays disabled; no full regression sweep or user daemon restart was performed.
