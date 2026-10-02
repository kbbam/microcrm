# Coach backlog

Owner: Business OS product owner. Review queue when continuing Coach work; entrypoints: [README](README.md), [QA scenarios](qa/scenarios.md). Research is the first stage for Coach backlog items. A researched proposal is not an approved build. Keep IDs stable, record scope/status/evidence and decisions, and link completed results rather than silently deleting intent. QA scenarios are tracked separately.

## COACH-R001 — Compare direct Claude Google Workspace intake with Twenty intake

**Status:** Research pending; not started. **Type:** research → decision. **Recorded:** owner request 2 October 2026. **Scope:** Coach application/experiment only. **Next action:** assign research when owner calls this item forward. No connector replacement or Google integration is authorized by this record.

**Question:** Would Coach reading the executive's Gmail, Calendar and potentially other Google Workspace sources through Claude's native, already company-configured connectors improve freshness, completeness, speed or usability versus Business OS reading Twenty's synchronized sources? Assess a hybrid as well as either route. Owner reports company-wide availability; per-user authentication/access and actual tool capabilities still need verification.

**Research to do:**

- Read current primary Anthropic/Google documentation and actual tool schemas. Separate desktop/web/iOS/Android, account/organization settings, background versus conversation-time access, per-user grants and scope. Evaluate user reports as supporting observations with dates, not proof.
- Compare the same authorized known email threads/events through both routes: recent and old mail, pagination/search, complete message bodies, thread members/participants, attachments/original bytes, deletions/edits, recurring meetings/time zones. Include two pursuits in one thread and overlapping people; do not infer one pursuit from participant identity.
- Measure executive wait and phase times in cold/warm/fresh chats and long-context conversations, including approvals, tool discovery and retries. Investigate caching/local or conversation storage explicitly; do not assume access to Claude internal caches, local persistence or faster reads. Measure cache freshness/invalidation and cross-device continuity where a supported cache exists.
- Prove how directly read content becomes durable, attributable Business OS evidence/context: native IDs, account identity, exact available text, dates, retrieval time, participants, links, file metadata/bytes where supported, corrections, provenance/confidence. Distinguish source text from model summaries and interpreted facts.
- Keep access centrally governed in Business OS. Native Claude source access can have a separate authorization surface; identify any mismatch with assigned-account/own-source/teamlead policy, inability to enforce centrally, connector bypass, revocation and retained-evidence access. Source authorization never grants Business OS writes or broader sharing by itself.
- Compare operational dependency, portability beyond Claude, administration, quotas, failures, observability, synchronization delay and recovery. No external sends/calendar writes in research tests.

**Hypotheses, not findings:** direct reads may avoid Twenty sync lag and expose different source detail; they may add model/tool round trips, inconsistent cross-client behavior or weaker centrally observable ingestion. Existing company setup may reduce onboarding; individual grants may remain. Better caching is unproven. A hybrid could improve freshness but introduce duplicates and conflicting versions. Preserve negative findings and tool limitations.

**Exit criterion:** source-linked capability matrix + repeatable measured pilot + central-access/provenance assessment + recommendation (retain Twenty, direct, hybrid or insufficient evidence), with unresolved limits and an explicit owner decision before implementation. No research was performed for this item when recorded.
