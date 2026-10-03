# Work-allocation dependency checks — 3 October 2026

COACH-B001 scoping began on `codex/coach-work-allocation`, from `446370a`. No new allocation capability is implemented or deployed by these checks. Production was read only; a single synthetic task was created and assigned in the isolated QA Twenty workspace, with no messages sent.

## Finding that affects the implementation

[Native permission metadata](native-permissions.json) confirms Cureous's `RLS` and `RECORD_SHARING` entitlements are false. Ilya and the executive QA member have the Member role, with workspace-wide record reading/updating and no object, field or row restrictions. Therefore direct Twenty edits are not technically governed by Coach's own-handoff / supervisor-approved takeover boundary.

[Twenty's current documentation](https://docs.twenty.com/user-guide/permissions-access/capabilities/permissions) places record-level restrictions on the Organization plan. Field permissions are supported independently, but making owner fields read-only would require a controlled allocation action; it is not a transparent substitute for ordinary direct owner edits. Manually invoked workflows also require workflow-management access according to the same documentation; do not grant that broad authority just to make transfers work.

**Resolved by owner 3 October:** no rigid technical restrictions in Twenty; native ownership changes follow team procedures while Coach enforces its action/access boundaries technically. A plan upgrade or ownership-field lock is not required. Preserve the earlier metadata finding as observed state, not an unresolved blocker. A plan upgrade alone is not proof that all required discovery/create/handoff behaviors work: the chosen rules must be verified in isolation before production changes. No billing, role or permission change is authorized by this evidence.

## Finding that permits the claim design to proceed

[Live concurrent-claim probe](concurrent-claim.json): two simultaneous updates of one genuinely unassigned synthetic task used both the original `updatedAt` and an unassigned-owner predicate. One request updated one record; the other updated zero. Final readback matched the winning assignee. This supports the filtered-update approach. It is one live task race, not proof of stress behavior, all object types or native UI concurrency. Keep these distinctions in acceptance evidence.

## QA versus development dependency

Physical iOS/Android onboarding and tool-approval persistence remain independent current-build QA. They do not block allocation implementation. Portfolio population and Ilya's personal source connection remain rollout inputs, not prerequisites for synthetic implementation. The native policy decision is now resolved; implement that scope without weakening Coach access. The future supervisor-request queue is BOS-021 and does not block this allocation build.
