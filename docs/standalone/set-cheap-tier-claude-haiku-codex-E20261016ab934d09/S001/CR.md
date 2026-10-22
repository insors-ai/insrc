<!-- insrc:artifact CR-ab934d0926ef5dc7-s1 -->

# Code review: ab934d0926ef5dc7:S001

✅ **PASS** — HIGH 0 · MED 0 · LOW 2 · model `claude:opus`

**Changed files:** 20

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/context/role-router.ts:200 | The comment in resolveSummariser still describes the summariser factory as the 'summariser-stays-local decoupling'. After this Story the summariser follows the cheap tier, which defaults to the Claude CLI pinned to haiku. The line-80 doc comment was updated but this one was missed, so the file now contradicts itself about where the summariser runs. |

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/context/shaper-provider.ts:265 | SUMMARISER_CLI_FALLBACK hard-codes the cheap model for each CLI ('haiku' for cli-claude, 'gpt-6-luna' for cli-codex). The same ids are already the built-in cheap tier: DEFAULT_TIERS.cheap.model in src/config/analyze.ts, which resolveTiers reads; config-catalog's models.tiers.cheap.model default; and the installer's codex cheap tier. If the default cheap model changes in one place and not here, a CLI summariser handed an Ollama-shaped id would quietly fall back to a stale model. Deriving the claude entry from DEFAULT_TIERS.cheap.model, or keeping one per-CLI cheap-model map that both places use, would remove the drift. It is not wrong today because all copies agree. |

