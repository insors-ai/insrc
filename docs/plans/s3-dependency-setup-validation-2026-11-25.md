# S3 dependency setup validation — 2026-11-25

All 152 tests passed across 34 selected files, with zero failures, skips, cancellations or todo cases. The canonical Node 22.22.1 build passed. Source/output fingerprints, exact file coverage and per-child admission/close/disposal identity were independently checked by the existing post-run installer audit after coordinator cleanup.

Run: `1ceabce5-def9-4d72-9280-0281c093cbbb`. Tested source commit: `8e2534b48dea18c279756c1661c3ffe0c6b0b40b`. Process-group ownership recording was explicitly enabled with `INSRC_BUILD_CONFIRM_CLOSURE=1`; all 43 admissions have matching close and disposal records. Cleanup is confirmed, the actor directory is empty, and no recorded cancellation/evidence errors remain. This is finite test-process evidence; the native Ollama service was intentionally retained until the isolated VM was stopped.

The first run passed all 152 tests but failed the post-run audit because I omitted the ownership-recording flag. Its legacy-mode cleanup evidence was insufficient. The complete regression was repeated with the required flag and unchanged source; the earlier run is preserved as superseded, not treated as a qualifying pass.

## Scope and checks

The selection includes every current installer test, installation-home, build-script, forbidden-spawn scan and test-coordinator regression. It covers bundle/dev preparation, consent/recovery, bounded ZIP/tar.zst decoding, metadata-only installed dependency inspection, retained-service admission, real production composition, packaging and ready-before-TUI behavior. It does not run the unrelated backend suite.

The standalone post-run check reuses `scripts/__tests__/installer-s2-qualification.test.ts`; its historical filename/title is unchanged, while its expected installer-file list is derived from the current corpus. It checks the exact 34-file result set, TAP totals, current source/output fingerprints, canonical artifacts, unique child journal identity, actual disposal state, empty actor directory and released coordinator ownership.

See [machine-readable evidence](s3-dependency-setup-validation-2026-11-25.json), [regression log](s3-dependency-setup-validation-2026-11-25.log), [audit log](s3-dependency-setup-validation-2026-11-25-audit.log) and [native qualification](s3-ollama-native-qualification-2026-11-25/qualification.json). Detailed file/child logs remain under `.insrc/tmp/test-harness/runs/1ceabce5-def9-4d72-9280-0281c093cbbb`.

## Native result and limits

The official pinned Ollama Linux ARM64 archive was downloaded live, verified and installed privately in the native OrbStack guest using Node 22.22.1. CLI/API version, user-only paths/environment, no models, decline/reuse and finite closure were verified. Cold-advised fresh inspection took approximately 36 ms and read 39,507 characters for a 4.01 GB installed payload. Download archive SHA-256 remains mandatory; installed bytes are not repeatedly rehashed.

Only that exact Linux ARM64/glibc2.35 dependency route is enabled. Five other platform/architecture routes remain pending with concrete reasons and user-level manual guidance. This is not full daemon/IDE/migration qualification; S4/S5 and later stories still own those capabilities. The approved change to remove Node from application payloads and resolve live-downloaded runtimes remains S1/S2 work.

All S3 implementation and qualification tasks precede this regression. Relevant sequence source is aligned with the approved no-rehash design; browser rendering was not checked. Host daemon/Ollama were unchanged and the disposable OrbStack VM is stopped. Final human S3 BUILD approval is pending.
