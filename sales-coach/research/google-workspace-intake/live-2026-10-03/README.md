# Live native Gmail observations — 3 October 2026

Research only; no source-route replacement. The owner unlocked the Mac and actual Claude Desktop was used. After the Mac relocked, the shared conversation was inspected through Claude web. The same chat is not two independent retrieval trials.

## Exact fixture and ground truth

Subject: `[BAM QA synthetic] Northstar trial and repeat order — 2026-10-01`. Gmail UI showed two messages, from `kb@jpgrowery.com` and `kbolgarov@gmail.com`, with the second copying `kbolgarov+101@gmail.com`. Ground truth: [message bodies](gmail-ground-truth.txt), [first addressing](gmail-first-addressing.txt), [second addressing](gmail-second-addressing.txt). The Gmail UI's suggested tasks/replies are application suggestions, not source evidence.

Claude used native Gmail `search_threads`, then `get_thread` with `messageFormat=PLAIN_TEXT`, restricted to this exact synthetic thread. Actual returned JSON is retained in [native-gmail-thread.json](native-gmail-thread.json), extracted from the visible tool response. This is stronger evidence than the assistant's summary.

The returned thread ID is `1a0f816dade777d3`; messages are `1a0f816dade777d3` (2026-10-01T15:30:42Z) and `1a0f81ba70a09726` (15:35:43Z), count 2. Both bodies agree with Gmail UI: translation check 4 October, original summary deadline 5 October changed to 6 October; separate repeat pursuit provisionally 120 units in the week of 12 April 2027; neither is an accepted order. The second message includes the quoted original. Claude correctly distinguished the synthetic customer signature in the body from the actual sender header.

Returned fields: message ID, snippet, subject, sender, To, Cc when present, date, plaintext body, labels, thread ID, history ID, internal date, size estimate and view URL. Message-ID/RFC822 headers, Bcc, HTML body and attachment fields were absent. No attachment was visible in this fixture; this test therefore cannot establish attachment-bearing behavior. The documented native attachment-content limit remains a separate vendor claim. No truncation marker appeared, but the fixture is only two messages.

## Current production Twenty comparison

The actual production Coach connection in Claude web read this exact synthetic thread under `kb@jpgrowery.com`'s authorized own-source scope. [Visible tool result](twenty-production-thread.json) and [tool trace](twenty-production-tool-dom.txt) are current proof, independent of the older isolated QA result. No customer-record mutations were made. The normal `crm_read` operation durably retained its authorized provider evidence in Business OS; this route therefore is not a zero-BOS-write experiment.

Twenty thread `2225ef06-db8d-4da7-9d68-b4b33afd5ec6` returned two messages and five FROM/TO/CC participant records. Sender, recipients, UTC dates and all actionable content match the native result and Gmail UI: 4 October translation check, revised 6 October summary, provisional 120 units/week of 12 April 2027, neither accepted. [Text comparison](coverage-comparison.json) records both route identities and hashes: the first message's returned text is exactly equal; the second Twenty text is exactly the native reply prefix (293 characters), while native Gmail also includes the quoted original (998 characters overall). The original is separately present as the first message on both routes. Do not describe the second message as byte-identical, original MIME, or a lost business fact; this fixture demonstrates a representation difference.

Twenty supplies RFC822 header Message-ID values and participant person IDs where available; native Gmail supplies Gmail IDs, history IDs and source links. These identifiers cannot be substituted for each other. Twenty's source check reports authorization complete, sync enabled/ACTIVE and last sync at 2026-10-03T05:43:23.719Z; `currentMailboxCompletenessVerified=false` correctly remains explicit. The bounded returned thread is complete; the live inbox is not thereby proved complete.

## Limits and next comparison

No native send, draft, relabel, Calendar change or Business OS write was requested or observed. Native Gmail required no approval prompt in this configured account. Physical Android/iOS operation is untested. Desktop/web continuation is observed; it is not evidence of a persistent local worker. Neither returned result contains attachment bytes or original MIME, and this fixture has no attachments.

