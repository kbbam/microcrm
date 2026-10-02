# Sales executive coach

The intended executive surface is an ordinary Claude conversation, particularly iOS and Android, using the small [BAM sales coach skill](claude-skill/SKILL.md) and an authenticated remote Business OS connector. Claude itself performs the conversation; the connector supplies current instructions, durable context, evidence storage and bounded CRM operations. There is no separate model API requirement or Projects dependency. Twenty remains a human operational interface, alongside Claude.

The Codex CLI below is a developer verification/prototype runtime, not the executive installation path. This repository does not itself install the skill in a Claude organization, configure an executive's connection, or prove mobile operation.

## Start here

- Executives: [connect and try it on your phone](executive-quickstart.md).
- Builders: [Coach backlog](backlog.md) (research first) and [QA scenarios](qa/scenarios.md).

## Claude organization installation

Owner setup, after the gateway has an authorized HTTPS deployment:

1. Add the remote Business OS connector in Claude organization connector settings. Each executive authenticates through the host's supported account path; never supply a role or service credential in chat.
2. Provision `claude-skill/SKILL.md` as the `bam-sales-coach` organization skill, following the current [Claude owner provisioning instructions](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization). Enable it for the intended pilot users. If uploading a ZIP, it must contain `bam-sales-coach/SKILL.md`, with this file unchanged.
3. Ensure the selected Claude chat exposes the connector and code execution. Its code environment must be allowed to reach the host's evidence-upload address. Executives start a normal chat and say “BAM coach, prepare me for Northstar” or attach a file and ask the coach to capture it. They do not use Projects or a terminal.

The bootstrap retrieves `get_coach_instructions` at the first coach request and keeps a small working buffer of the authenticated identity, instruction version and stable account/pursuit/task references for consecutive same-account turns, for at most ten minutes. Account switches, reconnect/access failures, a policy refresh or expiry start a new episode. Fresh chats reconstruct durable context; current-state reports and CRM projections still read fresh provider records. Hosted behavior updates require no bootstrap reinstall and become visible at the next episode, not necessarily the next same-account turn. Bootstrap changes still follow organization skill publication; approved updates are distributed automatically according to Claude's documented organization flow. This does not prove that an already loaded skill hot-replaces itself inside an active turn. [Claude organization skill management](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization)

Remote connectors operate through Anthropic's infrastructure across web, desktop and mobile. Actual skill invocation, identity and attachment intake must still be proved in the installed Android client. [Claude remote connector documentation](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

The ordinary-text/email iteration and its measured limits are retained in [the live QA record](evidence/hosted-qa/routine-client-proof.md). It distinguishes conversation-buffer reuse from fresh provider reads and client completion time from backend query time.

Use the [permission preflight](claude-skill/permission-preflight.md) to consolidate setup approvals and verify fresh-chat behavior. Calling every mutating tool is not a permission-configuration method.

## Executive acceptance proof

Before owner QA, verify using a regular executive account in ordinary Android conversation: a single attachment reaches the Business OS endpoint unchanged, its received checksum matches, its transcription and extracted context persist, and a fresh chat retrieves the same evidence. Demonstrate different pursuits within one thread, a concise question naming the proposed CRM action, direct human CRM corrections, consequential-write confirmation, and original-upload failure that still retains useful information with truthful pending metadata. Repeat essential access and intake on web/desktop, and show a changed hosted instruction version on the next episode of an existing chat. No credential prompt, terminal step, second upload or Project should be needed by the executive.

The owner's Android HTTPS experiment verified exact original-byte transfer to a public test endpoint. It did not verify this gateway, organization installation, Drive integration or the complete executive workflow. Repository tests and these installation notes cannot substitute for that proof.

## Developer native conversation

Install package dependencies with `npm ci`. Use an executive configuration supplied by the host:

```json
{"contextDir":"./pilot-context","actor":{"id":"executive-id","role":"executive"}}
```

