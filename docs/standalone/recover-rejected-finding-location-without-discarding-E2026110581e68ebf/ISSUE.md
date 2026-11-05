<!-- insrc:artifact ISSUE-81e68ebf54745c75 -->

# Recover a rejected finding location without discarding the whole task assessment

## Reproduction

Priority: MED. Review code-review-9b04adb36cac716d-s3-r1 task t6 generated a completed-looking assessment with verified test coverage and a LOW observation at coordinator.ts:378-383. The host rejected location as outside the submitted changed segments. The task then became failed, with no findings, no inspected references and unverified coverage; the rejection diagnostic alone retains the discarded assessment. The LOW also described behavior already addressed by a later submitted t8 commit, linking this to the separate final-version issue. [[c1]] [[c2]]

## Root cause

validateTaskResult correctly enforces the submitted segment boundary, but a location-validation exception from this result turns the whole task into technical failure instead of obtaining a corrected in-scope result or classifying a genuine out-of-scope observation as nonblocking context. No accepted task result survives. The boundary itself must remain strict; the defect is loss/recovery behavior around host rejection, not that arbitrary source lines should be admitted as findings. [[c1]] [[c3]]

## Fix intent

Provide bounded, pointed location-rejection feedback and preserve valid assessment work while obtaining a compliant result within the authorized execution/attempt policy. Genuine out-of-scope observations may be explicit advice, never silently admitted as scoped findings or automatically used to expand the packet. Do not auto-relocate a finding to a changed line without evidence. Add native/controller tests where one otherwise valid result contains an out-of-scope LOW and verify deterministic correction/error reporting without losing required coverage evidence. Log only. [[c1]] [[c3]]

## Citations

- **[[c1]]** `doc` `.insrc/tmp/code-review/code-review-9b04adb36cac716d-s3-r1.json`
- **[[c2]]** `doc` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S003/CR.md`
- **[[c3]]** `code` `src/workflow/code-review/task-review/results.ts`
