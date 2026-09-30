# Sales executive coach

The coach runs in the existing authenticated Codex CLI with only this package's bounded MCP tools. Twenty remains the human's normal operational interface. Source originals and richer account context persist separately from the CRM projection. This package does not install a plugin, alter global Codex configuration, or supply a custom chat interface.

## Native conversation

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
