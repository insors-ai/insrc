<!-- insrc:artifact ISSUE-46667edffe5cc451 -->

# Remediate critical, high, and moderate Dependabot alerts

## Reproduction

Open the repository Dependabot dashboard and filter the open alerts by critical, high, and moderate. The November 8, 2026 snapshot has 122 matching alerts: 110 in the root lockfile and 12 in four historical project-memory Linux qualification lockfiles. Compare the resolved versions in the root lockfile with the advisory ranges. Resolve packages/project-memory in isolation on Node 22 to reproduce the separate consumer exposure to sharp 0.33.5.

## Root cause

The locked dependency graph resolves affected direct and transitive versions across the daemon transport, notification, database, and native dependency paths. The critical proxy-addr 2.0.7 enters through Express under the MCP SDK. The shipped server uses stdio, so an exposed trusted-proxy route was not established. Project memory resolves a separate affected sharp through LanceDB's pinned optional Transformers dependency. The same dependency appears in four archived qualification snapshots. A disposable lockfile resolution on Node 22 put all 110 root alerts outside the affected ranges; that experiment did not validate runtime behavior.

## Fix intent

Deliver three reviewable batches: (1) remediate daemon transport and compatible dependency updates, and remove unused dependencies after confirming callers; (2) remediate SMTP and database-driver dependencies and verify their live or fixture-backed flows; (3) remediate native dependencies and verify that independently installed project-memory consumers receive a safe graph. Preserve the four historical snapshots and record how their alerts will be handled separately from active dependencies. Validate on the supported Node 22 baseline, including clean native installs on macOS and Linux, ONNX startup, and reopening an existing memory store. Run targeted tests per batch and the full sweep after all build tasks. Track unavailable service coverage and verify resulting GitHub alert states. Reproduce the ZIP destination-symlink scenario because the upstream release notes list a fix that the GitHub advisory does not identify as a patched version.

## Citations

- **[[c1]]** `doc` `https://github.com/insors-ai/insrc/security/dependabot`
- **[[c2]]** `doc` `https://github.com/insors-ai/insrc/security/dependabot/85`
- **[[c3]]** `code` `src/mcp/server.ts`
- **[[c4]]** `doc` `package-lock.json`
- **[[c5]]** `doc` `packages/project-memory/package.json`
- **[[c6]]** `doc` `https://github.com/advisories/GHSA-vwc7-r8mq-g2x9`
- **[[c7]]** `doc` `https://github.com/cthackers/adm-zip/releases/tag/v0.6.1`
