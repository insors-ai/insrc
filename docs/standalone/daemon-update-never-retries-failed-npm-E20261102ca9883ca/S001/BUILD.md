<!-- insrc:artifact BUILD-ca9883ca42f4d73f-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-02T12:14:26.040Z  ·  **Updated:** 2026-11-02T12:14:26.040Z

**Commit:** 9355bdead

## Summary

update() now installs when node_modules/.insrc-install-ok is missing or holds another lockfile's blob hash, removes the marker before npm install and writes it only after npm exits 0, and runs npm install with -std=c++17 appended to CXXFLAGS. Fake-npm integration tests over a scratch git checkout; every acceptance check mutation-checked.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.
