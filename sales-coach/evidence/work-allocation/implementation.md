# Work allocation implementation — 3 October 2026

Working tree: `codex/coach-work-allocation`. Dedicated `crm_work_list`, `crm_members` and `crm_assign_work` tools are registered only with trusted `twenty.workAllocation.enabled=true`. The host supplies the authenticated actor and verified workspace member; model input cannot set roles, eligible members or work pools. Generic owner-field writes remain forbidden.

## Behavior

Executives discover shared work within explicitly configured active initiatives and their participating accounts. Availability is independent of stage: only unassigned responsibility is available. Opportunity pool membership is an explicit trusted catalogue, never inferred solely from sharing a company. The team lead can list all team work and allocate/transfer any CRM responsibility. Executives claim for themselves and hand off their own responsibility; taking another owner's work requires the supervisor. Account, programme, pursuit and task fields are independent.

New accounts/pursuits/tasks are immediately usable and creator-owned in executive scope. Possible matching account identity blocks duplicate creation with a concrete next step. No qualification gates are added. Multi-account task transfers name all linked accounts and force normal human review. Consequential proposals bind source evidence and exact baseline; the agent cannot approve them.

Claims use provider compare-and-set on ID, version and previous owner, including `is: NULL`. Scope is refreshed on the next MCP operation, including native Twenty edits. A handed-off task grants its recipient its linked work context. Shared discovery grants no other mailbox/calendar/private originals. Sources and interpretation history are retained; old executives lose unauthorized current context. Exact retry and ambiguous-response reconciliation return a narrow durable receipt without reopening handed-off private context.

## Proof and limits

- 119 Coach tests pass, including real MCP SDK clients against synthetic providers. Dedicated checks cover competition, role boundaries, own handoff, independent responsibility, high-consequence review, multi-account task scope, withdrawn eligibility, incomplete discovery, native-equivalent assignment corrections, lost response, revocation and new work.
- 50 server tests pass against isolated Postgres schemas in the QA environment; TypeScript build passes. Tests never use production DB. The first local server run lacked a test database; the complete gate was rerun with isolated schemas through the QA host.
- [Actual MCP + Twenty provider proof](live-mcp-provider.json) exercises a real synthetic QA programme, concurrent pursuit claims, own task/pursuit handoff, supervisor programme allocation, trusted consequential review and actual creator-owned company/pursuit/task creation. It uses local MCP SDK clients, not Claude or browser clicks.
- [Earlier unpaced attempt](live-first-attempt.json) preserves a temporary account-authority failure. A complete paced rerun passed; its cause was not conclusively identified. Probe pacing is verification machinery, not a shipped speed change or benchmark.
- Native programme schema/relations are mirrored in the isolated Twenty QA workspace. No Berlin or real customer records were changed, and no external messages were sent.
- Live Claude natural-language and native Twenty UI checks are pending because the Mac is locked. Physical mobile acceptance remains separate. No production release of allocation is claimed.

## Trusted deployment configuration

Configure each authenticated user's existing protected JSON, retaining existing source receipts and keys:

```json
{
  "twenty": {
    "workAllocation": {
      "enabled": true,
      "memberId": "verified-workspace-member-uuid",
      "eligibleMemberIds": ["verified-colleague-or-supervisor-uuid"],
      "initiativeIds": ["approved-pilot-initiative-uuid"],
      "opportunityPools": [{"initiativeId":"approved-pilot-initiative-uuid","opportunityIds":["explicitly-published-pursuit-uuid"]}]
    }
  }
}
```

Placeholders above are documentation, not valid configuration. Executive `scopeMode` must be `assigned` and its existing member/owner mapping must match; supervisor scope is `workspace`. An empty opportunity catalogue publishes no shared pursuits, even under participating accounts. This trusted catalogue must be updated deliberately when publishing shared pursuits; ordinary new creator-owned pursuits remain usable without publication. Initial production customer membership remains an input, not permission to populate Berlin or relabel non-sales work.

Developer QA uses `scripts/provision-allocation-qa.mjs` then `scripts/verify-allocation-qa.mjs`, with `COACH_QA_CONTROL_ROOT` pointing to protected local credentials/fixture files. Provisioning has a fixed isolated origin and no production fallback. The verification script resets only its own named synthetic fixtures and keeps receipts locally.
