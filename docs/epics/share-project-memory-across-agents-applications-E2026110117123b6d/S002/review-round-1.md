# S2 design review — round 1

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-11-02T06:08:11.209Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | Listing packages/project-memory/src/types.ts as a call site for §3.2 (Admission snapshot) is consistent with §3.8's separate claim that sc1/sc2 signatures are consumed 'without signature changes.' | types.ts is the file that defines the public sc1/sc2 contracts themselves (MemoryCommand, Scope, MemoryFailureCode, etc. — verified by reading the file). The LLD does not say whether listing it as a §3.2 call site means 'imports types from it' (consistent with §3.8) or 'adds/modifies entries in it' (which would contradict §3.8's no-signature-change invariant); no admission-specific addition to this file is itself specified anywhere in the LLD. | Ask the author to state explicitly in §3.2 whether types.ts is touched only as an import source or whether any (non-sc1/sc2) private type additions land there, so it cannot be read as contradicting §3.8's unchanged-signature invariant. |

Author correction: types.ts is read-only input, unchanged; new private declarations belong to queue/types.ts. Regenerated LLD for round 2.

