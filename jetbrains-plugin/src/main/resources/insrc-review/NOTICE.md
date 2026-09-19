# insrc review-panel bundled assets

## markdown-renderer.js

- **What:** a compact, dependency-free markdown → HTML renderer for the review
  content view (Story S002 / t4).
- **Origin:** first-party (authored in this repo), NOT a vendored third-party
  bundle. It carries no external dependency and makes no network call.
- **Version:** 1.0.0 (ships with the plugin; versioned with the plugin itself).
- **License:** MIT — same as the insrc plugin (see the repo root License.txt).
- **Loading:** inlined into the JCEF page from this classpath resource by
  `ReviewToolWindow`/the content view — never fetched from a CDN or remote URL,
  and rendered read-only.

If this is ever replaced by a vendored renderer (e.g. marked / markdown-it),
record its exact upstream version + license here and keep it a LOCAL resource.
