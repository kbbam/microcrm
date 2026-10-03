# Authorized isolated Twenty linkage

The owner approved linking the existing isolated Twenty test workspace on 1 October
2026. Its existing API credential was copied only into the QA Railway service's
`COACH_TWENTY_API_KEY` secret, without changing the original credential or exposing
it in Git, chat, model input, or logs. Production services were not changed.

Final QA deployment: `40ae10a2-32ed-4e02-a0ea-93b6787e2c64` (`SUCCESS`).
`twenty-linkage-proof.json` retains exact uploaded source hashes and seven passing
checks through the real HTTPS gateway and real Twenty test workspace.

The trusted `owner-qa` context has executive `kb@jpgrowery.com` and admin
`kb@cureous.me`. Its adapter accesses only `https://bam-sales-coach-test.twenty.com`
in the explicitly authorized isolated-workspace mode, with ordinary internal writes
enabled after the retained bounded automation review. Builders did not set or change
these users' passwords. The owner reported completing password setup separately.

Verification authenticated the independent synthetic identity
`crm-proof@example.test`; it did not impersonate either owner account. It read the
reserved synthetic Northstar account, verified native pipeline compatibility,
created an internal preparation task, independently read back the record, replayed
the proposal without changing record identity, patched its title from a fresh
baseline, and independently verified that correction.

Account-scoped email/calendar reads returned zero records and explicit capability
limits. This proves those bounded operations, not mailbox synchronization or full
thread/attachment coverage. No real mailbox material was imported in this proof.

The reviewed automatic workflow watches the `emails` field on `person.upserted`.
Person email writes therefore remain blocked by trusted deployment policy until
separately reviewed. Ordinary person fields and company/task/note/opportunity writes
retain their bounded behavior. This is an implementation-specific automation
constraint, not universal CRM doctrine. Thirteen focused adapter/policy tests passed,
including proof that a blocked email-field proposal sends zero CRM requests and is
reported `blocked`, rather than falsely reported `uncertain` or `applied`.

The earlier `README.md` and `https-proof.json` describe the pre-linkage snapshot.
This record supersedes their statement that no Twenty credential is installed.
Organization skill/connector installation and owner-account OAuth consent are being
handled separately. The actual ordinary Android coach workflow remains a distinct
client acceptance check.