[Timing attempts](timings.json) do **not** establish route performance. The native completion observation (37.580 s) includes observer delay and is an upper bound, excluded from comparison. The Twenty attempt stopped at a Get coach instructions approval prompt after 24.985 s; it was unfinished and is excluded. A persistent Always allow change was requested from the owner, not silently applied. These earlier attempts remain excluded. The subsequent bounded fresh/first-repeat series below now supplies three pairs per condition; no cold-infrastructure, cache or new-arrival freshness guarantee is claimed.

The isolated QA source route lacked authorization and its source-status URL was unconfigured. That blocked the initial QA comparison; the verified production own-source read above resolves content access, not the benchmark or every QA environment configuration. Never tell an executive to wait for Google sync based on this QA authorization failure.

Next: a verified synthetic Calendar fixture and an attachment-bearing fixture with a working authorized content-fetch path. Selective binary capture and durable BOS attribution require an authorized content route, not metadata alone. The current recommendation remains to retain Twenty and research a bounded hybrid; replacement/integration is not authorized.

## Bounded Calendar fixture discovery

A native Calendar `list_events` query for `BAM QA` over 1 September–31 October 2026 returned only primary-calendar metadata and no event items. Claude repeated the same query using the returned Europe/Moscow calendar time zone; again no items or pagination token were returned. [Actual tool requests/results](native-calendar-fixture-query-dom.txt). No fixture was identified; this is not a comparison of event contents, proof of all-calendar coverage, or an independent Google UI absence check. No other event subjects or calendars were searched, and nothing was created/changed. A known synthetic calendar fixture remains necessary for the matched Calendar test.

## Permission resolved and matched timing series

The owner completed the pending permission. A separate new instruction-only chat called get_coach_instructions successfully without an approval prompt: [actual trace](fresh-instructions-permission-dom.txt), [visible result](fresh-instructions-permission.jpg). This is this account's read-tool proof, not Ilya's configuration or all-tool permission persistence. Earlier pending prompt [screenshot](pending-instructions-permission.jpg) is historical.

[Timing summary](timing-summary.json) and [all new attempts](timing-series.json) retain actual prompts, source route, model, UTC starts, monotonic submission-to-UI-completion observations and conversations. Accepted series:

| Route | New chats (s) | First same-chat repeats (s) | Medians, new / repeat |
| --- | --- | --- | --- |
| Production Coach/Twenty | 11.736, 10.887, 13.892 | 8.233, 6.959, 6.443 | 11.736 / 6.959 |
| Native Gmail | 12.400, 13.118, 14.221 | 6.480, 6.905, 7.134 | 13.118 / 6.905 |

Same identity/fixture/prompt apart from route; Sonnet 5.5 Medium in Claude web/Chrome, sequential reads, new-chat route order alternated. Each accepted answer preserved message count 2, summary deadline 6 October, translation check 4 October, provisional 120 units/week of 12 April 2027, and neither accepted. Representative actual provider reads: [Coach](timing-coach-pair3-tool-dom.txt), [native new chat](timing-gmail-pair3-fresh-tool-dom.txt), [native repeat](timing-gmail-pair3-repeat-tool-dom.txt). These prove actual tool use; provider durations and first-useful-answer time were not instrumented. Coach reads also retain authorized evidence in BOS, while native-only reads do not.

Observer failures are separate from connector failures. Two repeats initially saw the previous turn's completion; a further new-chat observer exited during thinking. Their incomplete elapsed values are excluded, though later reads succeeded. A native extra-repeat locator failed when older messages were virtualized; no valid elapsed result was retained. A correct third Coach read is excluded from the first-repeat comparison. Pair 2 was rerun with freshly seeded two-message chats for both routes, then one repeat each. Seed and extra reads remain recorded. One new-chat native result initially had a stale streaming article label, but its saved completion status and final controls already confirmed completion; its classification was corrected without inventing a later elapsed time.

One attempted instruction-only helper override left its captured email prompt unchanged; the actual authorized extra email read is retained and excluded from the predefined series. The final instruction-only verification used an explicit prompt and real tool trace.

Timing is observed UI completion, not exact final-token time; early samples have roughly 3-second polling resolution. Cache state and infrastructure warmth are uncontrolled. A one-second fresh difference and nearly identical repeat medians do not justify a speed-based source switch. No physical phone, screenshot, bulk, long-thread or new-arrival latency conclusion follows. Keep the current route while researching content/provenance gaps.
