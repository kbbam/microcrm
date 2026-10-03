# COACH-R001 — Native Claude Google Workspace versus Twenty intake

Research date: 3 October 2026. Owning backlog: [COACH-R001](../../backlog.md#coach-r001--compare-direct-claude-google-workspace-intake-with-twenty-intake), cross-product BOS-017. Owner called research forward alongside work allocation; source replacement and speed optimization are not authorized by this research.

**Recommendation:** retain Twenty as the current authenticated source route. Investigate native Google as an optional freshness/coverage supplement, with a new explicitly attributed intake contract. The bounded live timing comparison shows no convincing native-Gmail speed advantage. It does not justify replacing Twenty or promising faster phone use. Native Gmail does not resolve original attachment capture. A native Google connector also cannot, by itself, enforce Business OS access rules on what Claude reads.

**Status:** documentation/code analysis and live same-thread coverage comparison complete; three matched fresh-chat and three first-repeat timing pairs are complete; attachment-bearing and Calendar comparisons remain open. On 3 October, native Gmail in Claude Desktop retrieved the exact two-message synthetic thread, checked against independent Gmail UI. The production Coach in Claude web retrieved that same thread through authorized own-source Twenty access. Both preserve the actionable details; native Gmail also preserves the reply's quoted original, which Twenty's reply text omits. The exact first-message text hashes match. This is one short-thread coverage comparison, not proof of complete inbox coverage or speed. [Live observations](live-2026-10-03/README.md), [timing summary](live-2026-10-03/timing-summary.json), [measured-pilot protocol](pilot-protocol.md), and [evidence record](evidence.json) retain the limitations and excluded timing attempts.

## Documented facts

These are vendor capabilities, not claims that every deployed connector exposes every field. Sources were read on the research date; Twenty `main` documentation is not proof of the deployed workspace version.

| ID | Source-linked finding |
| --- | --- |
| A1 | Native Gmail supports email search/read, threads, labels and attachment metadata, **not attachment content**. Calendar supports accessible shared calendars. Google permissions are inherited; individual Google authentication follows Team-owner enablement. Retrieval occurs when requested, and retrieved data is retained with its chat. Complex requests can require several calls; advanced filters may be unsupported; quotas and mailbox size affect performance. Sending and calendar mutation exist, so read-only Coach authority must remain explicit. [Anthropic Google Workspace guide](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors). |
| A2 | Web connectors are available on desktop, web, iOS and Android. Mobile installation is beta; desktop/web remain the primary custom-connector setup route. Organization enablement does not authenticate each member. [Anthropic connector guide](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities). |
| A3 | Remote connectors work across Claude surfaces; desktop extensions run locally and are unavailable on mobile/web. This is cloud tool access, not a persistent process on the executive's phone. [Anthropic remote versus desktop guide](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors). |
| T1 | Twenty supports multiple true mailboxes, folder selection and visibility settings. Contact auto-creation can associate people/companies by email domain. Internal email exclusion is configurable workspace-wide. The overview states five-minute updates, but also contains a stale H1-2026 attachment roadmap beside its full-content visibility claim. Neither is a deployed attachment/API guarantee. [Twenty setup source](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docs/user-guide/calendar-emails/overview.mdx). |
| T2 | Twenty's mailbox page describes full threads, participants and timestamps, and links opportunity email views through the associated company. It also says updates appear immediately, conflicting with T1's interval. [Twenty mailbox source](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docs/user-guide/calendar-emails/capabilities/mailbox.mdx). |
| T3 | Twenty's calendar page describes external meetings, attendee-based record linking, and exclusion of internal-only/private events. This is narrower than a general calendar view. [Twenty calendar source](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docs/user-guide/calendar-emails/capabilities/calendar.mdx). |
| G1 | Google exposes ordered thread retrieval and a separate attachment-download API. Provider support does not imply Claude connector support. [Gmail threads](https://developers.google.com/workspace/gmail/api/guides/threads), [attachment API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages.attachments/get). |
| G2 | Calendar APIs support pagination and incremental synchronization. Invalidated sync tokens require a fresh full sync. These are mechanisms for an application we control, not documented controls over Claude's native connector cache. [Events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync). |
| G3 | Gmail has project and user/project quotas; current documentation distinguishes legacy and newer project quotas. Do not hard-code an old universal limit or infer Anthropic's allocated quota. [Google usage limits](https://developers.google.com/workspace/gmail/api/reference/quota). |

An older missing-mail troubleshooting page says internal messages are never synchronized, while T1 explicitly documents a configurable exception. Prefer live configuration and readback over that older absolute statement. [Twenty troubleshooting source](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docs/user-guide/calendar-emails/how-tos/i-dont-see-emails-on-records.mdx). These discrepancies are reasons to measure, not evidence that the current Cureous workspace has either defect.

## Operational comparison

The Twenty column below is the **current Coach adapter**, not the maximum vendor feature set. The native column uses A1–A3; detailed returned fields remain a live-tool question.

| Job | Current Twenty → Business OS route | Native Google → Claude route |
| --- | --- | --- |
| Read email body | Authorized synchronized plain text. Restricted/not-provided fields are disclosed. | Live synthetic check returned both plaintext bodies, including the quoted original. HTML fidelity and longer-message truncation remain untested. |
| Recover a thread | Targeted unique thread plus separate participant collection; bounded pagination and explicit ambiguity. | A1/G1; test completeness, message order and pagination, not only a search snippet. |
| Identify participants | Message-level handles, roles, names and person IDs where supplied. | Live synthetic check returned sender, To, and Cc correctly. Bcc was absent, not verified. Body signature did not override sender identity. |
| Retrieve originals/attachments | Adapter exposes neither original MIME nor attachment bytes. No attachment-object tool is registered. | A1 excludes attachment contents. G1 would require another authorized integration. |
| Read meetings | Title, description, location, times, cancellation and iCalUID; participants separately. Synced subset only. | Test internal/private/shared calendars, recurrence, cancellations, all-day/time-zone details against ground truth. |
| Associate an opportunity | Provider targets are signals. Several pursuits under one account still require evidence-based interpretation. | Source people/domains cannot establish a unique pursuit; the same ambiguity persists. |
| Detect newly arrived activity | Fresh read of Twenty's synchronized records; cannot equate an empty result with no live-mailbox activity. | Potentially avoids the extra synchronization stage; freshness still needs a timestamped comparison. |
| Save company knowledge | Server-authenticated reads, durable originals/text, interpretations, history and current-rights checks. | Reading in Claude is insufficient: relevant source text and attribution must be explicitly persisted to BOS. |
| Use another interface | BOS can expose its retained knowledge independently of Claude. Twenty is replaceable infrastructure. | This intake path depends on Claude until its output has been durably captured. |
| Run in the background | Existing Coach has no unattended model worker. | Requested connector retrieval does not establish an autonomous monitor. |
| Continue on phones | Hosted MCP is independent of local computer files; physical end-to-end phone acceptance still separate. | Documented A2/A3 availability; same-user physical iOS/Android tests pending. |

Implementation evidence: [Twenty adapter](../../twenty.mjs), [source ownership](../../twenty-source-ownership.mjs), [service](../../service.mjs), [context store](../../store.mjs). Inspected during ongoing work-allocation changes; source intake sections above are unchanged by that work. The adapter advertises a 1,000-record discovery bound; reaching it must remain partial coverage, never an inbox-completeness claim.

## Central rights and provenance: the deciding constraint

**Inference from A1 and current code:** the native connector can read whatever that connected Google identity permits, including material outside a particular assigned account or shared sales pool. BOS can reject an unauthorized save/write or withhold retained evidence, but cannot intercept a separate native Google read made inside Claude. Company-wide connector availability is not company-wide access to every mailbox. Supervisor access to BOS context also does not grant access to an executive's Google connector.

There are two policy questions to settle before implementation: (1) is own-source read breadth allowed for the executive while BOS restricts persisted associations/sharing, or (2) must the same BOS policy govern every read? The latter requires a centrally authorized source gateway; a skill alone is an instruction, not technical enforcement. This is a route-specific question, not a proposal to impose rigid restrictions on deliberate Twenty edits.

**Current contract gap:** `retainSource` rejects model-submitted `email`, `calendar`, `crm` kinds and forged `twenty:` keys when retained scope is enforced. Only authorized provider reads establish that provider provenance. A native-Google excerpt cannot honestly enter as a verified Twenty source. Labeling it a user submission would preserve text but prove neither source origin nor current Google access. Do not weaken the gate just to make a demo succeed.

A future route should preserve these separately:

- Trusted actor, connector/provider identity, mailbox/calendar identity, source IDs and source link; message-thread IDs scoped by provider rather than assuming Twenty UUIDs are Google IDs.
- Original returned text, returned representation/coverage, source occurrence/version and retrieval time. A summary or OCR transcript is a derivative with its own uncertainty, not original bytes or guaranteed perfect recognition.
- File metadata when provided: original name, MIME type, size, provider file/attachment ID and checksum. Unknown values remain unknown. Bytes get a verified digest only when actually acquired; a text hash proves only the retained text.
- Account/pursuit candidates and final associations, confidence, corrections and lineage. One thread can discuss multiple pursuits; capture the useful information before a short operational clarification.
- Current read/share authorization and revocation behavior. Revoking a native connector does not automatically revoke already retained BOS data; policy and historical access must be reconciled explicitly.

For a hybrid, deduplicate email by verified provider/header identity plus content version; preserve both retrieval routes. Calendar recurring-instance identity needs calendar/event/instance identifiers, not iCalUID alone. Conflicts stay visible; newer retrieval time alone is not proof of a newer event version. These are proposed contract requirements, not implemented behavior.

## Caching and speed: what can be said now

No reviewed primary document exposes a user-programmable native Gmail/Calendar cache, a client-local persistent evidence buffer or cache-invalidation API. G2 is not evidence that Claude uses that design. Chat history can avoid rediscovering stable references; it cannot prove new email absence or fresh permissions. The existing Coach working buffer already holds instruction/reference state in the conversation, with expiry and fresh provider reads for current-state reports. It is not an Android/iOS disk store.

Historical [ordinary-text QA](../../evidence/hosted-qa/routine-client-proof.md) measured a fresh Claude mail check at 21.133 s and a warm repeat at 3.228 s; a provider thread bundle took 1,616 ms. These are descriptive samples with different warmth, not a native-versus-Twenty comparison or general speed guarantee. Later [bulk QA](../../evidence/operational-bulk-qa/client-acceptance.json) explicitly lacked an uninterrupted benchmark. New optimization remains deferred by the owner.

**Inference:** direct retrieval could reduce data age without reducing total reply time. Native search/read, model reasoning, participant reconstruction, BOS capture and retries may outweigh the synchronization benefit. Measure tool completion, first useful answer, final answer and source age separately. Do not compare a cached warm answer with a fresh provider check.

## Current live timing result — 3 October 2026

Same account, model (Sonnet 5.5 Medium), synthetic thread and prompt apart from source selection; sequential reads with fresh route order alternated. Three measured new-conversation checks and three first repeats per route completed without approval prompts and returned the correct actionable facts. Pair 2 repeat chats were reseeded after observer failures. [All attempts](live-2026-10-03/timing-series.json), [summary](live-2026-10-03/timing-summary.json), [observations](live-2026-10-03/README.md).

| Route | New chat, median (range) | Same chat, first repeat, median (range) |
| --- | --- | --- |
| Production Coach → Twenty | 11.7 s (10.9–13.9) | 7.0 s (6.4–8.2) |
| Native Gmail | 13.1 s (12.4–14.2) | 6.9 s (6.5–7.1) |

These are submission-to-observed UI completion, not provider-only or exact final-token timings. Some observations use a roughly 3-second wait interval; a difference near one second is not a convincing route advantage. Model/provider cache warmth is uncontrolled; new conversation is not cold infrastructure. First useful answer, phase costs, physical-phone time, long threads, new arrivals and screenshot/bulk capture were not measured. The earlier 59-second screenshot workflow is a different job and cannot serve as this comparison's baseline. Same-chat repeats still made actual provider tool calls; faster repeats do not demonstrate a programmable local cache.

The owner completed the pending instruction permission. A separate fresh instruction-only chat successfully called get_coach_instructions without a prompt; repeated production email reads were also uninterrupted. This verifies this account's exercised reads, not all tools or Ilya's saved permissions.

## Decision and remaining work

The evidence supports **retain current route; evaluate a bounded hybrid**, rather than replacement. Possible benefit: current own-source checks and information Twenty intentionally omits. Required cost: route provenance, central-rights choice, deduplication and reliable BOS capture. Neither route currently solves email binary evidence through the Coach adapter/native Gmail connector.

To close COACH-R001: execute the remaining [same-fixture protocol](pilot-protocol.md), now that the authorized production Twenty route is verified; establish attachment-bearing fixture behavior, a working selective binary-intake route and Calendar coverage; then present the policy choice and measured result to the owner. Actual returned fields from both routes and independent email ground truth are now recorded in [live observations](live-2026-10-03/README.md). Physical iOS/Android use and Ilya's individual connector grants remain distinct checks. No runtime or organization configuration was changed by this research.
