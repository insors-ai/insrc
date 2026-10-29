<!-- insrc:artifact ISSUE-7aaf7e1b4a54e86f -->

# Provide live installed review qualification before activation

## Reproduction

Update and restart the installed daemon at dc8c3797f. daemon.status confirms that installed commit and codeReview.investigation.capabilities advertises plan-investigation-v1 with activation requires-verified-readiness and default legacy. Attempt to prepare a real review acceptance run: required installed-probe evidence and the independent trust anchor are absent, and no live probe execution/issuance path is supplied. Version inspection and scripted tests cannot establish the required evidence. Deployment evidence: /tmp/insrc-live-acceptance-20261030.jsonl; build/restart logs in /tmp/insrc-daemon-update-20261030.log and /tmp/insrc-daemon-restart-20261030.log. [[c1]] [[c2]]

## Root cause

The implementation consumes installed qualification evidence but does not supply the operator path that produces it. qualifyInvestigationAdapter validates supplied evidence; production adoption verifies its signature against an independently provisioned trust anchor. The caller graph identifies production adoption and scripted fixture callers, with incomplete graph coverage. Supplemental filesystem search finds no real installed-probe runner/issuer; native session execution itself requires qualification. This leaves a bootstrap gap for real acceptance while the production gates correctly stay closed. [[c1]] [[c2]] [[c3]]

## Fix intent

Provide a bounded, auditable operator acceptance path using the actual installed CLI through the provider abstraction. Collect independently verifiable effective inventory and denied-access evidence, durable progress and cancellation, installation/configuration pins, and explicit unsupported outcomes. Preserve independent trust and approval; never relabel scripted fixtures or auto-sign off activation. Then execute real source-only and indexed acceptance, document observed outcomes/accounting, and present activation evidence for user signoff. Keep legacy CODE review until acceptance and explicit signoff; preserve design review. [[c2]] [[c4]]

## Citations

- **[[c1]]** `code` `src/agent/providers/investigation-session.ts`
- **[[c2]]** `code` `src/daemon/review-investigation-adoption.ts`
- **[[c3]]** `code` `src/agent/providers/__tests__/native-investigation-fixtures.ts`
- **[[c4]]** `code` `src/agent/providers/native-investigation-session.ts`
