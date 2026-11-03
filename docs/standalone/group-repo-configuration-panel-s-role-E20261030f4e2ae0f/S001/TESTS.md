<!-- insrc:artifact TESTS-f4e2ae0fdc016e87-S001 -->

# Tests: f4e2ae0fdc016e87 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-30T15:20:17.001Z on commit `ec1e3858a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: webview-host.test.ts: the shared shellHtml style block defines .section/.section-head/.count/.rows/.role-row/.provider-row/.status-chip/.floor-row rules**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the shared shellHtml style block defines .section/.section-head/.count/.rows/.role-row/.provider-row/.status-chip/.floor-row rules | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/webview-host.test.ts` | 0 | 35 | 0.6 s |  |

## t2

Run at 2026-10-30T15:42:39.438Z on commit `de04c0dab`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: repo-config.test.ts: renderRepoConfig renders 14 critical roles in an open <details> group and 20 peripheral roles in a closed <details> group, not one flat 34-row table**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderRepoConfig renders 14 critical roles in an open <details> group and 20 peripheral roles in a closed <details> group, not one flat 34-row table | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**unit: repo-config.test.ts: the core floor renders in its own <details>/section, separate from the role groups**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the core floor renders in its own <details>/section, separate from the role groups | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/repo-config.test.ts` | 0 | 21 | 0.5 s |  |

## t3

Run at 2026-10-30T15:31:22.722Z on commit `f8d03eb4e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: repo-config.test.ts: renderProvidersSection renders a 'registered' status chip with no checkbox for an already-registered provider, a checkable input plus a 'not registered' chip for an available-unregistered one, and a 'CLI not found on PATH' chip with no checkbox for an unavailable one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderProvidersSection renders a 'registered' status chip with no checkbox for an already-registered provider, a checkable input plus a 'not registered' chip for an available-unregistered one, and a 'CLI not found on PATH' chip with no checkbox for an unavailable one | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/repo-config.test.ts` | 0 | 17 | 0.4 s |  |

## t4

Run at 2026-10-30T15:33:20.460Z on commit `4b123fbd6`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: repo-config.test.ts: every existing data-segments / createRepoConfigWriteHandler / createRepoRegisterProvidersHandler test still passes against the regrouped markup, proving the write path is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderRepoConfig: discrete per-repo form fields from models.byRepo[repoPath] tasks and coreFloor (NOT raw JSON); missing entry -> all-global | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | createRepoConfigWriteHandler: on 'accepted' writeKeyPath called with EXACTLY ['models','byRepo',repoPath,...segments] + value (ac2 array form) | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | createRepoRegisterProvidersHandler: on accept, mcp.register is called with the repo + mapped steering; outcome surfaced + panel refreshed | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**unit: repo-config.test.ts: all roles at 'global' still render all 34 rows across both groups**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: all roles at 'global' still render all 34 rows across both groups | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**unit: repo-config.test.ts: no checkable providers omits the 'Register selected providers' button**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: no checkable providers omits the 'Register selected providers' button | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**unit: repo-config.test.ts: an mcpRegistration() rejection degrades only the Providers section to a hint paragraph; role groups and core floor still render**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: an mcpRegistration() rejection degrades only the Providers section to a hint paragraph; role groups and core floor still render | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/panels/__tests__/repo-config.test.ts` | 0 | 21 | 0.4 s |  |
