# Permanent authentication surface: final review packet

Owner request (2 October 2026): after satisfactory proof, deploy to a dedicated permanent production Railway address, real Twenty workspace and real identities. Executive kb@jpgrowery.com; kb@cureous.me always administrator/team leader. Custom domain later. The executive works in ordinary Claude, particularly Android; Projects and terminal work are out of scope.

This is a narrow operational refinement of the incumbent OAuth/password screens, plus their missing public entry/recovery links. `impeccable context --target server/src/setup.ts` explicitly returned SCOPED_EXISTING_ALLOWED: incumbent code is design authority despite missing PRODUCT.md and DESIGN.md. There is no redesign, comp, concept roll, new visual world, or simulated aesthetic choice; their contracts do not apply. Product truth comes from the exact owner request above and the continuing pilot requirements. Do not turn missing new-work artifacts into a new-work gate for this refinement.

Operational direction: the user knows where to connect, knows which account they are setting up or using, can recover a failed sign-in and reject a connector. Preserve the existing dark olive ground (#14170f), pale green primary action (#7fc99a), native platform text, border-only form panel and simple one-column composition. A phone must show the complete task with readable inputs and a visible primary action. No campaign/display lettering, imagery, animation or decorative assets are appropriate. Information priority: task heading → reason/account → form or endpoint → primary action → recovery. Account permissions remain centrally managed.

Behavior shipped: stable `/` and `/account` connector setup; `/account/help` honest administrator-issued password reset and disconnect guidance; token-validated setup with confirmation; branded responsive OAuth login with preserved email on incorrect password; consent with Allow connection/Cancel and persistent-connection disclosure. No fabricated emailed recovery or standalone second login session. Password reset consumes once, invalidates older links and ends prior sessions/tokens without changing role grants. Fresh source access is still checked by the Business OS runtime.

Final sources: `/Users/user/microcrm/server/src/auth-page.ts`, `setup.ts`, `oidc.ts`, `users.ts`, `index.ts`. Sample primary auth-page.ts, setup.ts and the interaction routes in oidc.ts. Detector ran once over the shared UI/auth targets and returned `[]`; the subsequent functional recovery/consent refinements add no detected category pattern. Technical final proof: server TypeScript build and 33/33 tests pass against a newly created isolated PostgreSQL container. Actual public-client OAuth integration covers human consent/PKCE, refresh despite absent offline_access, expired access denial, process restart, token rotation, exact audience and grant revocation.

Screenshots are actual local running application, captured through CUA. Synthetic account: executive-render@example.test; local endpoint is explicitly a fixture, not the reserved production hostname. Desktop1280×900, narrow390×844. Final confirm set, all under `/Users/user/Documents/BAM-Business-OS-Development/outputs/sales-coach-v1/production-auth/`:

- Primary desktop: login-desktop.png
- Primary mobile: login-mobile.png
- Additional required: home-desktop.png, home-mobile.png, setup-desktop.png, setup-mobile.png, login-error-desktop.png, login-error-mobile.png, consent-desktop.png, consent-mobile.png, help-desktop.png, help-mobile.png, invalid-link-desktop.png, invalid-link-mobile.png.

Craft floor: `/Users/user/Documents/BAM-Business-OS-Development/.agents/skills/impeccable/reference/craft-floor.md`.

Review instruction package: `/Users/user/Documents/BAM-Business-OS-Development/.agents/skills/impeccable/agents/impeccable_finish_reviewer.toml`. Follow its no-browser, file-only check and disposition/output contracts. Review only the supplied packet, craft floor, screenshots and named primary source files. Do not run another detector or hunt unrelated application interfaces.