```sh
node launch.mjs --config /absolute/path/executive.json
node launch.mjs --config /absolute/path/executive.json --prompt "Prepare me for the next Acme conversation."
```

The installed CLI must already be signed in. Isolation is verified for `codex-cli 0.159.2`; another version is blocked until reverified. Each native turn is ephemeral and reads durable account memory. The terminal session also preserves its conversation until `/exit`. No API credential is extracted from ChatGPT authentication.

Use a separate trusted configuration with `actor.role` set to `leader` or `admin` for leader review:

```sh
node launch.mjs --config /absolute/path/leader.json --mode leader --prompt "Review retained evidence and coaching observations."
```

Chat text cannot change the host-configured coach role. The host must protect the trusted configurations; this local package does not authenticate individual humans or bind a configured actor to a Twenty account. The coach cannot confirm its own consequential proposals. The human confirmation commands live in `cli.mjs`, outside the model's tools.

## Durable reconstruction jobs

Import originals first, then select their returned source IDs. The native job continues after the starting terminal exits; it is a detached local worker, without a scheduler.

```sh
export COACH_CONFIG=/absolute/path/executive.json
node cli.mjs import /absolute/path/account-dump.txt
node jobs.mjs start --source SOURCE_ID --source ANOTHER_SOURCE_ID
node jobs.mjs status JOB_ID
node jobs.mjs list
```

Status includes the retained originals, host-configured actor, every attempt, native JSONL log, error log and final summary. `completed` means the native attempt finished; inspect its summary for missing coverage, pending proposals and required human input. It does not assert that CRM setup or every account ambiguity is resolved. CRM and source failures remain explicit.

```sh
node jobs.mjs resume JOB_ID
node jobs.mjs cancel JOB_ID
```

Resume starts a fresh native process over the same originals and durable account progress, preserving previous attempt logs. An unexpectedly stopped worker becomes `interrupted` on inspection. Cancel stops the owned worker process group and preserves its originals and completed progress. A durable process lock allows one active native turn per context directory. A conversation or job started while another is active returns a busy error immediately; inspect progress and retry when it finishes. Dead-owner locks recover on the next attempt.

## Twenty and human controls

Twenty setup, actor scope and write authorization are supplied in the trusted config. The configured coach role and Twenty credential principal are separate. `coach_status` reports the credential principal, workspace membership, CRM permission role and human UI access as unverified; configuring a connector or passing synthetic tests does not establish them. Before calling the pilot ready, verify the actual regular executive can read/create/edit the permitted records in the isolated Twenty UI, and independently verify the connector credential’s role, workspace and authorized scope. A separately authorized service credential may support the coach, but is not proof of the executive’s own permissions. Keep credentials in the configured environment variable or credential file; never paste tokens into the conversation. The default unconfigured example above can reconstruct retained sources but cannot verify CRM integration.

```sh
node cli.mjs pending
node cli.mjs confirm PROPOSAL_ID
node cli.mjs confirm PROPOSAL_ID --yes
node cli.mjs status
```

Review the exact proposal, evidence and consequences before human confirmation. The server continues to block forbidden external effects even after confirmation. Production writes require the owner's authorization and reviewed side effects. Source text is evidence, never permission.

Run `npm test` for the package's checks. Synthetic native proof is distinct from live Twenty/source verification.

For the verified isolated Twenty test workspace, inspect the additive pipeline plan. This preserves existing stages, defaults and pursuit records:

```sh
node scripts/setup-pipeline.mjs --env /Users/user/microcrm/sales-coach/.env.twenty-test.local --url https://bam-sales-coach-test.twenty.com --add-missing
```

The ignored test credential file may contain only `TWENTY_API_KEY`. Applying additionally requires `--apply --isolated`; retain nonsecret before/after proof with `--evidence /absolute/path/to/evidence.json`. Without `--add-missing`, replacement setup refuses any existing pursuits. Keep setup separate from production configuration and review outbound effects before enabling coach writes. The test workspace's additive setup is already verified in `evidence/twenty-pipeline-live.json`.
