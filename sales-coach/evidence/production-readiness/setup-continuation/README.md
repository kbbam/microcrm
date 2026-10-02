# Claude setup correction — 2 October 2026

Owner feedback: Claude claimed real Twenty email/calendar were unconnected despite completed synchronization, then repeatedly switched from setup to account selection instead of running permission preflight.

## Observed original conversation

Read the actual Claude Desktop conversation **Coach setup configuration**, https://claude.ai/chat/c6520acc-7293-42dc-a324-c6ed5416d82b, all eight messages and the relevant expanded tool results. The initial instructions response reflected an earlier cached source receipt. `coach_status` returned `sources: []` (retained evidence inventory), CRM configuration, and unverified service-credential fields; it had no actual channel-readiness result. Claude treated that inventory as disconnected email/calendar, and confused receipt verification time with source sync time. Later in the same conversation it successfully performed email/calendar reads. The owner's unfinished old Recheck authorization screen is not evidence of revoked existing authorization; no additional consent was needed for the fresh checks below.

The previous permission-preflight document was for setup operators. The central instructions received by Claude did not make this the next setup action. This gap, rather than an implemented automatic preflight, explains the repeated account-choice questions.

## Delivered contract

Runtime `42b0d10f5ec4f780408040a7022dc1535ccbd254` returns fresh own-source verification in both `get_coach_instructions` and `coach_status`, explicitly separates retained evidence inventory from channels, distinguishes provider sync dates from check/receipt times, and reports unavailable verification as unknown. Actual ownership revocation is an authorization gap; it is not a claim that Google itself is disconnected.

The centrally fetched skill now advances setup to the client's one-pass internal-tool permission settings, then permitted bounded account/CRM reads and a fresh-conversation read check. It cannot grant or inspect Claude preferences itself. It does not create fake customer tasks/opportunities, invent dry-run arguments, or call every mutation to trigger approval. Consequential Business OS review stays in place. Actual harmless writes and device acceptance are separate verification claims.

## Real-client proof

The first natural-language prompt was only `@Coach set up`, in https://claude.ai/chat/267fc258-952b-4851-b42d-95468ef6034a. On candidate cf50e3d, Claude reported connected sources with provider email 04:22/calendar 04:30 UTC, qualified content coverage, and immediately requested the internal-tool permission pass. See `fresh-setup-desktop.png` and `fresh-setup-ax.txt`.

Inspected actual **production** Coach connector settings at Customize → Connectors → Yours → Coach. Its URL was the production MCP endpoint. All 15 tools already showed Always allow. No permission setting was changed. `production-permissions-ax.txt` retains every selected radio; `production-permissions-desktop.png` retains the rendered settings.

Reported those observed settings to Claude and continued setup. Account discovery and a bounded company read ran without approval prompts, with no customer mutation. `safe-read-ax.txt` retains the response. The candidate still appended an account-choice question while a fresh-conversation check was pending. Final 42b0d10 explicitly closes that loophole and reuses permissions already confirmed in the current conversation.

Final runtime 42b0d10: https://claude.ai/chat/ac8ae671-2a9f-456d-9516-54f34d47f756 (**Production tools configuration verification**). Prompt continued setup with the already-observed settings and identified this as the fresh-conversation check. Claude fetched central instructions fingerprint `de8a208b4971412cde4f3d959d5ddecb6904b0afe0d653b16caf7a415ec9cbf6`, matching the deployed skill exactly, then account discovery and a bounded CRM read completed without prompts. It explicitly reported read preflight passed, connected source sync with content coverage unverified, and genuine-write/device checks pending. It did not append an account-choice question. See `final-fresh-preflight-desktop.png`, `final-fresh-preflight-ax.txt`, `final-tools-ax.txt` and `proof.json`.

Production deployment `db280e26-abf8-4a9c-9d5c-ebf807c2023a` and QA `5d4bcf25-ed91-47c2-a39b-7f45ba8a2126` report SUCCESS; both public version endpoints match the final runtime; production readyz returns ok. Thirty-three explicitly tracked runtime files were built; no local secrets or untracked material were packaged.

## Technical proof and limitations

`coach-tests.txt`: 106 passing coach tests, including real HTTP/MCP readiness contracts with stale receipt + empty inventory, pending sync, revoked ownership and provider outage. No server implementation changed in this slice; preceding 50 server checks remain applicable. Desktop workflow proof does not establish Android acceptance, every tool's prompt persistence, a harmless real-write result, or full mail/calendar/attachment coverage.

No frontend source changed; Impeccable rendered styling review is N/A for this backend/instruction correction. Screenshots prove the actual Claude workflow, not newly authored page design.
