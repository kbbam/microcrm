# Isolated live Twenty QA — September 30, 2026

Endpoint: `https://bam-sales-coach-test.twenty.com`. Every sales-record read/write in this proof was restricted to reserved synthetic company `bb1ba095-cc63-4ff8-97c1-7c446fe63de4` (QA Northstar Supplies). The connector uses the owner-approved test Admin key, while coach attribution comes from trusted host actor `kb@jpgrowery.com`. Admin API access does not imply the actor's own API permissions. The parent separately verified the genuine regular-member UI session.

## Actual projection and readback

`projection-plan.json` retains the source-backed fixture instruction, initially blocked proposals and fixed record identities before submission. `projection-results.json` records successful retry through CoachService after bounded automation review. `projection-readback.json` records live GraphQL readback and refreshed account context.

| Object | Synthetic ID |
| --- | --- |
| Company | `bb1ba095-cc63-4ff8-97c1-7c446fe63de4` |
| Person (no email address) | `a13b1faa-6b7a-4386-9910-c9358c1ea400` |
| Relationship note | `81fa9867-572a-493e-9c1d-228ad7b6ae0b` |
| Preparation task | `c80c3d66-0417-48c4-9cc1-ccae86110e03` |
| ENGAGED repeat-order exploration | `533a2ee7-9c45-4b48-b2a4-b61f5aac2dd5` |

Original source `406dc70ba7ef26dc1bfa01d0fba745bfe2ba70893289b4f285b7bdafcbca2c1b`, price/reliability objection, unhurried relationship interpretation and prior Lost trial remain richer context alongside the operational projection. The new opportunity is a distinct synthetic fixture, not evidence that the original customer statements qualify a real pursuit or prove any outcome.

## Genuine human correction and coach reconciliation

The parent edited the task in the genuine regular-user Chrome session from `QA Prepare reliability summary (synthetic)` to `QA Human correction — summary already drafted`. No API call simulated that human action.

`stale-proposal.json` proves the coach's old-timestamp title update was blocked with `CONFLICT`; the real human correction survived. Refreshed context retained that correction as a new source/history revision. `fresh-proposal.json` records a fresh-baseline coach edit to `QA Coach reconciled — summary already drafted`, preserving the correction's meaning, body, TODO status and unknown due date. The parent then verified this final title in the regular-user list and panel without a reload. Its retained screenshot is `/Users/user/Documents/BAM-Business-OS-Development/outputs/sales-coach-v1/twenty-executive-coach-readback.png`.

`context-final.json` retains the source-rich final account and originals after reconciliation. `idempotence-and-error-recovery.json` verifies repeated applied-change reconciliation did not add records and cleared stale setup-failure diagnostics. Initial live retries revealed that successful changes retained old `WRITES_DISABLED` error fields; the service now clears them on normal, reconciled and legacy-applied success. A regression covers retry, restart reconciliation and no duplicate writes. The original `projection-results.json` retains the observed pre-fix diagnostics rather than rewriting that history.

## Automation boundaries and limitations

`automation-review.json` covers both active workflows. One is a manual lead form, which this proof never invokes. The automatic workflow watches `person.upserted` email fields and can create or reattach companies. `automation-functions.json` records no webhooks and no independently database-triggered logic functions; its pure classifier returns `isPersonal: true` for missing/empty email, causing the next filter to stop before record attachment/creation. This proof created a person with no email. Company, note, task and opportunity operations are not targeted by the reviewed automatic trigger.

This review authorizes only the tested synthetic operations. Business-email person writes would activate the internal automation and require further scope review before general deployment. Test write flags are disabled again after QA. No messages, provider drafts, calendar edits, source synchronization, production mutations or workflow configuration changes occurred in this lane. The separate stage-addition lane owns its metadata evidence.

Live email/calendar coverage, attachments and a real executive work cycle remain outside this synthetic adapter proof. Human UI verification belongs to the parent; this lane's direct runtime proof uses CoachService and the fixed adapter, rather than claiming a fresh model-generated live answer.
