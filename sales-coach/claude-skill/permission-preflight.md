# Executive permission preflight

Owner requirement (2 October 2026, Asia/Bangkok): gather necessary approvals in one setup pass rather than interrupt routine work. This is a setup/release protocol, not an MCP tool that approves other tools or inspects the user's saved approval preferences. Claude's production connector settings were observed to offer a blanket permission menu for all fifteen internal tools on 2 October 2026.

## Configuration pass

1. The owner provisions the existing organization skill/connector. The executive authenticates as themselves; Business OS role/scope comes from trusted central access. Inspect the current tool list, not an older screenshot. Configure the bounded internal tools together through Customize > Connectors > this connector > Tool permissions. In the observed current client, open the category’s blanket permission menu and choose Always allow once for all fifteen tools, after the user approves the persistent setting. Inspect the actual current tool list/category; organization policy may restrict available options. Verify all intended tools have the setting and there are no unexpected tools in the category before using a blanket change.
2. Explain once that these settings remove routine Claude prompts; consequential changes remain held for the Business OS human review page. There are no coach sending/calendar-write tools. A new tool or material permission expansion requires a new permission review. “Always available” controls connector loading and is not “Always allow”; it is per conversation and must not be presented as global pre-approval.

## Builder-owned verification pass

Use an isolated fixture and authenticated ordinary Claude chat. Test instruction retrieval, account discovery/context/source reads, exact typed capture/correction, narrow CRM/mail reads, a safe internal CRM change, evidence original/transcription/download/expiry recovery, and consequential hold/status/human review. Exercise leader-only reporting only with the leader account. Verify persistence and role denial independently. Use real supported operations, not invalid calls, fake approval arguments or risk downgrades. Test evidence bytes with a generated file; do not ask the executive to manufacture uploads solely to trigger every tool.

For a new executive's setup, use a permitted account read and the first genuine harmless capture/ordinary update as the smoke check. Do not create pretend customer tasks/opportunities or fire every mutating tool to obtain prompts. Builder release QA carries broad functional coverage; per-user setup verifies authentication, saved prompt settings and one real workflow. If the client exposes an explicit dry-run/preapproval operation in a future version, evaluate that operation rather than inventing one.

Start a fresh chat after saving the settings. Verify that normal account read, typed save and CRM read/update proceed without a prompt; repeat essential behavior on the executive's actual Android app. If prompts recur, report the precise tool and surface, handle them within the same setup session, and do not call setup complete until the fresh-chat test succeeds. Do not claim all settings persisted because only one tool did. Schema/metadata changes are a possible explanation for renewed prompts in the current development iteration, not a verified cause; include client-preflight rechecking in release qualification.

## Current observed proof

The owner approved fifteen internal settings earlier, yet four changed tools subsequently prompted: crm_propose_change, get_account_context, update_account_context and crm_read. Actual action-time Always allow approvals were applied. A subsequent safe CRM update, typed correction and fresh-chat account read ran without interruption; the CRM/mail-read follow-up is recorded in routine-client-proof.md. This is bounded evidence, not a guarantee about unexercised tools, all devices or future Claude releases.

Sources checked 1 October 2026 UTC:
- [Claude connector permissions](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities): category/individual Always allow, Needs approval and Blocked settings; source-system permissions remain separate.
- [Claude tool loading](https://support.claude.com/en/articles/13730515-manage-claude-s-tool-access): Auto, Always available and On demand; selection applies to the conversation.

## Production setup observation — 2 October 2026

The permanent production connector named Coach visibly shows Connected in Claude Desktop after the OAuth redirect correction. Its Other tools category contains fifteen internal tools and exposes a single blanket permission menu. Every tool initially showed Needs approval. The one-pass production change was presented to the owner for required action-time confirmation; it has not yet been applied or proved in a fresh conversation. This is distinct from the earlier isolated QA approvals.
