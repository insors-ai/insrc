# s1/t15 evidence — VS Code Daemon tab lists repositories with completeness

## What changed

- `RepoRef` (vscode-plugin/src/panels/types.ts) gains optional `status` and `completeness` (the daemon's shared `RepoCompleteness`).
- `registeredRepos` (daemon-gateway.ts) carries both from repo.list when present.
- `renderDaemonTab` (detail-renderers.ts) lists each repository below the daemon status:
  - name, status, and a "complete" or "incomplete" badge, with an incomplete repository's reasons listed (each carries its count);
  - no badge when the field is absent (unknown).
  - If repo.list fails, the status stays shown and the list says it is unavailable.
- The list's styles are added to the shared shell CSS in webview-host.ts; the dispatch is unchanged.

## Smoke: headless-Chrome screenshot, read by eye

`t15-daemon-tab.png` (beside this file). The real host (`createWebviewPanelHost` → `openDetailedStatus` with `renderDaemonTab`) renders three repositories, captured as HTML and shot by headless Chrome at 760×520. Read: under "Repositories":
- "insrc ready" with a green "complete";
- "afm ready" with a boxed amber "incomplete" and its three reasons as a bulleted list;
- "findme indexing" with no badge.

The daemon status (running, uptime line) is above, and the Daemon tab is active.

## Mutations (vscode-plugin/src/panels/__tests__)

| Mutation | Failing test |
| --- | --- |
| gateway drops completeness | daemon-gateway: registeredRepos() carries each repository's status and completeness |
| renderer shows no completeness | detail-renderers: renderDaemonTab lists each repository ... |
| incomplete reasons not listed | detail-renderers: renderDaemonTab lists each repository ... |

## Plugin suite

The panels tests pass 21/21. The whole plugin suite (`npx tsx --test --test-force-exit --test-timeout=60000 'src/**/__tests__/*.test.ts'`): # tests 1429 # pass 1401 # fail 6 # cancelled 14 # skipped 8 

Every failure and cancellation is in files t15 does not touch: activation, chat cli-adapter, config manifest-catalog, delivery-client and model-tier-picker. Those files give the identical result (110 pass, 5 fail, 14 cancelled) with the t15 change stashed. They predate this task.
