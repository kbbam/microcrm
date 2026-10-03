# Direct recheck walkthrough

Task supplied by owner feedback, not a pre-existing JTBD corpus: “Check whether my connected email and calendar are ready without authorizing the same connection again.” Actor: kb@jpgrowery.com, returning executive, already authorized sources and signed into Business OS. Success: current verified source status and fresh check time, on Business OS, no new consent.

Mode: **Driven**, host browser tools (CUA), actual signed-in Chrome. Desktop plus degraded mobile tier at 390×844; no physical Android, touch/UA/DPR claim. Higher generic CLI tools are not permitted by the host's browser-control instructions. Before/after screenshots retained per step; browser console checks returned no errors.

| Step | Goal | Q1 try | Q2 notice | Q3 connect | Q4 feedback | Evidence | Next |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Check whether sources are ready | yes — wants current status | yes — visible Recheck | yes — action names intended check | yes — current source state and historical check visible | step-01-desktop.png, step-01-mobile.png | Recheck |
| 2 | See the updated result | yes — requested check | yes — source rows remain | yes — per-source report and Last checked | yes — check time advanced; same status URL, no consent | step-02-desktop.png, step-02-mobile.png | Return to coach |

Production desktop receipt moved from 03:37 UTC to 04:07 UTC. Narrow check advanced from 2026-10-02T04:07:42.371Z to 2026-10-02T04:08:15.425Z and returned to /account/twenty/status. Reload retained the updated receipt. No new authorization granted and no customer records/messages changed.

Findings: none on final verified task. The earlier screenshot was a real MEDIUM break: the button meant refresh but triggered repeat consent. It is superseded by this proof, not excused as provider behavior.

Considered but rejected: the source sync times stay historical while Last checked advances — that is correct; a successful check does not invent a new provider sync. Settings remains a separate external action, appropriate because the job can finish without opening it.

Unhappy paths: local real handler renders outage retry, unavailable authorization reconnect and expired central sign-in; corresponding server/vault tests verify preservation of prior receipt, authority rejection, expired-token rotation and sign-in continuation. Those failure states were not induced in the real production account. Slow network and physical phone behavior are **not verified** by this scoped walk.

Task success: **Completed**. Overall: **Approve** at the stated actual desktop/partial-emulation scope. This is an agent analytical walkthrough, not a human usability study.
