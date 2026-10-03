# Source-status documentation review

Disposition: documented scoped extension; preserve incumbent system.

This pass used the shipped `impeccable_documenter.toml` and `reference/document.md`, the source-status direction contract, the finish review with disposition `ship`, and the cross-product truth in `/Users/user/Documents/BAM-Business-OS-Development/product/README.md`. The authorized `SCOPED_EXISTING_ALLOWED` exception applies to this narrow existing-surface refinement. No new visual world or global token-system change is established.

## Evidence and incumbent comparison

Checked `server/src/auth-page.ts`, `server/src/twenty-source-views.ts` and their working-tree diff against the incumbent. The root palette, font stack, ordinary 440px auth container, panel radius, standard controls and CSP remain unchanged. Source-status styling is opt-in through `sourceStatus`; login and problem states continue using the ordinary auth surface.

Directly inspected [final desktop](desktop.png) and [final narrow](mobile.png). The retained [finish review](finish-review.md) records eleven final captures across mixed, missing, ready, disabled and reconnect states plus the intermediate width. The mixed captures visibly distinguish the compact verified account from the independently reported Email and Calendar rows. The state heading leads, rules organize the rows without nested panels, the amber Calendar badge identifies the remaining work, and the green Recheck action has clear priority. On the narrow capture the heading, timestamps and guidance wrap cleanly; badges remain legible and full-width actions retain their affordance. The supporting new-tab instruction and completeness qualification are quiet but readable.

## Five-line system summary

1. Palette: preserved olive-black ground (`#14170f`), olive panel (`#1b1f18`), field (`#20241c`), restrained rule (`#41483b`), light text (`#e9ece5`), muted text (`#b4bcaa`), green accent (`#7fc99a`) and amber attention (`#f0bb72`). The status surface adds dark green (`#263c2d`) and amber (`#352c1c`) semantic backplates locally.
2. Type: preserved system sans stack and 16px/1.55 body; source-status heading is 28px desktop and 25px narrow, with 16px source/next-step labels, 14px source/identity detail, 15px guidance and 12px timestamp/qualification. Narrow badges use 11px. These are observed surface roles, not a new global ramp.
3. Layout rule: retain one bordered, 14px-radius panel; source-status alone allows 520px maximum width and 32px panel padding, reducing to 24px at the incumbent 480px breakpoint with 16px outside gutters. Source rows use 20px vertical padding and separators.
4. State rule: separate verified account identity from per-source provider reports; pair status words with color, report historical UTC sync/check timestamps, and retain the qualification that reported sync does not prove every message or attachment was imported.
5. Action rule: settings leads for missing, disabled or reconnect states; recheck leads while sync is pending; coach setup leads when both sources report sync. Preserve 48px minimum controls, green primary/outlined secondary treatment and themed focus. Settings uses authored SVG, explicit new-tab wording and `target="_blank"` with `rel="noopener noreferrer"`.

## Scope and gaps

No `DESIGN.md` or `.impeccable/design.json` was created: absent application `PRODUCT.md` and `DESIGN.md` are pre-existing documentation gaps, and this task does not authorize a project-wide system definition or identity workshop. The max-width, badge backplates, status type sizes and action sequencing remain local surface facts. Twenty and Claude references describe this pilot implementation and do not become platform-wide Business OS requirements.

Not canonized or repaired: the pre-existing product/design documentation gaps; no new visual defect was identified in the sampled final captures. Functional tab focus, retained original tab and return/recheck need the parent's functional evidence; retained screenshots establish appearance only. Physical-phone acceptance remains separately pending.

Only this review file was written. Product source and unrelated documentation were not edited.
