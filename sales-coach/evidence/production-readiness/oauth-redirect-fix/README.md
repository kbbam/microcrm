# Actual Claude production handoff fix — 2 October 2026

The owner reported a real production connection failure after completing consent. Earlier synthetic HTTP OAuth checks passed but did not exercise Chrome’s Content Security Policy enforcement. Four production authorization codes had been issued without being consumed; the repeat consent page was already consumed and displayed session expired. Browser profile switching was reported by the owner, but is not the demonstrated cause.

## Demonstrated cause and correction

The originating login/consent document used `form-action 'self'`. Chrome blocked the form submission’s redirected navigation to Claude, even when the initial POST and intermediate redirect were on the Business OS origin. A two-origin localhost fixture using the compiled production `authHeaders` reproduced the failure: the original policy left the consent page onscreen; the OAuth-specific policy reached the destination. See the retained regression screenshots. This fixture uses no accounts, credentials or customer data.

Revision `fb1824eb0b40550be29bf1204df646d7514f3160` omits `form-action` only on validated OAuth interaction login/consent documents and executive Twenty source-login documents. Ordinary/error/status forms retain `form-action 'self'`; default-src none, base-uri none, frame-ancestors none, no-store and no-referrer remain. OAuth redirect registration, PKCE, nonce/Origin checks and pinned source-provider validation are preserved. This also fixes the same redirect defect on the source-login route; real Twenty source consent remains unverified.

The full-repository Docker context now includes `twenty-source-ownership.mjs`, required by the runtime import and COPY instructions. A full Docker image build and UID1000 runtime import succeeded. 45 server tests passed, including ordinary-form CSP, OAuth documents, source documents and invalid unregistered redirect rejection. Independent final patch review found no blocking issue.

## Actual owner connection

Production deployment `ad68d144-f5d4-4360-a691-a24ee5b8bfd8` serves the corrected revision. With the owner’s action-time permission, a fresh Claude Desktop authorization completed. Chrome visibly displayed Connected and returned to Claude; the Desktop Coach settings visibly show Disconnect and the permanent production MCP URL. `owner-connection-receipt.json` contains only sanitized counts and actor fields: one consumed code, one AccessToken and one RefreshToken for the enabled executive. No token values, cookies, keys, full OAuth payloads or passwords are retained here.

Actual trusted MCP account read and current production permission persistence are separate verification steps. Physical Android acceptance and executive source authorization remain pending. Do not equate Connected or synthetic source-handler tests with real inbox coverage.

Browser reference: [MDN form-action](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action). The browser observation above is the decisive product proof.
