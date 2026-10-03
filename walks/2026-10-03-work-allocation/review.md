# Live work-allocation walkthrough — 3 October 2026

**Task source:** owner-approved COACH-B001, not an inferred JTBD corpus item. Executive should find eligible work, take responsibility, hand it off, and understand consequential confirmation. Current runtime `853b332`; initial tests used `e9d2ca3` and failures are retained. Claude Desktop then Claude web, Sonnet 5.5 Medium, isolated Coach QA / Twenty only for mutations. No customer messages. Browser read-only research used the production source route separately.

## Observations and corrections

| Job | Actual observation | Final result |
| --- | --- | --- |
| Discover available work | Initial response correctly found three independent unassigned responsibilities. | Final fresh conversation correctly found the sole remaining unassigned programme responsibility, using readable name/responsibility and no IDs in the reply. |
| Assign to me | First run passed null recipient, then could not recover current identity because old retained-source authorization made the entire status call fail. No mutation occurred. | Runtime now returns trusted member identity in discovery and preserves identity/readiness when historical inventories are withheld. Final self-claim used authenticated member and nonempty source evidence, applied with no failed retry or identity question. |
| Evidence before assignment | Intermediate fresh-chat retest attempted an empty-source assignment and recovered after reading instructions. | Discovery now carries bootstrap guidance; final actual trace is get_coach_instructions → retain_source → one crm_assign_work. Clean final reply: “Done… moved from Unassigned to you… No other responsibilities were changed.” |
| Own handoff | Claude handed the synthetic opportunity to kb@cureous.me; exact receipt showed no unrelated owner changes. | Passed actual Claude/real Twenty operation. |
| Take another owner's opportunity | Executive asked to take the opportunity back without involving the team lead. | Coach refused and did not mutate. It did not claim to file a supervisor request. |
| Native Twenty correction | Human-like UI changed only the synthetic task to No Assignee, then reloaded and observed persistence. Before the executive gained account responsibility, the task was unavailable rather than disclosed beyond scope. | After the reviewed account claim, a fresh Claude crm_read reported that same task as unassigned. It did not claim the earlier unavailable task was deleted or secretly read it. |
| Consequential claim | Actual proposal stayed pending until the authenticated browser Apply action. | Browser displayed Unassigned → kb@jpgrowery.com, applied once, then showed durable Change applied. No agent approval tool exists. |
| Cold review after restart | Opening the pending proposal immediately after deployment exposed uninitialized evidence authority. | Review route initializes its resolver itself; a fresh deployment's first review request worked without preceding MCP traffic. |

Final proof: [clean final claim](step-09-final-claim.jpg), [final conversation](step-09-final-claim-dom.txt), [actual assignment request/receipt](step-09-final-claim-tool-dom.txt), [native readback](step-10-native-readback-dom.txt), [native task after reload](native-03-task-reloaded.jpg), [review applied](step-07-review-applied.jpg). Earlier native-app screenshots/AX remain locally retained; the report preserves their failures rather than declaring the first pass flawless.

## Coverage and limits

Separate SDK/provider proof covers supervisor transfers, concurrency, creator-owned creation, access revocation, private sources and ambiguous-response reconciliation. Actual human-language client proof covers executive discovery, claim, own handoff, refused takeover, fresh native edit readback and browser consequential decision. No supervisor Claude sign-in or physical Android/iOS operation is inferred from those checks. Browser approval prompts were allowed once for QA, not silently changed to persistent permission grants; waiting times are not speed measurements.

The UI refinement passed bundled Impeccable review: [desktop](../../.impeccable/review/work-allocation/desktop.jpg), [390px narrow](../../.impeccable/review/work-allocation/mobile.jpg), [ship disposition](../../.impeccable/review/work-allocation/review.md). The top hierarchy exposes the exact responsibility, account and colleague; desktop comparison is side-by-side, narrow values/actions stack without clipping. Supporting explanation is dense but subordinate and readable. This proves responsive rendering, not phone operation.

Production runtime `853b332` now uses the real Cureous workspace with a separate empty Sales Coach pilot — Ilya Bruman. Role mappings, sources and Berlin remain preserved; initial customer/pursuit catalogue awaits supervisor-approved input. No real customer assignments were made by rollout. See [production gateway proof](../../sales-coach/evidence/work-allocation/production-runtime.json).
