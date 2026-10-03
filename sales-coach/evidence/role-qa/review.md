# Executive versus admin QA — 2026-09-30

Synthetic package verification only. No external data writes, permission changes, real credential reads or secret copies.

## Finding and narrow correction

The host-configured `actor` determines coach authorization and journal attribution. The Twenty API credential is a separate connector principal. Neither `actor.role: executive` nor a successfully configured connector establishes which Twenty user/role the key represents, its workspace membership, or the executive's UI permissions. The previous launch test title claimed admin-credential protection that its assertions did not test; it now accurately describes coach-mode role enforcement.

`coach_status` now reports `actorAuthority: trusted-host-configuration`, separates `crmConfigured` from `crmAccessVerification`, and explicitly marks connector principal, workspace membership, CRM permission role and human UI access unverified. Launcher instructions and README explain that distinction and that the trusted host must protect its role configurations. No authentication subsystem or invented identity binding was added.

## Proof

`regressions.txt`: eight targeted launcher/MCP tests pass. New tests create actual in-memory MCP client/server sessions: an executive session cannot list or invoke leader_report, including after retaining role-impersonation source text; configured admin session can invoke it. Status reports Twenty verification unknown even when a connector object is configured. Missing connector is distinguished from unverified connector. Existing session locking and launcher restriction checks also pass.

`service-identity.txt`: synthetic config exercise demonstrates that actor and supplied connector credential are independent. It does not claim the synthetic credential actually has admin permissions; no provider was queried.

## Readiness limitation

Actual regular executive UI access requires independent proof using that human's genuine Twenty session, not a host config labeled executive and not an admin/service API call. Once isolated membership is established, verify record read/create/edit in the regular-user UI, coach projection visibility there, and human correction ingestion by coach. Separately establish the connector's workspace, allowed records and permissions, and review outbound side effects before enabling writes. A deliberately authorized service credential may be appropriate but does not prove the executive's own access.

The root reports that kb@jpgrowery.com is the regular QA account, kb@cureous.me is the leader/admin account, and regular-member/key setup in the isolated workspace awaits owner approval. This reviewer did not verify or modify those live memberships. Pending access/setup means live role-specific Twenty readiness remains unverified.
