# Coach review documentation check

Disposition: consistent scoped extension; no global design-system changes.

Checked the shipped documenter instructions and `reference/document.md` in full; implementation evidence in [coach-review.ts](/Users/user/microcrm/server/src/coach-review.ts:28) and incumbent [oidc.ts page()](/Users/user/microcrm/server/src/oidc.ts:91); the [direction contract](/Users/user/microcrm/.impeccable/review/coach-review/direction.txt); the durable [surface brief](/Users/user/microcrm/.impeccable/surfaces/server-src-coach-review-ts.md); and the [finish review](/Users/user/microcrm/.impeccable/review/coach-review/finish-review.md), whose disposition is `ship`. Root `PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json` are absent. This report records observed implementation facts at the authorized review boundary; it does not create global product truth, a new visual world, or normative project-wide tokens.

## Five-line observed system summary

1. **Palette:** Both surfaces use olive-black page `#14170f`, olive surface `#1b1f18`, light text `#e9ece5`, green action `#7fc99a`, and input ground `#20241c`; review adds brighter muted text `#afb8a5` and dividers `#384031` as local readability choices.
2. **Type ramp:** Review uses the inherited system-sans family with additional platform fallbacks; body is 16px/1.5, task heading 28px desktop and 24px narrow, section/account text 18px, metadata 14px, and value labels 13px. These are functional form roles, not a newly established display identity.
3. **Observed comparison rule:** The review remains one column within a 760px maximum; old/new values occupy two columns and stack below 520px, where page margins become 16px. Values and retained evidence wrap while preserving line breaks; body/source measure is capped at 70ch.
4. **Observed control rule:** The 7px input/button corners and 10px notice corners continue incumbent shapes. Apply uses green; Reject uses a bordered transparent treatment. Decision controls become full width on narrow screens; 16px/1.5 text plus 11px vertical padding and 1px borders yields 48px button height. Hover/active states, a 3px visible focus outline, and reduced-motion handling are explicitly implemented.
5. **Observed evidence rule:** Flat tonal surfaces and thin separators organize the task without shadows or shipping artwork. Native disclosures hold attributed source text; the exact comparison stays visible, and applied outcomes relabel the retained baseline and remove decision controls. These are surface-specific behaviors, not universal Business OS requirements.

## Consistency and limits

The build retains the incumbent palette, rounded form vocabulary, and system typography. Its larger reading sizes, more visible supporting text and boundaries, responsive comparison, and explicit decision states extend that existing form for the review job. The source-backed dimensions above describe this artifact only. In particular, this check does not promote the narrow breakpoint, comparison layout, system heading face, or Claude-specific return copy into a global design rule.

The finish review supplies rendered verification for [desktop](/Users/user/microcrm/.impeccable/review/coach-review/desktop.jpg), [mobile](/Users/user/microcrm/.impeccable/review/coach-review/mobile.jpg), [login](/Users/user/microcrm/.impeccable/review/coach-review/login-mobile.jpg), [expanded evidence](/Users/user/microcrm/.impeccable/review/coach-review/evidence-mobile.jpg), and [applied outcome](/Users/user/microcrm/.impeccable/review/coach-review/applied-mobile.jpg). This documentation check relies on that review for visual quality; it does not claim a second independent rendered review. The screenshots are retained verification evidence, not shipping raster assets. No asset provenance register is required for a new shipped image because none was added.

**Not canonized or repaired:** The absent global product/design files are pre-existing documentation drift under `SCOPED_EXISTING_ALLOWED`. They remain absent because this ordinary extension authorizes preservation and a bounded consistency report, not invention of global context or tokens. No reported craft-floor defect is made into a reusable rule.

Only this report was written. Incumbent source, global files, surface brief, direction contract, and finish review were preserved.
