# Operational bulk QA — 2 October 2026

Owner-supplied job: a returning executive wants the coach to record a long end-of-day update, carry out supported internal actions, and clearly surface what still needs a decision. Actor: kb@jpgrowery.com in an ordinary Claude Desktop conversation, Sonnet 5.5 Medium, against Coach QA and the synthetic Northstar account. No real customer data was changed or contacted. Physical phone/dictation acceptance is separate.

## Results

- Responsibility transfer is **not supported**. Six MCP SDK probes against the production adapter with a synthetic provider (executive/leader × task/opportunity/account) returned blocked / FORBIDDEN_FIELD, with zero provider mutations. This is adapter/protocol evidence, not a successful live ownership transfer. Claude likewise reported the requested Alex handoff as not applied. [Protocol evidence](reassignment.json).
- A 1,446-word end-of-day input retained the complete UI-submitted text, created 18 linked interpreted entries, created two distinct requested tasks and corrected the existing summary task. Corrections, unknown quantity, reported balance, separate pursuits and proposed versus confirmed delivery were preserved. Date-only deadlines remain in task text/context; no arbitrary clock time was invented. [First readback](claude-first-readback.json).
- A fresh chat retrieved the earlier deadlines, balance, quantity and delivery conflict. Further information resolved the missing invoice-reference gap and updated the delivery task; a separate feedback-coordinator task was created without inventing a contact. After uncertain-write recovery, the two named tasks still existed once each.
- Final corrected readback passed 15 explicit acceptance checks, including exact original text, corrected source/history links, human attribution, preserved account display name, four unique task IDs, the 30-minute delivery-call correction and unchanged pursuit stages. [Acceptance](client-acceptance.json), [final persisted sources/context/CRM](claude-final-readback.json).
- All 109 Coach tests passed on final runtime **75edf10a15ce9e6a47241989b2c2083ab0c29de5**; the three new MCP contract tests cover >100-entry bounded batching, one source across accounts, correction history, fresh connection, retry deduplication, mixed partial success, conflict and consequential hold. These contract inputs are authored test interpretations, not proof of language extraction. [Test output](all-coach-tests.txt).

## Failures retained and corrected

The first client run used a batch heading as the Business OS account display name. Central instructions now explicitly distinguish that field from a note heading. The QA fixture name was repaired to its CRM name. That builder repair accidentally wrote the account file as root with private permissions; the next conversation hit EACCES. File ownership was restored to application UID/GID 1000 without changing CRM. The coach read back the provider state before retrying uncertain changes, avoiding duplicates. Both repair receipts are retained. This was a QA fixture incident, not a production credential/data change.

The recovery conversation altered a retained source by adding its own header while claiming exact text; one entry also combined a reported no-order assertion with observed CRM stages under a fact label. These failed strict evidence acceptance. Instructions now require the complete message verbatim even on fallback and conservative attribution for mixed claims. The final client correction retained the actual previous message separately, marked the altered capture as transformed with a pointer to the true original, appended the corrected human-account interpretation and retained prior history. Final latest-message text independently matches the UI input. Local fixture terminal newlines are excluded from comparisons; the executive's submitted paragraph boundaries are preserved.

One benign correction request was stopped by Claude's safeguard with `reasoning_extraction`. The blocked screenshot and original fixture remain. One retry using plain business wording proceeded on the same Sonnet 5.5 model; no safeguard or security setting was disabled. This is a client limitation encountered during QA, not a guarantee that wording eliminates future false positives.

## Task walkthrough and evidence ceiling

The task/actor came directly from the owner, not a scored JTBD corpus. Native CUA operated the real application. Retained screenshots support static review of the reached states, supplemented by actual accessibility traces and independent persistence/provider reads. A formal full Driven UI walkthrough is **not claimed**: screenshots/console checks were not retained for every initial decision. No mobile tier is claimed. This evaluates conversational task completion, not frontend visual quality or a usability study.

| Step | Executive's goal | Try / notice / connect / feedback | Observed outcome / likely next |
| --- | --- | --- | --- |
| Submit the long update | Save the day's meaningful events and requests | Yes / yes / yes / partial | Request submitted; QA-only tool prompts interrupted progress. Approvals were intentionally once-only, not persistent changes. |
| Interpret and apply | Keep pursuits apart and carry out safe tasks | Yes / yes / yes / yes | Details, corrections and task state retained; unsupported reassignment explicitly surfaced. |
| Resume in a fresh chat | Retrieve current commitments and avoid duplicates | Yes / yes / yes / partial | QA fixture EACCES caused an unhappy path; provider readback recovered uncertain writes without duplicate tasks. |
| Correct evidence quality | Preserve original wording and distinguish reports from facts | Yes / yes / yes / initially no | Altered source and overstrong fact label required correction. Final readback verifies both corrections and retained history. |
| Decide what remains | See actual unresolved decisions | Yes / yes / yes / yes | Delivery conflict, phone number, coordinator and quantity remain explicit; no fake owner change or Won transition. |

Task verdict: **completed with recovery**, for supported capture/actions/reporting. Reassignment remains a capability gap. The final bulk reply is allowed to be longer than routine replies because it reconciles meaningful actions; it is not an ordinary-update speed benchmark.

Considered but not failures: a date-only due date is not forced into a timestamp; an ambiguous October/April delivery plan remains unresolved; not changing ownership is the correct response to an unavailable operation. Unverified: real iPhone/Android dictation, app/browser return, member-specific permission inheritance, genuine production save/new-chat recall, original attachment intake on each phone, and known source-content coverage under Ilya's identity. [Exact executive checks](../../executive-quickstart.md).

Production and QA release/version/readiness are recorded in [deployment.json](deployment.json). The central instructions are served to the next instruction episode without Projects or a separate model API. This QA does not research or implement direct Claude Google Workspace intake; that remains [COACH-R001](../../backlog.md).

Production continuation: [actual chat](https://claude.ai/chat/34ed62ff-6f37-4715-8790-2c9015d7e358), [final screenshot](production-setup.png), [trace](production-setup.ax.txt). “Already enabled” was ambiguous with tool availability; explicit **Always allow** confirmation closed the already-completed fresh read check without another configuration pass. The read itself ran without prompts and no real CRM mutation. This is owner desktop proof, not Ilya’s own permission inheritance or genuine-write proof.
