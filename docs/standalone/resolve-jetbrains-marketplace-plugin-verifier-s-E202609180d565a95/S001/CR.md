<!-- insrc:artifact CR-0d565a953288f511-S001 -->

# Code review: 0d565a953288f511:S001

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 2 · model `client`

**Changed files:** 3

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/platform/RunOnceTest.kt:1 | The concurrent register-then-fire INTERACTION (a losing project-open observing the full consumer list before it broadcasts) is proven at the RunOnce mechanism level (the new `a losing caller blocks until the winning action completes` test + the exactly-once concurrent test), not via a multi-window fixture integration test. Acceptable: BasePlatformTestCase hosts a single project so a true two-window race can't be staged in-fixture, and the CountDownLatch makes the ordering correct-by-construction (happens-before from the winner's registers to the loser's await return). No fix needed. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/platform/InsrcPluginStateListener.kt:61 | RunOnce.run's `complete.await()` is a thread-blocking call executed inside the suspend InsrcProjectOpenActivity.execute coroutine. It is bounded by the winner's fast, non-I/O registration action (five list-adds + two production() service lookups), so the block is brief and benign; the only edge (coroutine cancellation interrupting a loser's await) affects a project-open that is being cancelled anyway. A timeout-bounded await would be fully coroutine-clean but is not warranted here. Noted, not blocking. |

