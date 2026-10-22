<!-- insrc:artifact BUILD-59da3204a44afd1b-s1 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T10:25:29.172Z  ·  **Updated:** 2026-10-13T06:09:34.817Z

**Commit:** f21955c6

## Summary

Pasted images and picked documents are copied to the chat's own folder under ~/.insrc/chat-attachments, shown as removable chips under the prompt, sent with the next message as paths the CLI may read, and shown as chips on the sent message that open the file. Checked with the real claude and codex CLIs and in the panel by the user. A paste fix (commit bdd0a0ef) was made after the user's first paste did nothing: the handler also reads images offered as files and says what the clipboard offered when it has no image; which of that and the second reload made paste work is not known.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-2284d9b47fc9c35e-s1.json` — **insrc-build** (2026-10-13T06:09:34.817Z)
- `docs/standalone/codex-chat-turns-hang-because-cli-E202610122284d9b4/S001/BUILD.md` — **insrc-build** (2026-10-13T06:09:34.817Z)
