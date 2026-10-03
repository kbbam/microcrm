# Regular executive CRM correction

Task supplied by the owner’s CRM requirement: “Correct what the coach recorded, and have the coach keep that correction when it helps me next.” Actor: kb@jpgrowery.com, an existing Twenty user newly assigned Member in BAM Sales Coach Test, on desktop Chrome. Success condition: the regular user’s correction persists, a stale coach proposal cannot overwrite it, and a subsequent coach update is visible to that user while original source context remains retained.

This is an agent walkthrough, not a human usability study. Host CUA controlled the existing authenticated browser (tool rung 3, required by host policy). The screenshot trail supports a **static affordance walkthrough with separately observed live transitions**, not a complete Driven-mode visual audit: screenshots/console checks were not captured at every navigation decision. Desktop only; mobile and tablet were not attempted. No JTBD corpus was used; actor/task come directly from owner instructions.

| Step | Goal | Q1 try | Q2 notice | Q3 connect | Q4 feedback | Evidence / likely next |
|---|---|---|---|---|---|---|
| 1 | Obtain ordinary user access | Yes: needed for own corrections | Yes: invitation Google sign-in | Yes: exact workspace/account | Yes: actual Member assignment | `twenty-executive-member-assignment.png`; proceed to own tasks |
| 2 | Find the coach’s preparation task | Yes: repair inaccurate state | Yes: Tasks navigation and named task link | Yes: title and Northstar relation identify it | Yes: task opens in panel | Human-edit screenshot and CUA task-list/panel observations; open task |
| 3 | Correct the task | Yes: summary is already drafted in this synthetic case | **No:** heading has no explicit Edit label | Yes after discovery: clicking title opens field | Yes: Return changes both panel and row | `twenty-executive-human-edit.png`; recover by clicking heading |
| 4 | See the coach respect the correction | Yes: prevent repeated/wrong work | Yes: updated title remains in same view | Yes: “summary already drafted” retains correction | Yes: panel and row update automatically | `twenty-executive-coach-readback.png`; continue work |

Desktop LOW affordance finding at step 3: title editing is discoverable by clicking the heading but has no explicit edit label in the observed accessibility tree. Recovery succeeded. This belongs to upstream Twenty’s title control; no custom frontend was changed. Task success: **Completed with recovery**. Static walkthrough verdict: **Needs changes** for this upstream affordance; this is not a claim of overall Twenty UI quality.

Considered but rejected: the task’s missing due date is intentional because no date was evidenced; the task remains To do because “drafted” does not establish delivery/completion; Member’s missing workspace settings is the intended authorization boundary.

Observed unhappy path: stale coach write returned CONFLICT and preserved the exact human title. Fresh baseline update succeeded. Unconfigured access was recovered through the invitation path (plain workspace sign-in initially returned to Welcome). Connection interruption, slow requests, empty-task UX and mobile behavior were not deliberately exercised. API readback proves persistence separately from UI rendering; rich original and CRM-history preservation are covered by the live proof artifacts.

Screenshots retained under `/Users/user/Documents/BAM-Business-OS-Development/outputs/sales-coach-v1/`. The actual browser changes were made by the agent using the regular account, not by a recruited human.
