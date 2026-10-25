# t10 live check: codex and the bounded VERIFY_SCHEMA

Run 2026-10-24 against the installed codex CLI (`gpt-6.1-sol`, effort high) through `verifyClaim`, which sends the design-verify row (stallMs 90000, timeoutMs 600000) and holds every reply to VERIFY_SCHEMA with the codex strict copy. Script: `t10-live-verify.mts` (beside this file).

Every call returned a reply that passed the reply check (no ModelResponseShapeError):

```json
[
  {
    "id": "p1",
    "ms": 9065,
    "ok": true,
    "severity": "LOW",
    "fixability": "manual",
    "hasFix": false,
    "evidence": "src/workflow/review/verify.ts:212 confirms: export const VERIFY_CALL_TIMEOUT_MS = REVIEW_CALL_LIMITS['design-verify'].timeoutMs!;"
  },
  {
    "id": "p2",
    "ms": 12281,
    "ok": true,
    "severity": "MED",
    "fixability": "auto",
    "hasFix": true,
    "evidence": "src/daemon/steps/build-step/phases/validate.ts:90 defines `export const JUDGE_DEADLINE_MS = 300_000;`, which is 300 seconds, not 120. The evidence establishes a factual mismatch but no concrete build-"
  },
  {
    "id": "p3",
    "ms": 11639,
    "ok": true,
    "severity": "MED",
    "fixability": "manual",
    "hasFix": true,
    "evidence": "Unverifiable: the grep output is truncated at 50 matches and contains no lines from src/workflow/review/call-limits.ts or references to REVIEW_CALL_LIMITS. It establishes neither the row count nor the"
  }
]
```

- p1, a true claim: LOW with no proposedFix. The prompt now asks for empty fields when there is no fix, and normalizeFix drops them.
- p2, a false claim: MED, auto, with a proposed fix (JUDGE_DEADLINE_MS is 300 s, not 120).
- p3, a claim the probe cannot settle: MED, manual, unverifiable.
