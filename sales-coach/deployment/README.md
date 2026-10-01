# Isolated coach service image

Current authorized production pilot, activation and recovery: [production runbook](production.md). The historical preparation proof below does not describe the latest cloud release.

Build from the **repository root**, never the existing Railway `server/` root:

```sh
docker build -f Dockerfile.coach -t bam-coach:qa .
```

`Dockerfile.coach.dockerignore` is Docker's recognized per-Dockerfile ignore file. Its allowlist includes only server source/locked manifests and the hosted coach runtime. It excludes ignored credentials, local evidence, node_modules, exports, tests and unrelated repositories. The image includes both application trees because compiled server routes import `../../sales-coach/hosted.mjs`. Node's base image digest and npm lockfiles fix the build inputs. The image runs as UID/GID 1000 (`node`), without a model API dependency; Claude executes the conversation.

## Runtime configuration and persistence

Use a new isolated service, separate database and durable volume. Do not change the current production Railway service, `server/railway.json`, database, credentials or root directory as a side effect of this package.

| Setting | Value/purpose |
| --- | --- |
| `PORT` | Host-provided port; image defaults to `8080` |
| `PUBLIC_URL` | Stable externally reachable HTTPS origin; no trailing slash |
| `DATABASE_URL` | Isolated Postgres URL for users, OAuth state and coach access grants |
| `COOKIE_SECRET` | Persistent host-managed cookie signing secret |
| `OIDC_JWKS` | Persistent private signing key set generated/stored by the deployment owner |
| `ADMIN_TOKEN` | Host-managed invitation admin secret; not exposed in model tools |
| `COACH_ENABLED` | `1` in this isolated image; no user access is inferred |
| `COACH_CONFIG_ROOT` | `/var/lib/bam-coach/config` |
| `TWENTY_API_KEY` | Optional isolated Twenty credential only when its config uses this env name |
| `LOCAL_INSECURE_DB` | `1` only for a throwaway local non-TLS Postgres; omit for managed databases |

Mount a persistent volume at `/var/lib/bam-coach`, writable by UID/GID 1000. Provision one `<contextKey>.json` in its `config/` directory. For a source-only verification context:

```json
{"contextDir":"../context/qa","executiveId":"exec@example.test"}
```

The file is `config/qa.json`; matching access grants use context key `qa`. `executiveId` is the normalized email of the executive whose context is being retained; authenticated database access mapping supplies each caller's actor/role, so this hosted config does not supply a conversation-selected role. Optional Twenty settings belong in that same trusted file, pointing only to the separately verified isolated workspace. Never bake real configuration, credentials, original files or account memory into the image.

That one volume retains rich context, source/transcription records, original evidence, metadata and capability state across process/container replacements. Back it up together with the isolated Postgres database; restoring only one can lose identity/access continuity or disconnect evidence. Run one application replica per filesystem context: current serialization is process-local, not a distributed-writer lock. Keep this constraint until multi-replica consistency is implemented.

## Railway packaging and verification

Existing `server/railway.json` is the original server service's packaging; it starts `npm start` from `server/`. An isolated coach deployment must instead build **root** `Dockerfile.coach` and use its image command (no inherited start-command override). Set `/readyz` as readiness check, configure the persistent volume and separate Postgres, and inject reviewed host secrets at runtime. Production deployment and production-data mutation still require explicit owner authorization.

`/readyz` checks database availability; it is not proof that executive access, coach config, Claude installation or evidence intake is ready. Before release, prove authenticated `/coach/mcp`, raw original upload/checksum, later retrieval and context restart against this deployed image. Then prove ordinary Claude Android skill invocation using the regular QA executive account. Never substitute an image build for that product proof.

No cloud service was deployed or reconfigured by preparing this package. Local image build results must identify the image ID/revision; they do not establish live mobile acceptance.

## Local package proof, 1 October 2026

`docker build -f Dockerfile.coach -t bam-coach:qa .` succeeded on Linux/arm64, compiling the server and installing both locked dependency trees. Resulting local image ID: `sha256:1a32bdd618ecf07b162299c2d4d58e86970cb9bf7022f646fa1bf3965aec35ba`.

An image-container check loaded `createGateway` and `ContextStore`, confirmed UID 1000, and verified that private local `.env` paths, source evidence, Git metadata and uncompiled server source were absent. A first container wrote a synthetic sourced account to a named volume; a second container retrieved the account and exact source text after the first exited. The temporary verification volume was then removed. This establishes runtime packaging and context persistence across container replacement; full OAuth/evidence HTTP and mobile proof are separate gates. Rebuild after subsequent runtime changes; this ID describes the checked snapshot rather than future working-tree edits.
