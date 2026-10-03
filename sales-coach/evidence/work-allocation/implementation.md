# Work allocation implementation — 3 October 2026

Working tree: `codex/coach-work-allocation`. Dedicated `crm_work_list`, `crm_members` and `crm_assign_work` tools are registered only with trusted `twenty.workAllocation.enabled=true`. The host supplies the authenticated actor and verified workspace member; model input cannot set roles, eligible members or work pools. Generic owner-field writes remain forbidden.

## Behavior

Executives discover shared work within explicitly configured active initiatives and their participating accounts. Availability is independent of stage: only unassigned responsibility is available. Opportunity pool membership is an explicit trusted catalogue, never inferred solely from sharing a company. The team lead can list all team work and allocate/transfer any CRM responsibility. Executives claim for themselves and hand off their own responsibility; taking another owner's work requires the supervisor. Account, programme, pursuit and task fields are independent.

New accounts/pursuits/tasks are immediately usable and creator-owned in executive scope. Possible matching account identity blocks duplicate creation with a concrete next step. No qualification gates are added. Multi-account task transfers name all linked accounts and force normal human review. Consequential proposals bind source evidence and exact baseline; the agent cannot approve them.

Claims use provider compare-and-set on ID, version and previous owner, including `is: NULL`. Scope is refreshed on the next MCP operation, including native Twenty edits. A handed-off task grants its recipient its linked work context. Shared discovery grants no other mailbox/calendar/private originals. Sources and interpretation history are retained; old executives lose unauthorized current context. Exact retry and ambiguous-response reconciliation return a narrow durable receipt without reopening handed-off private context.

## Proof and limits

- 120 Coach tests pass, including real MCP SDK clients against synthetic providers. Dedicated checks cover competition, role boundaries, own handoff, independent responsibility, high-consequence review, multi-account task scope, withdrawn eligibility, incomplete discovery, native-equivalent assignment corrections, lost response, revocation and new work.
- 51 server tests pass against isolated Postgres schemas in the QA environment; TypeScript build passes. Tests never use production DB. The first local server run lacked a test database; the complete gate was rerun with isolated schemas through the QA host.
- [Actual MCP + Twenty provider proof](live-mcp-provider.json) exercises a real synthetic QA programme, concurrent pursuit claims, own task/pursuit handoff, supervisor programme allocation, trusted consequential review and actual creator-owned company/pursuit/task creation. It uses local MCP SDK clients, not Claude or browser clicks.
- [Earlier unpaced attempt](live-first-attempt.json) preserves a temporary account-authority failure. A complete paced rerun passed; its cause was not conclusively identified. Probe pacing is verification machinery, not a shipped speed change or benchmark.
- Native programme schema/relations are mirrored in the isolated Twenty QA workspace. No Berlin or real customer records were changed, and no external messages were sent.
- [Live Claude/native Twenty/browser walkthrough](../../../walks/2026-10-03-work-allocation/review.md) completed with discovered failures corrected, and final clean self-claim at runtime `853b332`. Physical mobile acceptance remains separate. Production rollout is recorded below.

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

## Earlier QA deployment snapshot — before client corrections

Runtime `e9d2ca3` is deployed at https://coach-api-qa.up.railway.app (Railway deployment `b48d5f7d-fa4b-4aa3-85f9-df84fdfefaba`). `/readyz` returned 200; `/version` returned `e9d2ca3`. Production independently returned 200 and unchanged `75edf10a15ce9e6a47241989b2c2083ab0c29de5`.

QA configuration maps `kb@jpgrowery.com` to assigned executive scope with the synthetic pilot, and `kb@cureous.me` to a separate full-workspace supervisor context. The supervisor explicitly retains access to the former shared QA context. Existing context files and source receipts were retained; configuration was backed up with private file permissions. This changes only the isolated QA environment. No production portfolio was imported or assigned.

At that earlier snapshot, the natural conversation checks still required were: discover available work; claim the synthetic Autumn trial pursuit while preserving account/task owners; hand off that pursuit to the supervisor; verify the supervisor can assign it back; and review a consequential transfer with clear responsibility/recipient wording. The native check changes only the synthetic task's assignee in Twenty and verifies the next Coach operation reflects it. A mock or SDK test does not close these client/interface checks.

[Deployed gateway proof](deployed-gateway.json) verifies the actual QA Postgres role mappings, 18 executive/19 supervisor tools, current instructions, executive refusal of team-wide listing and supervisor writes restoring exactly three synthetic available responsibilities. It uses the deployed gateway with MCP SDK clients; public OAuth/client UI is not inferred. QA source access is still separately authorization-required for its assigned executive and was not treated as disconnected Google or completed source setup.

## Final client corrections and production rollout

Runtime `853b332ebf5beb8406499dc919c96c13437ac038` is deployed to QA and production. Initial client failures caused authenticated identity/readiness to be lost when old evidence access was unavailable, allowed the model to confuse null with self-assignment, and exposed evidence preparation too late. Discovery now returns trusted actor/member identity and concise bootstrap guidance; status withholds unavailable inventories without presenting absence or losing identity. Final actual Claude self-claim loaded instructions, retained exact words, then made one successful assignment. Review now displays verified colleague labels instead of IDs and initializes evidence authority on its first request after restart.

Production deployment `425098aa-5b05-4f65-b2c2-07ec88974fbe` uses https://business-os-production-1193.up.railway.app and the real https://cureous.twenty.com workspace. The separate **Sales Coach pilot — Ilya Bruman** is ACTIVE, managed by kb@cureous.me; membership and pursuit catalogue are empty pending approved input. No Berlin initiative or customer ownership was changed. [Configuration/readback proof](production-config.json), [deployed-role/MCP/Twenty read proof](production-runtime.json). Existing source receipts were retained byte-for-meaning; kb@jpgrowery.com still reports connected, Ilya requires his individual source authorization, and admin CRM authority is not itself a personal mailbox grant.

The three allocation tools are available (18 executive, 19 supervisor tools). The existing Claude production connection read the authorized synthetic email thread successfully; no CRM/customer write was made by production verification. A later fresh chat prompted for Get coach instructions, so persistent client permission acceptance and matched timing remain pending rather than claimed passed. Independent physical-phone checks remain listed in QA scenarios.

Final technical gate: 120 Coach tests, 51 server tests with isolated QA Postgres, TypeScript build. Human confirmation rendering has an empty one-run detector result and bundled reviewer disposition ship. No source/security review substitutes for this visual proof.
