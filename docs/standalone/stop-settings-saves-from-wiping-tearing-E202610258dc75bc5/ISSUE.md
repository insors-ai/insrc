<!-- insrc:artifact ISSUE-8dc75bc5ee1aa020 -->

# Stop settings saves from wiping or tearing config.json

## Reproduction

1. Make ~/.insrc/config.json unparsable (for example, delete its closing brace) or unreadable (chmod 000).
2. Save any one setting from a client, for example a tier effort from the TUI or an IDE settings page (this sends the daemon's config.write request).
Observed: the save succeeds and config.json now holds only the one setting just saved; every other setting (tiers, tasks, per-repo choices, local models) is gone, with no error or warning.
Expected: the save is refused with an error saying the settings file cannot be read or parsed, and the file is left as it was.

The TUI's Setup apply behaves the same way: with an unparsable config.json it writes the recommendation over the whole file.

Separately, both config.write and Setup write config.json in place, so a crash or full disk mid-write leaves a truncated file that the next start cannot parse. And the reconcile writer used at daemon boot and by the updater writes through a fixed temporary file name (config.json.tmp), so two writers running at once (the updater's reconcile and a daemon save) can write to the same temporary file, and a save made between reconcile's read and its rename is overwritten.

## Root cause

config.write (src/daemon/handler-runtime.ts:1283-1298) reads config.json inside a try whose catch is `/* start fresh */` (:1287), so a read or parse failure leaves `config` as an empty object; it then sets the one path and writes the whole object back with writeFileSync in place (:1298). Setup's apply (src/cli/services/setup.ts:34-57) has the same start-fresh catch (:40) and in-place writeFileSync (:57). Neither goes through the write-temp-then-rename commit seam in src/config/reconcile-io.ts (commit, :124), and neither takes part in its concurrent-modification check. That seam itself uses one fixed temporary path, `${path}.tmp` (:131), for every writer, and its check re-stats the file before writing the temporary file (:136-143) and then renames, so a write that lands after the check is still overwritten and two simultaneous writers share the temporary file.

## Fix intent

Every write of config.json refuses to proceed when an existing file cannot be read or parsed (no write, an error naming the file and the problem; a missing file is still created), so a corrupt file is never silently replaced. config.write and Setup write through the shared atomic seam, so no reader ever sees a partial file and a crash mid-write leaves the previous file. The seam uses a unique temporary file per write, and a write that would overwrite a change another writer made after this writer read the file is detected and retried or refused instead of losing that change. Existing setting values and the shapes of the config.write request and result are unchanged apart from a refusal reason.

## Citations

- **[[c1]]** `code` `src/daemon/handler-runtime.ts:1287` — "} catch { /* start fresh */ }"
- **[[c2]]** `code` `src/daemon/handler-runtime.ts:1298` — "writeFileSync(PATHS.config, JSON.stringify(config, null, 2), 'utf-8');"
- **[[c3]]** `code` `src/cli/services/setup.ts:40` — "catch { /* start fresh */ }"
- **[[c4]]** `code` `src/cli/services/setup.ts:57` — "writeFileSync(PATHS.config, JSON.stringify(merged, null, 2) + '\n', 'utf-8');"
- **[[c5]]** `code` `src/config/reconcile-io.ts:131` — "const tmp = `${path}.tmp`;"
- **[[c6]]** `code` `src/config/reconcile-io.ts:124` — "function commit("
- **[[c7]]** `prior-artifact` `HLD-ce99b72065d03b1b` — "Review cycle 4 round 3 findings on settings writes, moved out of Epic ce99b720 by user decision 2026-10-25."
