<!-- insrc:artifact PLAN-3789fd85d0bbeb22-s1 -->

# Plan: STORY-3789fd85d0bbeb22-s1

## Summary

**Epic:** `capture-live-review-inventory-active-isolation`
**LLD run:** `wf-1793342352842-seipma`
**LLD effective hash:** `ae55aecf8510...`

Add native startup-event capture under the actual review launch and active temporary configuration canaries with separately labelled controls. Integrate strict phase evidence and shared execution limits, then verify the installed daemon after deployment. Missing runtime facts remain unsupported, and activation stays a separate signoff.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Capture bounded Claude native startup events | M | — | — | unit: Native JSONL startup inventory survives cancellation; partial tail is diagnostic only; unit: Malformed contradictory unknown-version and oversized streams never pass isolation; unit: Native-only terminal result validation preserves ordinary Claude buffered completions | [[c1]] |
| 2 | **`t2`** Build active temporary canaries with labelled controls | M | — | `t1` | integration: Project discovery canaries and labelled positive controls produce attributable host observations; integration: Inactive controls missing native telemetry and model claims remain unverified | [[c2]] |
| 3 | **`t3`** Integrate bounded paired probes and strict phase exports | M | — | `t1`, `t2` | integration: Restricted capability leaks fail and control-phase evidence cannot qualify production; integration: Combined phase deadline budget capture bounds and shared provider lane prevent retries or overlap; integration: Raw phase export rejects tampering foreign roots stale pins and control-to-production promotion | [[c3]] |
| 4 | **`t4`** Verify installed behavior and publish honest handoff | S | — | `t3` | live: Serial bounded installed control and restricted attempts record startup inventory and canary results honestly for both modes; smoke: Runbook distinguishes verified capabilities diagnostic controls unsupported facts and separate activation signoff; integration: Affected native and ordinary provider regressions and build pass | [[c4]] |

### 1.1 TASK-3789fd85d0bbeb22-s1-t1 — Capture bounded Claude native startup events

Switch shared native investigation args to version-pinned streaming output and add strict native-only terminal parsing. Preserve startup frames through cancellation and collect actual inventory facts. Include production adoption args/digest in parity tests; leave ordinary completions, design review and Codex unchanged.

**Acceptance checks:**
- Restricted probe and production share exact streaming launch and digest derivation; previous qualifications become stale.
- Startup inventory survives cancellation with bounded complete-frame parsing; malformed/conflicting/unknown telemetry cannot pass isolation.
- Native final reply requires one valid terminal result and accepted-reply equality; ordinary buffered completions remain compatible.

### 1.2 TASK-3789fd85d0bbeb22-s1-t2 — Build active temporary canaries with labelled controls

Replace shadow marker files with actual private project discovery settings, hooks, CLAUDE.md, MCP and local plugin components. Bind manifest/marker observations to attempt and phase. Provide fixed provider-internal positive-control setup with no real HOME/config changes or credential copies. Unavailable discovery/telemetry stays unverified.

**Acceptance checks:**
- Canaries live in supported discovery paths and positive controls produce capability-specific native/host signals.
- Inactive controls, missing instruction/plugin signals and marker silence never become exclusion evidence.
- Fixture components remain private and harmless; real config/auth/repo untouched, foreign identities rejected and resources cleaned.

### 1.3 TASK-3789fd85d0bbeb22-s1-t3 — Integrate bounded paired probes and strict phase exports

Run at most one labelled control then one restricted phase through CliProvider under existing lane and aggregate 300-second/128K/output limits. Extend optional bounded diagnostic descriptors and owned-file validation. Keep control facts separate from restricted evidence, observe actual process drain and refuse leaks/tampering/stale pins; preserve canonical authority and no-key activation policy.

**Acceptance checks:**
- All provider calls are serial with one shared absolute deadline and inclusive budget; UUID replay and interruptions never retry phases.
- Strict export schema validates phase identity/order, manifests, private ownership, file sizes/digests, source/runtime/model/catalog/config/launch pins.
- Positive-control output cannot qualify the production launch; only affirmative supported evidence can establish tested exclusions, with missing facts unsupported and leaks failed.
- Cross-run checks use actual foreign capability refusals. Overall approval isolation stays unverified without reliable native escalation evidence; flags alone cannot pass.

### 1.4 TASK-3789fd85d0bbeb22-s1-t4 — Verify installed behavior and publish honest handoff

Update operator docs, run affected regression suites and build, then after deployment run one explicitly authorized serial pair per selected mode. Record actual startup/canary/checkpoint/cancel results and residual unsupported checks with truthful accounting. Run the mandatory final Story code review once, with no automatic repeated rounds; activation signoff remains separate.

**Acceptance checks:**
- Affected focused regressions and build pass; ordinary/native/Codex compatibility checked within changed boundary.
- Installed verification binds exact deployment and both modes, with one control/restricted pair each and no automatic retry; pending deployment is not reported as executed.
- Report and runbook distinguish verified facts, controls, missing evidence and activation. Unsupported is an honest diagnostic outcome, never a qualification/activation pass; unknown usage stays null.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Native JSONL startup inventory survives cancellation; partial tail is diagnostic only | `t1` |
| Malformed contradictory unknown-version and oversized streams never pass isolation | `t1` |
| Native-only terminal result validation preserves ordinary Claude buffered completions | `t1` |
| Project discovery canaries and labelled positive controls produce attributable host observations | `t2` |
| Inactive controls missing native telemetry and model claims remain unverified | `t2` |
| Restricted capability leaks fail and control-phase evidence cannot qualify production | `t3` |
| Combined phase deadline budget capture bounds and shared provider lane prevent retries or overlap | `t3` |
| Raw phase export rejects tampering foreign roots stale pins and control-to-production promotion | `t3` |
| Serial bounded installed control and restricted attempts record startup inventory and canary results honestly for both modes | `t4` |
| Runbook distinguishes verified capabilities diagnostic controls unsupported facts and separate activation signoff | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails 2.1-2.2 and dataModelChanges 3.1` — "Shared streaming native launch, version-pinned startup collection and native-only final parsing."
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges 3.2 and errorPaths` — "Active temporary discovery canaries with attributable positive controls, no real config/auth edits, and unobservable facts unverified."
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges 3.3-3.4 and errorPaths` — "Strict phase evidence, exact launch pins, aggregate bounds, provider lane, cancellation and no retries; no control promotion."
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy and migration` — "Focused compatibility regressions, explicitly authorized post-deployment installed probes, honest accounting and no implicit activation."
