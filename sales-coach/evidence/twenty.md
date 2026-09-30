# Twenty integration evidence

Verified 2026-09-30. This document contains no credentials or customer record content.

## Implemented boundary

`sales-coach/twenty.mjs` exports a fixed-template GraphQL adapter. Model-facing operations are bounded `read`, `create`, `update`, and schema `metadata`; the runner must not expose internal transport/setup methods. Default scope is an explicit approved-company list. Trusted deployment configuration can opt into `scopeMode: 'workspace'` for the wholly authorized isolated workspace, allowing reconstruction of new account IDs. Per-account reads still follow account/contact/pursuit links.

Writes default to disabled. They require both trusted `writeEnabled: true` and `externalEffectsReviewed: true`. These configuration attestations do not themselves inspect workflows or prove isolation; the operator must establish those conditions before enabling them. Communications and synchronized participant/target records are read-only. No send, invite, metadata mutation, arbitrary URL/query, deletion, bulk execution, or external workflow is a model tool.

An update requires the proposal's original `updatedAt`, refreshes the record, and submits a fixed plural-update mutation filtered by both ID and revision. An intervening edit produces a conflict rather than restoring stale coach values. Create requires a stable UUID persisted by the caller before submission. Notes/tasks use deterministic target IDs and reconcile a partly completed attachment on retry. Native opportunity stage writes require metadata supporting `APPROACHING`, `ENGAGED`, `COMMERCIAL`, `WON`, and `LOST`; terminal judgments require no order/signature fields.

## Read-only live evidence

Using the pre-existing local credential reference, the actual `/graphql` schema accepted the fixed account-scoped templates for companies, people, opportunities, notes/tasks and targets, synchronized messages/calendar events, thread/event targets, and participants. The separate empty-result leaf probes also exercised query validation for note/task bodies, message text, calendar details, and participant fields even when the selected account had no matching source records. Outputs retained only metadata and bounded coverage; no customer payload, token, record ID, or encoded cursor was retained here.

Reproduce the setup-only read probe with `node sales-coach/scripts/twenty-read-probe.mjs`. It defaults to writes disabled and never submits mutations. This proves the current endpoint/schema compatibility, not the new pilot executive's access or source enrollment.

The existing workspace's native stages were `NEW`, `SCREENING`, `MEETING`, `PROPOSAL`, `CUSTOMER`; the adapter correctly reports them incompatible. A pipeline setup dry-run found six existing pursuits and refused to change them. No production data, metadata, credentials, or access was changed by the adapter builder.

## Synthetic workflow evidence

`node --test sales-coach/test/twenty.test.mjs` passes 11 tests against a local HTTP GraphQL fixture using native Twenty connection, filter, mutation, and revision shapes:

- Approved-account filtering, linked tasks, and page coverage.
- Both write-enable flags, denied fields, and read-only communication mutations.
- Successful patch/readback, subsequent stale-baseline rejection, and a human edit between the pre-read and server update.
- Soft Won judgment without additional commercial-field gates, and incompatible native stage rejection.
- Interrupted note-target creation followed by stable-ID retry without duplicate notes/targets.
- Mandatory default scope and arbitrary object/template rejection.
- Account-linked messages and participant scope.
- Partial coverage disclosed when relationship discovery reaches its 1000-record bound.
- Trusted isolated-workspace creation of a new account and related note/task/opportunity, followed by account-scoped readback.
- Default approved-account scope rejection of an unreserved new company ID.

The fixture proves implementation behavior through an HTTP transport; it is not a live Twenty mutation test and does not prove actual human CRM permissions.

## Isolated pilot and remaining proof

The orchestrator reports a separate workspace created at `https://bam-sales-coach-test.twenty.com`. Onboarding, isolated API credentials, source consent, and live integration proof remain pending. Do not use the sponsor's production credentials as the isolated workspace key. Do not delete seeded demo opportunities merely to make setup pass.

`sales-coach/scripts/setup-pipeline.mjs` is an admin-only setup utility, not a coach tool. It requires an explicit absolute `--env` credential-file path and defaults to dry-run. Application additionally requires `--apply --isolated`, an empty opportunity workspace, and unchanged stage metadata since its read. It configures the native stage options/default and reads back the native enum; no third pipeline field is introduced. If Twenty seeds demo pursuits, the utility deliberately refuses application: the operator must review native setup/migration in that isolated workspace rather than silently remove or remap them.

The pilot credential file may contain only `TWENTY_API_KEY`; provide its observed workspace endpoint explicitly. From `/Users/user/microcrm`, the exact dry-run command is:

```sh
node sales-coach/scripts/setup-pipeline.mjs --env /Users/user/microcrm/sales-coach/.env.twenty-test.local --url https://bam-sales-coach-test.twenty.com
```

Only after the operator verifies this is the authorized empty isolated workspace, append `--apply --isolated`. Keep external-effect review and write enabling separate from stage setup. A malformed URL or missing key yields a generic error without echoing the credential.

After onboarding and provisioning, verify native pipeline setup, executive/admin UI access, outbound workflows/webhooks, and isolated synthetic create/update/readback. Then operate human edit → coach refresh → coach patch → human UI visibility using the real workspace. Rich source/narrative preservation is owned by the durable context service and must be verified alongside this adapter. Partial source sync, unavailable attachments, unavailable account targets, or partial pagination must remain visible coverage limitations.
