---
version: 1
slug: "server-src-coach-review-ts"
primary_target: "server/src/coach-review.ts"
related_targets: ["sales-coach/confirmation.mjs"]
---

# Human review of a coach proposal

Scope: narrowly specified extension of the existing microcrm browser authentication and consequential-change confirmation workflow. Mode: Operate. Audience: executive opening a review link from Claude on mobile or desktop. The purpose, exact-proposal evidence, human-only authority, apply/reject actions and existing visual world were supplied in the implementation handoff. Platform choices remain replaceable.

## Direction contract

THESIS: Help the executive decide whether one exact CRM change matches the retained evidence; make the change and its consequences explicit before action.

OWN-WORLD: Inherit server/src/oidc.ts page(): olive-black page, dark olive surface, light text, green primary action, system sans and familiar labelled forms. Expand to readable neutral text and responsive values without changing the identity. Mobile use is intermittent review after a Claude conversation; preserving the recognized login surface takes priority over an invented visual world.

STORY: Sign in → recognize account and consequence → compare values → inspect evidence → apply or reject → see durable outcome. The signature interaction is opening original retained source text beside an exact proposal, then preserving that reviewed snapshot with the human decision.

FIRST VIEWPORT: Compact brand/account header, 24–28px task heading, account name, restrained decision-needed notice, then the human-readable pursuit name with secondary record ID and the exact field change. Desktop limits content to760px; narrow390px uses16px margins and stacks old/new values. Supporting evidence and full-width48px decision buttons follow the reason. Evidence starts collapsed; the proposed change remains expanded.

FORM: Extend the incumbent authentication/form surface with a single-column review. A concept list, roll position and seed are not applicable: new-work.md §3 explicitly excludes a local extension or precisely specified narrow request from concept-seed. This is inherited composition and concrete task structure, not a selected new visual world. No new artwork or shipping raster.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

The FINISH documentation requirement is scoped by new-work.md §5/§7: ordinary extensions preserve existing DESIGN.md; no new global visual-world files are invented. Existing PRODUCT.md/DESIGN.md are absent, a pre-existing documentation gap reported by context. No screenshot is a shipping product raster.

Provenance: the purpose/content/layout notes were recorded before implementation in this direction.txt. Their structured contract headings were normalized during finish review; no retrospective concept seed is claimed.

Owner requirement reopened after screenshot inspection: overlapping opportunities under one account must be distinguishable by human-readable target name. The final review prominently shows the retained record name/title, or the proposed name/title for a creation; the opaque ID remains secondary. Proved with Autumn trial order and Spring repeat order under one synthetic account.

## Work-allocation refinement — 2026-10-03

Scope: the existing human-review surface now describes an assignment by its responsibility, retained account/record name and readable colleague labels. This is a narrow refinement of the Operate workflow, evidenced by `server/src/coach-review.ts` at `409e142`; it does not establish a new visual world. The `SCOPED_EXISTING_ALLOWED` exception applies to the pre-existing absence of PRODUCT.md and DESIGN.md. Preserve confirmed incumbent decisions; no global design file or sidecar is invented for this change.

Hierarchy and wording: use “Assign account relationship” for the reviewed responsibility and “Responsible colleague” for the field. Put the retained account name immediately below the assignment heading. Render the previous member label (including “Unassigned”) and proposed member label rather than internal member IDs. Retain “Before this change” and “Proposed value”; after application, show “Applied value” and “Change applied”. Keep the proposal reason, retained evidence disclosure and explicit “Apply change” / “Reject change” actions in that reading order.

Observed implementation: olive-black page (#14170f), dark olive notice (#1b1f18), light text (#e9ece5), subdued metadata (#afb8a5) and green action (#7fc99a). The existing system sans stack remains a scoped inherited implementation fact, not a new global display-font rule. Body text is 16px/1.5; task heading is 28px on desktop and 24px below 520px; section and retained-name text is 18px. The 760px desktop column uses side-by-side previous/proposed values. At the retained 390px viewport, 16px outer margins, stacked values and full-width stacked decision buttons preserve readability without clipping. Tonal surfaces and thin olive borders carry separation; no new shadows, imagery or physical material effects were introduced.

Finish evidence: [desktop](../review/work-allocation/desktop.jpg) and [390px narrow render](../review/work-allocation/mobile.jpg) were the final states reviewed by the bundled finish reviewer, which returned `disposition: ship` with no material fixes. [Finish record](../review/work-allocation/review.md) preserves that scoped disposition and the supplied one-run detector result. The actual browser application flow ended in [Change applied](../../walks/2026-10-03-work-allocation/step-07-review-applied.jpg). The narrow screenshot proves rendered layout, not phone operation. Screenshots are development evidence with repository provenance; no raster ships in the product.
