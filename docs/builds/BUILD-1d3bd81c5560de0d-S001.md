# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-08-07T15:23:22.645Z

## Scope

MED1 nested-closure shadow (walkForCalls axios proof → per-scope AxiosScope stack via collectScopeFrame/isProvenAxios; nearest declaring scope decides, outer-capture preserved); MED2 inner class in method (save/switch/restore currentClassHttpFields on entering any class node in walkForCalls); LOW Python same-function rebind (collectPyProvenHttpReceivers last-binding-wins). 5 new TS + 2 new Python precision tests; tsc clean; 165 indexer tests pass.

## Triage rationale

Scope-aware proven-receiver dataflow (nested shadow + inner class + rebind) — precision fast-follow (2 MED + 1 LOW) from the S001 review; internal-only recognizer hardening in typescript.ts + python.ts, no API/schema change.
