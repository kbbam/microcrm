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

[Timing attempts](timings.json) do **not** establish route performance. The native completion observation (37.580 s) includes observer delay and is an upper bound, excluded from comparison. The Twenty attempt stopped at a Get coach instructions approval prompt after 24.985 s; it was unfinished and is excluded. A persistent Always allow change was requested from the owner, not silently applied. No three-pair cold/warm benchmark, cache behavior or freshness comparison is claimed.

The isolated QA source route lacked authorization and its source-status URL was unconfigured. That blocked the initial QA comparison; the verified production own-source read above resolves content access, not the benchmark or every QA environment configuration. Never tell an executive to wait for Google sync based on this QA authorization failure.

Next: uninterrupted matched cold/warm trials, a verified synthetic Calendar fixture, and an attachment-bearing fixture. Selective binary capture and durable BOS attribution require an authorized content route, not metadata alone. The current recommendation remains to retain Twenty and research a bounded hybrid; replacement/integration is not authorized.
