# Source connection refinement — 2 October 2026

Owner feedback: open Twenty settings in a focused new tab while retaining this page for recheck; make source status polished and informative.

Runtime `b80dec9696ca0b9bbce06f691f94b9baf8b11988`, production deployment `072695aa-31e6-4ce9-8be0-910eaee508d9`; isolated QA deployment `a2e0b15d-29ed-41e6-af3e-019f571fde10`. Both public `/version` endpoints report this revision; production readiness returns `{"ok":true}`.

## Product proof

- `production.png` and `production-mobile.png` retain the actual production account after a successful recheck. Twenty reports email sync at 03:19 UTC and calendar sync at 03:28 UTC, checked at 03:37 UTC. This is provider status, not proof of complete mailbox ingestion or actual phone execution.
- `production-tab-workflow.json`: the settings link created selected foreground tab 414596970 at Cureous account settings; original 414596951 remained at the Business OS status URL. After closing the created settings tab, the original page exposed Recheck. That action renewed the already-authorized source connection, passed through Twenty's existing-grant confirmation and returned to the status page with a fresh receipt. No new permissions were added. Twenty currently repeats this confirmation on recheck; the page does not yet bypass that provider step.
- `tab-workflow.json` separately records the new selected tab and original-page retention using the local fixture.
- Eleven final local screenshots cover mixed, missing, ready, disabled and reconnect states at 1280px and 390px, plus a 640px intermediate state. `serve.mjs` renders the actual compiled view with a reserved synthetic identity. Production narrow width measured 390px document width and 390px scroll width, with no horizontal overflow. Temporary viewport override was reset.

The hierarchy now places a state-specific heading above compact verified identity, independent ruled source rows and one prioritized next action. Density is reduced with smaller supporting timestamps and short state explanations. Mixed-source wording names only the pending source; semantic badges contain words as well as color. An external-link icon and explicit new-tab return instruction explain the handoff. Full-width 48px controls remain clear on narrow screens. The olive/green system is preserved. `finish-review.md` independently reviewed the eleven final screenshots and reports **ship**; `documentation-review.md` records the scoped extension. `detector.json` is empty.

## Implementation and verification

Source-status-only styling and rendering changed; ordinary login/error styling, authentication scope, provider queries, CRM data and credentials did not. The link uses `target="_blank" rel="noopener noreferrer"`. State timestamps are reported history in explicit UTC; synchronization is never represented as guaranteed complete import.

All 46 server tests and locked build passed (`server-tests.txt`); git diff check passed. Regression covers truthful mixed status, timestamps and safe new-tab attributes. No production customer messages/calendar writes, data migration or credential change was performed. Android execution, actual source-content coverage and the broader client permission-persistence acceptance remain separately open.
