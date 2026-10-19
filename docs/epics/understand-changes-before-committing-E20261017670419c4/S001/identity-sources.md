# Learner identity sources (T001)

Implementation: `src/understanding/identity.ts`. This is a daemon-side foundation; service registration and the persistent installation-host identifier are supplied by the later lifecycle/storage tasks. The resolver requires that identifier rather than inventing a new one on every call.

| Source | Existing connection evidence | Implemented source / stable field | Unavailable behavior |
| --- | --- | --- | --- |
| GitHub | `src/workflow/tracker/github.ts` has `ghAuthOk` and `ghCurrentLogin`; these return health/login, not stable IDs. `src/daemon/tools/shell-helper.ts` supplies bounded CLI execution. | `githubIdentities` uses `gh auth status --json hosts` to enumerate authenticated accounts on known hosts, then `gh api --hostname <host> users/<authenticated-login>` for `node_id`. Namespace is the canonical HTTPS host. No credential reads, login or account switching. | Missing executable: missing-integration. Empty hosts: disconnected. Failed account status, malformed/truncated response or lookup failure: unavailable. All discovery incomplete means Git/OS fallback, never treating a partial result as a unique identity. |
| GitLab | Production source search found CI manifest support, not an authenticated-account connector. | No concrete adapter installed; `IdentityDeps.providers` accepts a future trusted daemon adapter with authenticated stable subject and authority. | Explicit missing-integration diagnostic; no inference from remotes or names. |
| Jira | No authenticated-account connector identified in backend source. | No concrete adapter installed; same trusted adapter contract. | Explicit missing-integration diagnostic. |
| Git | Existing Git command infrastructure. | `localIdentityDeps` reads effective `git config --get user.email` in the repository. | Missing/failed lookup falls back to OS, with non-sensitive diagnostic. Never uses commit author or agent identity. |
| OS | Node standard library. | `userInfo().uid`, or username when UID unavailable; namespace is the supplied installation-host ID. | Failure to resolve the local principal fails the resolver; no anonymous fabricated owner. |

Exactly one fully discovered provider identity wins. Multiple provider identities or incomplete discovery use Git email; without usable Git email use OS identity. Exact duplicate source/authority/subject tuples are deduplicated, but differing subjects, case, providers or authorities are never merged. Subject whitespace is trimmed. All results bind a separate hashed OS principal. This provides local attribution, not authentication against other processes running as the same OS user.

Tests inject CLI responses and use a temporary real Git repository. They cover available, disconnected, missing and failed sources, multiple identities, authority/case isolation, invalid provider data and Git/OS fallback without inspecting live credentials or contacting providers.
