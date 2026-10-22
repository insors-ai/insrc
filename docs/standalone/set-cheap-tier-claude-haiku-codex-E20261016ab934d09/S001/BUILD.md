<!-- insrc:artifact BUILD-ab934d0926ef5dc7-s1 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-16T11:11:47.931Z  ·  **Updated:** 2026-10-16T11:27:47.529Z

**Commit:** 30ea327c

## Summary

The cheap tier now defaults to cli-claude / haiku in DEFAULT_TIERS, the config catalog and the plugin manifest; the installer's claude choice writes cheap haiku and its codex choice writes gpt-6-astra, gpt-6.1-sol and gpt-6-luna (both copies); the shipped cloud catalog lists the three GPT-6 Codex models; the summariser follows the cheap tier and pins its model for a CLI, replacing an Ollama-shaped id with the built-in cheap model for that CLI (haiku, gpt-6-luna) so the CLI default never runs; docs, site pages and stale comments name the new values. Existing config files are unchanged.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/daemon.md` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `docs/index.html` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `docs/installation.md` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `docs/standalone/make-code-references-docgen-companion-html-E20261016f52996c2/S001/PLAN.md` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `docs/standalone/set-cheap-tier-claude-haiku-codex-E20261016ab934d09/S001/LLD.md` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `scripts/insrc-daemon-install.sh` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `site/cli.html` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/analyze/context/__tests__/role-router.test.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/analyze/context/__tests__/summariser-provider.test.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/cli/__tests__/model-tiers.test.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/config/__tests__/tier-defaults.test.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/config/role-taxonomy.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `src/shared/model-recommender.ts` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `vscode-plugin/assets/insrc-daemon-install.sh` — **insrc-build** (2026-10-16T11:27:47.529Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-16T11:27:47.529Z)
