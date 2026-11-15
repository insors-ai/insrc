# Smoke evidence: Story 66d4d41d99f805af/s1, Task t4

Recorded 2026-11-11 against this repository, with the t4 code (listing-driven pathContinuity), RegistryReviewSources and the default ProjectionBudget.

## 1. Correction packet of Story eedc4519199b24b4/s1 at pin 92491bba9

Before this Story the same packet was refused with `projection_limit: Projection decoded byte limit` (62.8 MiB read before the 64 MiB cap).

```json
{"result":"admitted","pin":"92491bba943e2a8212a5ac52407d3e9fdcba9fd3","commits":28,"entries":135,"identity":"56504efb652d4e33d6ed005ed02c10d48e0341c537c8b8eebaecd8eb94d06700","reads":1088,"decodedMiB":10.89,"ms":22070}
```

## 2. Saved attempts 1-3 of review board-common-model-s1

The admission check from src/workflow/code-review/task-review/admission.ts:47-48, run offline: each saved packet re-prepared with prepareReviewPacket and its stored finalScopeIdentity (computed by the pre-change code) compared.

```json
{"attempt":1,"pinned":true,"stored":"e4aa61b8d2e9adc9f4d802126a01767348314a1ca67d57ea36d465ef91a5dc42","reprepared":"e4aa61b8d2e9adc9f4d802126a01767348314a1ca67d57ea36d465ef91a5dc42","match":true}
{"attempt":2,"pinned":true,"stored":"a1e9d67d5847b98fe4c2ea32e245364451ed2b740ce1e009eb901f1205b3d411","reprepared":"a1e9d67d5847b98fe4c2ea32e245364451ed2b740ce1e009eb901f1205b3d411","match":true}
{"attempt":3,"pinned":true,"stored":"c7247958553fe84792e4b1996086ca91f465cec50f4db52b716a115a3bdad358","reprepared":"c7247958553fe84792e4b1996086ca91f465cec50f4db52b716a115a3bdad358","match":true}
```

The installed daemon still ran the pre-change code on 2026-11-11, so the real start was left for after the daemon update (section 3).

## 3. Real start on the updated daemon (2026-11-14)

The installed daemon was updated to d3372e83b, which contains this Story. The same packet (pin 92491bba9, 28 commits) was started for real as review board-common-model-s1:

- Attempt 4 (2026-11-14T15:36:21Z) passed projection and was then refused by the separate storage-capacity check (`Complete terminal review envelopes exceed storage capacity`, src/workflow/code-review/task-review/capacity.ts:95). The Story's CR record already held three rounds (1.83 MB pretty-printed). The check adds a fourth round and a fixed reserve of about 1.8 MB for later diagnostics and metadata; by estimate (the exact measure was not printed) the envelope came to about 4.2 MB, over the 4 MiB `review.maxJsonBytes`. That is a separate limit, not the projection limit this Story fixes. `review.maxJsonBytes` was raised to 8 MiB, the documented recovery.
- Attempt 5 (2026-11-14T15:44:46Z) was admitted and started reviewing all ten Tasks (t1-t10). Its stored finalScopeIdentity is `56504efb652d4e33d6ed005ed02c10d48e0341c537c8b8eebaecd8eb94d06700`, the identity section 1 computed offline.
