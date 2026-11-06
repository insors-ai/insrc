<!-- insrc:artifact ISSUE-fefa97b991537da7 -->

# Open saved connections on demand and read all credentials with one keychain prompt per daemon run

## Reproduction

1. Save one or more data connections with credentials (they are stored in the macOS login Keychain under the service 'insrc'; this machine has 9 such items).
2. Change the program that reads them, for example a Homebrew node upgrade, or on a first start after install.
3. Restart the insrc daemon (an update, the TUI restart, or a plugin restart).

Observed: macOS shows a Keychain access dialog (the SecurityAgent process) for an insrc item. The daemon process runs, but it does not open its socket until the dialog is answered, so the CLI, MCP tools and both IDE plugins report the daemon as not running. The dialog appears once per stored item, so the user types the login password for every saved secret. Seeded test daemons stall the same way and their tests time out at start. Seen on 2026-11-01 and repeatedly on 2026-11-04.

Expected: the daemon starts and serves requests without touching the Keychain. The first request that needs a saved secret asks for the Keychain password once; after that, no request asks again until the daemon restarts.

## Root cause

Two causes.

1. The daemon reads secrets at boot, before it listens. main() in src/daemon/index.ts:458 calls ensureDefaultManagedRoot for every registered repository before await server.listen() at src/daemon/index.ts:522. ensureDefaultManagedRoot (src/daemon/db/management-defaults.ts:58) calls openManagedRoot (src/daemon/db/management-startup.ts:24), which opens SavedTicketAuthority with the keystore (src/daemon/db/management-startup.ts:44, which reads its key through options.keystore.getKey at src/daemon/db/management-tickets.ts:110), reads every rollback copy (src/daemon/db/management-startup.ts:53) and, through enabled() (called at src/daemon/db/management-startup.ts:90), reads every secret each saved connection refers to (src/daemon/db/management-startup.ts:85). Each read is keytar.getPassword (src/shared/keystore.ts:16), which blocks until the OS answers; a pending access dialog therefore holds the whole boot.

2. Each secret is its own Keychain item, read again on every use. src/shared/keystore.ts stores every key as a separate item under the service 'insrc' (src/shared/keystore.ts:10, :23) and every getKey goes to the Keychain. macOS keeps an access list per item, so when the reading program is not on an item's list, every item prompts separately: several saved secrets mean several password prompts.

## Fix intent

1. Daemon start does not read the Keychain: the socket opens and requests are served without any secret being read. Saved connections are opened on demand: a connection's secrets, and the integrity and recovery checks that need them, are read when a request first uses them, not at boot. A connection whose secrets cannot be read is reported unavailable to that request with its cause, and nothing else waits for it.
2. The user is asked for the Keychain password once per daemon run. On the first request that needs any saved secret, every saved secret is read in that one Keychain access and kept in a secret store held in the daemon's memory, which serves every later read until the daemon exits. A daemon restart or update asks once again. Nothing decrypted is written to disk. Because one access can prompt only once if it reads one item, the saved secrets are consolidated so that a single Keychain item covers all of them. Saving, replacing or removing a secret keeps the in-memory store and the Keychain consistent.
3. The other users of the same keystore wrapper (tool configuration, the notify and web builtins, the connection maintenance tool) follow the same method.
4. Existing per-item secrets migrate to the consolidated form without loss; a failed migration leaves the existing items readable.

## Citations

- **[[c1]]** `code` `src/daemon/index.ts:458` — "await ensureDefaultManagedRoot(registered.path, {"
- **[[c2]]** `code` `src/daemon/index.ts:522` — "await server.listen();"
- **[[c3]]** `code` `src/daemon/db/management-defaults.ts:58` — "export async function ensureDefaultManagedRoot(root:string,ports:StartupPorts=...):Promise<void>{"
- **[[c4]]** `code` `src/daemon/db/management-startup.ts:44` — "const tickets = await SavedTicketAuthority.open({ root, registryId: envelope.registryId, adopted: true, keystore, isRegistered: ports.isRegistered });"
- **[[c5]]** `code` `src/daemon/db/management-startup.ts:53` — "const value = await keystore.getKey(rollback.copyRef);"
- **[[c6]]** `code` `src/daemon/db/management-startup.ts:85` — "if (!generations.owns(ref) || await keystore.getKey(ref) === null)"
- **[[c7]]** `code` `src/daemon/db/management-tickets.ts:110` — "try { stored = await options.keystore.getKey(ref); } catch { throw new TicketError('secret-unavailable'); }"
- **[[c8]]** `code` `src/shared/keystore.ts:16` — "return keytar.getPassword(SERVICE, name);"
- **[[c9]]** `code` `src/shared/keystore.ts:10` — "const SERVICE = 'insrc';"
- **[[c10]]** `stakeholder` `Subho Ghosh, in chat 2026-11-05` — "connections should only be opened on demand. also, this seems to ask for each connection. we need to figure out a less intrusive method for getting credentials, if the user needs to enter the keychain"
- **[[c11]]** `stakeholder` `Subho Ghosh, in chat 2026-11-05 (refinement)` — "should ask for password once, fetch everything and then store in a local secret store for use till next reboot ... daemon restart"
- **[[c12]]** `prior-artifact` `ISSUE-9c92bca604070a4e` — "superseded: same defect; fix intent refined by c11"
- **[[c13]]** `code` `src/daemon/tools/config.ts`
