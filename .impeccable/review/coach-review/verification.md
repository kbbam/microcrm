# Coach review verification — 1 October 2026

Initial implementation SHA256 (superseded by the named-pursuit correction below):
- server/src/coach-review.ts: 6ca35caeaf855ea30a56e73da74de6cd0ceb4a4f8b0316aef0679b0dcf1005be
- sales-coach/confirmation.mjs: 97f453663e875593076b7e9f7808dc031668e63405012d6e7d629e5d124f286c

Task supplied by owner/parent: an executive on mobile must inspect the exact consequential CRM change, inspect supporting retained evidence, and approve or reject using human browser authority, then see an accurate durable outcome. This analytical driven walkthrough is not a human usability study.

Observed in isolated synthetic localhost fixture using actual review handlers and CoachService persistence:
1. Open non-authorizing review URL: login only; no proposal data. Clear existing-account labels, explicit statement that signing in does not approve. login-mobile.jpg.
2. Sign in with fixture credentials: exact account, proposal, old/new values and consequence appear. mobile.jpg / desktop.jpg.
3. Expand supporting source: original retained text, captured and occurrence timestamps, attributed testimony and missing evidence readable. evidence-mobile.jpg.
4. Apply synthetic change: applied success and durable baseline Proposal → Won shown. applied-mobile.jpg. Reload preserved result. All controls associated with intended effect; no material task break remains in these observed steps.

The initial native form revealed Origin:null caused by no-referrer policy. Fixed review policy to same-origin, preserving external referrer suppression and strict same-origin POST verification. The first result revealed updated CRM cache replacing the previous value; fixed by persisting exact reviewed baseline/evidence and labeling applied outcome. Final captures above follow both fixes.

Visual observations: account and decision need lead; exact fields stay expanded. Evidence disclosure limits initial density while keeping source access recognizable. System sans 16px body, restrained established olive/green palette, before/after columns become a labelled stack on narrow width. At 390px scrollWidth equals clientWidth and both primary/secondary decision targets measure 358×48px. Desktop uses 760px content width. No animated entrances, ornamental imagery or new dependencies.

Technical: npm run build succeeds; node --test test/coach-review.test.js passes 9/9. Cases cover no authority from link/bearer, native sign-in without approval, exact approval once, immutable result snapshot, durable rejection and resume exclusion, CSRF/origin failures, role/context/revocation including queue wait, changed proposal/evidence, and HTML escaping. An additional creation-outcome test verifies that the original operation stays creation after CRM assigns its ID. This final correctness branch does not alter any captured update screen; creation itself has HTTP rather than rendered proof.

Unhappy states proven through HTTP tests: missing session, revoked role/context, stale digest/evidence, CSRF/origin rejection, rejected persistence and replay. Browser did not visually capture rejected/blocked/expired states, or simulate a slow backend. Live OIDC persistence and real production account login remain parent integration proof; fixture injected sessions. Real Claude Android/remote connector/CRM not claimed.

Impeccable: context run once, incumbent extension preserved; detector ran once with empty findings (detector.json). Fresh bundled independent reviewer returned disposition ship; all five screenshots valid, no material fixes within captured fixture scope. Full five-section review is finish-review.md. Shipped documenter completed the inherited-world consistency record (documentation-review.md); no new visual world was introduced. No production data or credentials changed.


## Reopened named-pursuit requirement

The owner requirement was reopened after root inspected the earlier mobile screenshot: account plus an opaque record ID does not distinguish overlapping pursuits. The previous visual ship verdict is historical for identity clarity.

Current runtime SHA256 server/src/coach-review.ts: 162a3c0d83c11db21826c358d02f44b90d259046e21cd6ff4a044ab65deec1e4. Target name/title now appears prominently under Update/Create and before secondary record ID. Updates use the cached reviewed record identity; creation uses proposed values. Missing names are explicitly labelled as not retained.

The fixture now has Autumn trial order and Spring repeat order under QA Northstar Pharmacy. Current captures identity/desktop.jpg and identity/mobile.jpg show the selected Autumn trial order. identity/evidence-mobile.jpg preserves its identity while evidence is open. identity/applied-mobile.jpg shows that same name retained with the decision snapshot. The other pursuit does not appear as the target. Final Chrome browser flow sign-in→evidence→apply passed; width390 equals scrollWidth390. Native in-app browser disconnected before this pass, so Chrome was the available supported CUA surface.

Compilation and9/9 focused tests pass after the change. The existing approval test now checks the target name before/after and excludes the second pursuit; creation test checks proposed name. identity/detector.json is empty. Fresh independent review for this owner feedback returned ship; see identity/finish-review.md. The new target name, secondary ID, two-pursuit fixture and retained applied identity all passed the full scope review. No runtime effects beyond the isolated synthetic adapter occurred in this follow-up.
