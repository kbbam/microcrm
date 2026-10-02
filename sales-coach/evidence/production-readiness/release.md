# Production proof — 2 October 2026, Asia/Bangkok

Runtime revision `d8a355bbf3ac8151a3eae196ff1186f1a5b1a9ce` is deployed at https://business-os-production-1193.up.railway.app/ against https://cureous.twenty.com/. Final restart deployment `5b17a946-1ac3-4b5b-962e-0ec161c3f593` succeeded with the same tested image. QA retains a separate deployment, database, contexts and CRM workspace.

The owner authorized real production and asked for continued overnight work, then explicitly deferred physical Android acceptance until tomorrow. This proof distinguishes the delivered service from owner activation; it does not claim real inbox coverage or physical-phone acceptance.

## Delivered and exercised

- 103 coach tests and 44 server tests passed; final locked server build and diff check passed. `coach-release-tests.txt` and `server-release-tests.txt` retain the gate output.
- `live-twenty-write-proof.json`: 18 live provider checks, including assigned/unassigned scope, human-edit conflict protection, safe retry and additive coach stage preserving native pipeline stage. Test artifacts were recoverably removed; no customer messages or calendar writes.
- `production-functional-smoke.json`: 14 public production checks using an isolated fixture. Actual setup, PKCE login/consent/refresh, 15 executive MCP tools, typed-source provenance, hash-matching original and two retrieval routes, synthetic CRM note, restart recovery and refresh rotation passed. Disabled fixture grants revoke both OAuth access and issued original capabilities; retained test evidence is privately archived.
- Initial paired database/volume backups restored in isolation. See `database-backup-proof.json` and `volume-backup-proof.json`; private contents, passwords, invitation tokens and provider keys are excluded from Git.
- Auth/source UI desktop and narrow states completed installed Impeccable finish review with disposition `ship`. `auth-ui/` and `source-ui/` retain the candidate states; `production-ui/` retains final actual-host screenshots. Home places the Claude connection first, with source onboarding secondary; narrow forms remain one column with clear labels and actions. There is no horizontal overflow or dense explanatory checklist in the executive's normal view.

Public MCP initially failed HTTP503 despite healthy readiness because root provisioning created private configs unreadable by UID1000. Corrected the runtime volume owner/modes, verified actual public MCP and restart, privately corrected provisioning discipline, and documented the requirement in `../../deployment/production.md`. This was an infrastructure defect, not a passing product state.

## Ordinary human-language proof

`ordinary-claude-final.json` and `ordinary-correction-persistence.json` prove a brief save (5.353s) and correction (3.484s) in ordinary Claude, exact original user wording retained, and a new version of the same entry with prior source lineage. `fresh-chat-correction.json` verifies a separate conversation retrieves the corrected account-name filename and DOCX format. Replies distinguish the executive's report from the customer's own unobserved wording.

These two warm desktop measurements are descriptive, not a latency guarantee. Fresh chats still prompted for Search accounts and Get account context. They were allowed once for authorized synthetic reads; persistent settings were not changed without action-time confirmation overnight. Cold timing includes that interruption and is not a valid speed sample. A final client permission setup and actual Android timing are pending.

## Pending owner activation

Production owner password setup, Claude production connection/permission persistence, executive-specific Twenty OAuth consent and actual **Cureous** email/calendar synchronization require the owner. Earlier test.twenty.com sync screenshots do not prove real production synchronization. The service explicitly reports a source setup/coverage gap until authorization and provider state support the requested check; it can still capture operational notes and read assigned CRM records.

Admin/teamlead is kb@cureous.me, executive is kb@jpgrowery.com. User credentials remain untouched; production accounts are fresh. No QA account memory migrated. One attachment can preserve original bytes through the upload capability; physical Android confirmation remains tomorrow's check. Operational startup and safe recovery are in `../../deployment/production.md`.

## Owner-reported connection correction — 2 October 2026

The runtime is now `fb1824eb0b40550be29bf1204df646d7514f3160`, production deployment `ad68d144-f5d4-4360-a691-a24ee5b8bfd8`. The earlier automated OAuth proof missed Chrome blocking the external consent redirect under form-action self. The corrected OAuth-only policy was reproduced with a two-origin actual-browser fixture and the owner’s production Claude Desktop handoff now visibly completes. Sanitized database proof shows a consumed authorization code and issued executive access/refresh tokens. Executive password setup is active. Detailed correction, screenshots and 45 passing server tests are in `oauth-redirect-fix/`. Real source authorization and physical Android acceptance remain pending; current production permission setup/fresh-chat proof is in progress.

## Source-status owner feedback delivered — 2 October 2026

Runtime `b80dec9696ca0b9bbce06f691f94b9baf8b11988` is deployed in production (`072695aa-31e6-4ce9-8be0-910eaee508d9`) and isolated QA (`a2e0b15d-29ed-41e6-af3e-019f571fde10`). Settings opens in a selected new tab and leaves the original status page available. The polished panel separates verified account identity from each source, includes truthful sync/check timestamps, and names only the pending source in mixed states. Forty-six server tests pass; eleven desktop/narrow/intermediate rendered states received installed Impeccable finish disposition ship. Actual production settings → return → recheck and 390px rendering are retained in [source-status proof](../../../.impeccable/review/source-status/README.md).

The owner has now completed real Cureous source authorization. Actual production recheck reports email sync at 03:19 UTC and calendar sync at 03:28 UTC, verified at 03:37 UTC. This supersedes the earlier pending-consent status; it does not prove complete mailbox/attachment coverage. Recheck currently passes through Twenty's confirmation of the existing grant. Physical Android acceptance and client Always allow persistence remain open; no customer messages/calendar writes were made.
