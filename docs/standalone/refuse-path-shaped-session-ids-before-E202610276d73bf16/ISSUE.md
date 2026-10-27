<!-- insrc:artifact ISSUE-6d73bf1602816c8f -->

# Refuse path-shaped session ids before purging a session's tmp directory

## Reproduction

With the daemon running, send `session.delete` with `{ "sessionId": ".." }` over the daemon socket. The id passes the only check (a non-empty string), and the purge removes `~/.insrc` (the parent of `~/.insrc/tmp`) recursively instead of a session's own tmp directory. Ids such as `a/../..` reach further up. Expected: the request is refused as invalid input and nothing outside `~/.insrc/tmp/<sessionId>` is removed. The same unchecked join is reached by `session.deleteBulk` and by the expiry/cap purge loop, which pass stored or caller-supplied ids to the same purge.

## Root cause

The session purge pipeline (`purgeSession`, src/daemon/handler-runtime.ts:169) builds the session's tmp directory as `join(PATHS.tmp, sessionId)` (src/daemon/handler-runtime.ts:243) with the raw id and removes it with `rmSync(tmpDir, { recursive: true, force: true })` (src/daemon/handler-runtime.ts:250). `join` resolves `..` and separators, so an id that is not a single path segment names a directory outside the tmp root (`PATHS.tmp` is `~/.insrc/tmp`, src/shared/paths.ts:48). `session.delete` (src/daemon/handler-runtime.ts:788) only rejects a missing or empty id (src/daemon/handler-runtime.ts:794) before calling the purge (src/daemon/handler-runtime.ts:796); the bulk and expiry paths (src/daemon/handler-runtime.ts:774, src/daemon/handler-runtime.ts:820) call it with no check at all. The code predates Epic 86197ac6 s2, whose task t1 moved it unchanged from src/daemon/index.ts into the handler runtime.

## Fix intent

A session id that is not a single path segment (empty, `.`, `..`, or containing `/`, `\` or NUL) is refused by `session.delete` with its existing invalid-input answer before anything is purged, and the purge, on every path that reaches it, removes a tmp directory only when it is a direct child of the tmp root, logging and skipping otherwise. Session ids that are single segments keep today's behaviour.

## Citations

- **[[c1]]** `code` `src/daemon/handler-runtime.ts:169` — "const purgeSession = async (sessionId: string, opts: { compact: boolean }) => {"
- **[[c2]]** `code` `src/daemon/handler-runtime.ts:243` — "const tmpDir = join(PATHS.tmp, sessionId);"
- **[[c3]]** `code` `src/daemon/handler-runtime.ts:250` — "rmSync(tmpDir, { recursive: true, force: true });"
- **[[c4]]** `code` `src/daemon/handler-runtime.ts:794` — "return { deleted: false, reason: 'invalid-input', message: 'sessionId required' };"
- **[[c5]]** `code` `src/shared/paths.ts:48` — "tmp:         join(INSRC_DIR, 'tmp'),"
- **[[c6]]** `code` `src/daemon/handler-runtime.ts:820` — "await purgeSession(id, { compact: false });"
