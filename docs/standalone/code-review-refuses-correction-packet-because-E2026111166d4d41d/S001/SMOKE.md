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

The installed daemon still runs the pre-change code, so the real start of attempt 4 (which repeats this check) happens after the daemon is updated.
