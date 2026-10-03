# Independent sales-coach review — 2026-09-30

Reviewer did not author or modify implementation. Synthetic data only; no production queries or mutations. Compared skill, actual native runtime, context service and adapter source against SPEC-SALES-01 and owner follow-ups.

## Actual native behavior

- `native-drafting.jsonl`: a fresh process retrieved retained original testimony and account history. It used explicit trust-rebuilding goal, old Lost pursuit, combined supply/price objections and attributed social constraints in useful critique/rewrite. It persisted recommendation, refused requested email/invitation execution, rejected chat confirmation as trusted authority and stated that CRM was unconfigured.
- `native-reconstruction.jsonl`: fetched a CLI-imported unlinked original; persisted seven source-linked entries. Planned meeting remained uncompleted, promise date/owner/fulfillment unknown, opportunity/stage unresolved, fallback goal labeled inference. Embedded send instruction was treated as evidence and not executed.
- `native-repeated-dump.jsonl`: another fresh process repeated the identical source and made no new facts, activities or promises; account stayed at seven entries.
- `native-leader.jsonl`: independent admin process read durable report/originals without previous chat. It surfaced recommendations and the attributed product-label signal; did not confuse harsh draft wording with dismissal of advice; distinguished unobserved adoption, delivery, sending and meetings; gave no performance verdict or downstream executive assignment. Missing CRM/email/calendar/attachment coverage was explicit.

## Corrections independently retested

`retest.txt` records assertions using an isolated synthetic adapter and new durable store:

1. High-risk proposal and exact reason/risk relabel stay awaiting confirmation, zero writes. The same intended correction with a refreshed baseline also inherits the high-risk hold and stays pending, zero writes.
2. Failed CRM refresh marks prior snapshot unavailable and overall refresh failed. Complete refresh with missing record marks retained snapshot unavailable; unchanged record returning restores availability. Sources and social history survive throughout.
3. Trusted retry after resolving NOT_CONFIGURED applies one create with the originally persisted stable ID. Pending confirmation and CONFLICT states cannot bypass their required paths through retry.

Original defects found during review—MCP approval settings, omitted get_source, risk downgrade via changed reason/baseline, setup retry and unavailable snapshots—were corrected. The first two fixes were exercised by the actual native logs above; the remaining fixes by independent assertion tests.

## Scope and remaining limits

These proofs cover actual source retention/retrieval, one simple reconstruction/dedup case, restart retrieval, source instruction refusal, goal/social-aware drafting and durable leader visibility. They do not establish all A1–A12 outcomes or mark the real pilot complete. No actual Twenty server write/read-back, executive UI interaction, Ilya source permissions, sync completeness or real preparation → interaction → capture cycle was independently verified here. Exact-payload hold protection does not by itself establish a semantic guarantee for arbitrarily altered payloads or erroneous model risk estimation.

Minor wording issue: the rewrite asks whether a promised summary reached the buyer despite fulfillment being unknown. It does not assert delivery, but the executive should verify it before using that wording.
