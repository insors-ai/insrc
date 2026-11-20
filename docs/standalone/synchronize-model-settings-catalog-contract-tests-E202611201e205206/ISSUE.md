<!-- insrc:artifact ISSUE-1e2052060dec3efb -->

# Synchronize model settings and catalog contract tests

## Reproduction

Manifest/catalog tests and the clean bundle check find missing build.resultFormat. indexer.docRelations defaults to mid in the extension while the taxonomy says cheap. The retired-role test rejects tools.convertEscalate despite nativeRoleKey deliberately mapping tools.convert.escalate to that native alias. The model literal scan also flags the documented local-provider guard.

## Root cause

The committed extension settings diverged from the catalog, and some assertions compare native aliases to raw role IDs or assume an outdated model-owner exclusion policy. The audit established the alias mapping and the missing/defaulted rows; the provider guard's ownership policy must be verified rather than removed blindly.

## Fix intent

Synchronize extension settings with authoritative catalog/taxonomy values, test native aliases through the supported mapping, and reconcile the doc-relations model guard with its explicit ownership policy. Acceptance: manifest checks, idempotent sync, clean compile/bundle key-map coverage, per-role defaults and model policy scans pass while preserving core-floor accuracy and local-only embeddings.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/config/role-taxonomy.ts`
- **[[c3]]** `code` `vscode-plugin/src/config/key-map.ts`
