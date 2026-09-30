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

The separate workspace at `https://bam-sales-coach-test.twenty.com` completed onboarding. The owner authorized its 15-day Admin test API key and a Member invitation; invitation acceptance and source fidelity remain pending. Read-only API comparison verified workspace ID `8c8fa5f0-86ac-410a-92c8-8ac7e872c92f`, distinct from the pre-existing credential's workspace ID `0186ac13-da77-4813-9b1c-19bc0c275dcd`; native opportunity object IDs also differ. Its 14 companies were created on 2026-09-30, with no source-entity markers, and six existing pursuits used legacy stages. This establishes a separate workspace, not the provenance of its prefilled rows. Local coach QA scope remains a reserved synthetic account. Do not use production credentials or delete seeded demo opportunities.

`sales-coach/scripts/setup-pipeline.mjs` is an admin-only setup utility, not a coach tool. It requires an explicit absolute `--env` credential-file path and defaults to dry-run. Application additionally requires `--apply --isolated` and unchanged stage metadata since its read. Replacement mode refuses nonempty pursuit workspaces. Explicit `--add-missing` instead preserves every existing option and the current default, appending only missing pilot options; no pursuit values or IDs are patched and no third pipeline field is introduced. Two additional tests verify preservation, unique values, idempotency, and readback discrepancy rejection.

The pilot credential file may contain only `TWENTY_API_KEY`; provide its observed workspace endpoint explicitly. From `/Users/user/microcrm`, the exact dry-run command is:

```sh
node sales-coach/scripts/setup-pipeline.mjs --env /Users/user/microcrm/sales-coach/.env.twenty-test.local --url https://bam-sales-coach-test.twenty.com --add-missing
```

Only after the operator verifies this is the authorized isolated workspace, append `--apply --isolated`. Keep external-effect review and write enabling separate from stage setup. A malformed URL or missing key yields a generic error without echoing the credential.

Authorized additive setup was applied to the verified test workspace on 2026-09-30. The five legacy options and default `NEW` were preserved exactly; five commercial options were appended. Native GraphQL enum readback now supports the pilot. All six pre-existing pursuit IDs and stage values remained unchanged, verified by matching pre/post snapshot hashes. Full nonsecret metadata, counts, endpoint identity, and timestamps are retained in `sales-coach/evidence/twenty-pipeline-live.json`. There was no delete, migration, or production metadata mutation. The coach always supplies an explicit pilot stage; the legacy UI default does not classify a coach reconstruction.

After onboarding and provisioning, verify native pipeline setup, executive/admin UI access, outbound workflows/webhooks, and isolated synthetic create/update/readback. Then operate human edit → coach refresh → coach patch → human UI visibility using the real workspace. Rich source/narrative preservation is owned by the durable context service and must be verified alongside this adapter. Partial source sync, unavailable attachments, unavailable account targets, or partial pagination must remain visible coverage limitations.
