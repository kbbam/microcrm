# Named pursuit review — final proof

Owner requirement: when one account has overlapping opportunities, the human must recognize the specific pursuit before applying a consequential change. An opaque record ID is secondary information.

Runtime: /Users/user/microcrm/server/src/coach-review.ts
SHA256: 162a3c0d83c11db21826c358d02f44b90d259046e21cd6ff4a044ab65deec1e4

Changed behavior: Update/Create section now displays a human-readable record name prominently. Updates use the retained record name/title; new records use proposed name/title. Missing names are honestly reported as not retained. Existing immutable reviewed snapshot preserves the name after applying.

Fixture contains Autumn trial order and Spring repeat order under QA Northstar Pharmacy. Tests verify Autumn is the target before/after and Spring is not substituted. Browser proof exercised sign-in, exact named target, evidence disclosure and Apply; applied result still names Autumn.

Current full-page screenshots: desktop.jpg (1280 viewport), mobile.jpg (390), evidence-mobile.jpg and applied-mobile.jpg. Unchanged sign-in reference: ../login-mobile.jpg. Mobile clientWidth and scrollWidth are both 390; target is visible in first viewport, exact value comparison remains legible. Title is 18px semibold, ID is 14px muted. Hierarchy uses existing typography and colors; no redesign or new assets.

Build and 9/9 focused tests pass. Detector returned [] (detector.json). Fresh bundled reviewer disposition ship (finish-review.md), with no material fixes in rendered scope. Bundled documenter recheck completed in documentation-review.md. Prior screenshots/ship report are historical for the reopened identity criterion.

Proof is isolated synthetic HTTP persistence and Chrome CUA rendering. Production authentication, real Claude Android and real CRM changes are not claimed by this artifact; root owns that integration. No production data was changed by this builder. Temporary browser viewport was reset and fixture server stopped.
