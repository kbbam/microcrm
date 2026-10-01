import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { oidc, coachEnabled } from "./oidc.js";
import { resolveCoachPrincipal, type CoachPrincipal } from "./coach.js";
import { verifyLogin } from "./users.js";

type BrowserSession = { id: string; accountId: string; destroy?: () => Promise<void> };
type ActorContext = { service: any };
type Options = {
  getActor: (principal: CoachPrincipal) => Promise<ActorContext>;
  publicUrl?: string;
  enabled?: () => boolean;
  resolvePrincipal?: (id: unknown) => Promise<CoachPrincipal | null>;
  readBrowserSession?: (req: Request, res: Response) => Promise<BrowserSession | null>;
  createBrowserSession?: (id: string, res: Response) => Promise<BrowserSession>;
  endBrowserSession?: (req: Request, res: Response) => Promise<void>;
  verifyPassword?: (email: string, password: string) => Promise<boolean>;
};

const safeId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const scalar = (value: unknown) => value === undefined ? "Not retained" : value === null ? "Empty" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
const recordName = (record: any) => [record?.name, record?.title].find(value => typeof value === "string" && value.trim())?.trim();
const fieldName = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, char => char.toUpperCase());
const cookie = (req: Request, name: string) => req.headers.cookie?.split(";").map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
const equal = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function shell(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Business OS</title><style>
  :root{color-scheme:dark;--page:#14170f;--surface:#1b1f18;--line:#384031;--text:#e9ece5;--muted:#afb8a5;--accent:#7fc99a;--warning:#e0ab5f}
  *{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--text);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}main{width:min(100% - 48px,760px);margin:32px auto 64px}header{display:flex;gap:16px;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:1px solid var(--line)}.brand{font-weight:650}.identity{font-size:.875rem;color:var(--muted);overflow-wrap:anywhere;text-align:right}h1{font-size:1.75rem;line-height:1.2;font-weight:650;margin:28px 0 8px;text-wrap:balance}h2{font-size:1.125rem;line-height:1.35;margin:0 0 12px}p{margin:0 0 12px;max-width:70ch}.record-name{font-size:1.125rem;font-weight:600;margin:-4px 0 8px;overflow-wrap:anywhere}.account{font-size:1.125rem;color:var(--muted);margin-bottom:24px}.notice{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin:20px 0}.notice p:last-child{margin-bottom:0}.status{color:var(--warning);font-weight:600}.status.success{color:var(--accent)}.muted,.meta{color:var(--muted)}.meta{font-size:.875rem}.reason{margin:22px 0 28px;white-space:pre-wrap;overflow-wrap:anywhere}section{margin:28px 0}.changes{border-top:1px solid var(--line)}.change{padding:18px 0;border-bottom:1px solid var(--line)}.field{font-weight:650;margin-bottom:10px}.values{display:grid;grid-template-columns:1fr 1fr;gap:24px}.value-label{font-size:.8125rem;color:var(--muted);margin-bottom:4px}.value{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:inherit}.new-value{color:var(--text)}details{border-top:1px solid var(--line);padding:14px 0}details:last-child{border-bottom:1px solid var(--line)}summary{cursor:pointer;min-height:32px;overflow-wrap:anywhere}summary span{color:var(--muted);font-size:.875rem}details .source{margin:14px 0 8px;white-space:pre-wrap;overflow-wrap:anywhere;max-width:70ch}details .meta{margin:8px 0}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}button,.link-button{min-height:46px;padding:11px 20px;border-radius:7px;font:inherit;font-weight:600;cursor:pointer;transition:background-color .15s ease-out;border:1px solid transparent}button{background:var(--accent);color:var(--page)}button:hover{background:#9ed7b2}button:active{background:#68b884}button.secondary{border-color:#616d57;background:transparent;color:var(--text)}button.secondary:hover{background:#293122}button.secondary:active{background:#35422d}button:disabled{cursor:wait;opacity:.65}.link-button{display:inline-flex;align-items:center;background:var(--accent);color:var(--page);text-decoration:none}a{color:var(--accent);text-underline-offset:3px}a:hover{text-decoration-thickness:2px}a:active{color:#9ed7b2}:focus-visible{outline:3px solid var(--accent);outline-offset:4px}::selection{background:#486b37;color:#fff}input{width:100%;min-height:46px;background:#20241c;color:var(--text);border:1px solid #616d57;border-radius:7px;padding:10px 12px;font:inherit;caret-color:var(--accent)}input:hover{border-color:var(--accent)}input::placeholder{color:var(--muted)}label{display:block;margin:18px 0 6px}.login{max-width:420px}.footer{border-top:1px solid var(--line);padding-top:20px;margin-top:30px;color:var(--muted);font-size:.875rem}.signout{border:none;background:none;color:var(--muted);font-size:.875rem;padding:10px 0;min-height:44px;font-weight:400;text-decoration:underline;text-underline-offset:3px}.signout:hover{background:none;color:var(--text)}.signout:active{background:none;color:var(--accent)}time{font-variant-numeric:tabular-nums}.error{color:#f0bd77}small{font-size:.875rem}.reference{overflow-wrap:anywhere}
  @media(max-width:520px){main{width:calc(100% - 32px);margin:20px auto 40px}header{align-items:flex-start;gap:12px}.identity{max-width:58%;font-size:.8125rem}h1{font-size:1.5rem;margin-top:24px}.values{grid-template-columns:1fr;gap:12px}.notice{padding:16px}.actions{display:grid;grid-template-columns:1fr;width:100%}.actions button{width:100%}section{margin:24px 0}.reason{margin-bottom:24px}}
  @media(prefers-reduced-motion:reduce){button,.link-button{transition:none}}
  </style></head><body><main>${body}</main></body></html>`;
}

const header = (identity?: string) => `<header><div class="brand">Business OS</div>${identity ? `<div class="identity">${escape(identity)}</div>` : ""}</header>`;
const date = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? `<time datetime="${escape(value)}">${escape(new Date(value).toISOString().replace("T", " · ").slice(0, 21))} UTC</time>` : "Date not supplied";
const hidden = (name: string, value: unknown) => `<input type="hidden" name="${name}" value="${escape(value)}">`;

export function createCoachReviewHandlers(options: Options) {
  const publicUrl = new URL(options.publicUrl ?? process.env.PUBLIC_URL ?? "http://localhost:8080");
  const enabled = options.enabled ?? coachEnabled;
  const resolvePrincipal = options.resolvePrincipal ?? resolveCoachPrincipal;
  const verifyPassword = options.verifyPassword ?? verifyLogin;
  const secret = randomBytes(32);
  const secure = publicUrl.protocol === "https:";
  const sessionCookie = secure ? "__Host-coach-review" : "coach-review";
  const loginCookie = secure ? "__Host-coach-review-login" : "coach-review-login";
  const cookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
  const loginAttempts = new Map<string, { count: number; until: number }>();
  const mac = (value: unknown) => createHmac("sha256", secret).update(JSON.stringify(value)).digest("base64url");
  const readSession = options.readBrowserSession ?? (async (req: Request, res: Response) => {
    const savedId = cookie(req, sessionCookie);
    if (savedId && /^[A-Za-z0-9_-]{16,200}$/.test(savedId)) {
      const saved = await oidc.Session.find(savedId);
      if (saved?.accountId && saved.state?.coachReview === true) return saved;
    }
    // oidc-provider v8 Session.get takes a context-like object, not (req,res).
    // It reads and verifies the provider's signed cookies through its Koa app.
    const session = await oidc.Session.get({ req, res });
    return session?.accountId ? session : null;
  });
  const createSession = options.createBrowserSession ?? (async (id: string, res: Response) => {
    const session = new oidc.Session({ accountId: id, loginTs: Math.floor(Date.now() / 1000), state: { coachReview: true } });
    await session.save(30 * 60);
    res.cookie(sessionCookie, session.id, { ...cookieOptions, maxAge: 30 * 60 * 1000 });
    return session;
  });
  const endSession = options.endBrowserSession ?? (async (req: Request, res: Response) => {
    const savedId = cookie(req, sessionCookie);
    if (savedId && /^[A-Za-z0-9_-]{16,200}$/.test(savedId)) {
      const saved = await oidc.Session.find(savedId);
      if (saved?.state?.coachReview === true) await saved.destroy();
    }
    const providerSession = await oidc.Session.get({ req, res });
    if (providerSession?.accountId) await providerSession.destroy();
  });
  const path = (req: Request) => `/coach/review/${req.params.contextKey}/${req.params.id}`;
  const guards = (req: Request, res: Response, post = false) => {
    res.set({ "Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "same-origin", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    if (!enabled() || !safeId(req.params.contextKey) || !safeId(req.params.id)) throw fail(404, "This review link is unavailable.");
    if (req.headers.authorization) throw fail(403, "Open this link in your browser and sign in to review the change.");
    if (post && (req.headers.origin !== publicUrl.origin || req.headers["sec-fetch-site"] === "cross-site" || !req.is("application/x-www-form-urlencoded"))) throw fail(403, "Your browser could not verify this request. Reload the review page and try again.");
  };
  const identity = async (req: Request, res: Response) => {
    const session = await readSession(req, res);
    if (!session) return null;
    const principal = await resolvePrincipal(session.accountId);
    if (!principal || principal.contextKey !== req.params.contextKey) throw fail(403, "This account does not have access to this coach context.");
    return { session, principal };
  };
  const formToken = (req: Request, session: BrowserSession, principal: CoachPrincipal, digest: string, expires: number) => mac([session.id, principal, path(req), digest, expires]);
  const loginPage = (req: Request, res: Response, message?: string) => {
    const nonce = randomBytes(32).toString("base64url");
    res.cookie(loginCookie, nonce, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
    return shell("Sign in to review", `${header()}<div class="login"><h1>Sign in to review</h1><p class="account">Use your Business OS account to review this CRM change.</p>${message ? `<p role="alert" class="error">${escape(message)}</p>` : ""}<form method="post" action="${path(req)}/login">${hidden("csrf", nonce)}<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required><div class="actions"><button type="submit">Sign in and review</button></div></form><p class="footer">Signing in opens the proposal. You decide whether to apply or reject it on the next page.</p></div>`);
  };
  const problem = (req: Request, res: Response, error: unknown) => {
    const known = error as { status?: number; message?: string };
    const status = known.status ?? 503;
    if (status >= 500) console.error("Coach review failed", error instanceof Error ? error.name : "unknown");
    res.status(status).send(shell("Review unavailable", `${header()}<h1>${status === 409 ? "Review the latest proposal" : "Review unavailable"}</h1><p class="error" role="alert">${escape(known.status ? known.message : "The coach service is temporarily unavailable. Reload this page to try again.")}</p>${safeId(req.params.contextKey) && safeId(req.params.id) ? `<p><a href="${path(req)}">Reload review</a></p>` : ""}<p class="footer">This page has not approved a new change.</p>`));
  };
  const runtime = () => import(new URL("../../sales-coach/confirmation.mjs", import.meta.url).href);

  const get = async (req: Request, res: Response) => {
    try {
      guards(req, res);
      const auth = await identity(req, res);
      if (!auth) { res.send(loginPage(req, res)); return; }
      const { service } = await options.getActor(auth.principal);
      const { reviewProposal } = await runtime();
      const review = await service.serial(() => reviewProposal(service, req.params.id));
      const { change, sources, previous, digest } = review;
      const awaiting = change.state === "awaiting-confirmation";
      const isUpdate = change.reviewedSnapshot ? !!change.reviewedSnapshot.recordId : !!change.recordId;
      const targetName = (isUpdate ? recordName(previous?.record) : undefined) ?? recordName(change.values);
      const expires = Date.now() + 15 * 60 * 1000;
      const token = formToken(req, auth.session, auth.principal, digest, expires);
      const fields = hidden("csrf", token) + hidden("expires", expires) + hidden("digest", digest);
      const stateText: Record<string, [string, string]> = {
        "awaiting-confirmation": ["Your decision is needed", `${isUpdate ? "Applies" : "Creates a CRM record with"} the exact values below. ${change.highlyConsequential ? "The coach marked this as highly consequential." : "The coach marked the estimated cost of an error as high."}`],
        applied: ["Change applied", "The CRM accepted this change. You can return to your Claude conversation."],
        rejected: ["Change rejected", "This proposal will not be applied. You can return to Claude with any corrections."],
        blocked: ["Change could not be applied", "The CRM change is blocked. Return to Claude to resolve the issue; the status below shows what needs attention."],
        uncertain: ["Application needs verification", "The CRM result is not yet verified. Return to Claude to check its status before trying another change."],
        applying: ["Application in progress", "Reload this review to check whether the CRM accepted the change."],
        confirmed: ["Decision recorded", "Application of the change has not yet been verified. Return to Claude to check its status."],
        ready: ["Proposal ready", "This proposal does not require a human decision. Return to Claude to check its application status."],
      };
      const [stateTitle, stateDescription] = stateText[change.state] ?? ["Check proposal status", "Return to Claude to check the current proposal state."];
      const changes = Object.entries(change.values).map(([field, value]) => `<div class="change"><div class="field">${escape(fieldName(field))}</div><div class="values">${isUpdate ? `<div><div class="value-label">${change.reviewedSnapshot ? "CRM value at review" : "Last retained CRM value"}</div><pre class="value">${escape(scalar(previous?.record?.[field]))}</pre></div>` : ""}<div><div class="value-label">${change.state === "applied" ? "Applied value" : isUpdate ? "Proposed value" : "New value"}</div><pre class="value new-value">${escape(scalar(value))}</pre></div></div></div>`).join("");
      const evidence = sources.map((source: any, index: number) => `<details><summary>${escape(source.metadata?.filename ?? source.sourceKey ?? `Source ${index + 1}`)} <span>· ${source.representation === "transcription" ? "transcription" : "retained text"}</span></summary><p class="meta">Captured ${date(source.capturedAt)}${source.occurredAt ? `<br>Occurred ${date(source.occurredAt)}` : "<br>Event date not supplied"}</p><p class="source">${escape(source.text)}</p>${source.representation === "transcription" ? `<p class="meta">Extracted text from an original file; transcription may contain errors.</p>` : ""}</details>`).join("");
      res.send(shell(awaiting ? "Review CRM change" : stateTitle, `${header(auth.principal.id)}<h1>${awaiting ? "Review CRM change" : escape(stateTitle)}</h1><p class="account">${escape(review.accountTitle || change.accountId)}</p><div class="notice"><p class="status ${change.state === "applied" ? "success" : ""}">${escape(stateTitle)}</p><p>${escape(stateDescription)}</p>${change.error ? `<p class="error">${escape(change.error)}</p>` : ""}</div><section aria-labelledby="changes-title"><h2 id="changes-title">${isUpdate ? "Update" : "Create"} ${escape(change.object)}</h2>${targetName ? `<p class="record-name">${escape(targetName)}</p>` : `<p class="meta">Record name not retained</p>`}${isUpdate ? `<p class="meta reference">Record ${escape(change.recordId)}</p>` : ""}<div class="changes">${changes}</div>${isUpdate ? `<p class="meta" style="margin-top:12px">${previous ? `Last retained ${date(previous.lastVerifiedAt ?? previous.observedAt)}. ` : "No previous CRM value was retained. "}${awaiting ? "The CRM checks the record version before applying." : "Values shown are the snapshot used for this decision."}${previous?.available === false ? " Retained values are historical and may be out of date." : ""}</p>` : ""}</section><section aria-labelledby="reason-title"><h2 id="reason-title">Why this was proposed</h2><p class="reason">${escape(change.reason)}</p></section><section aria-labelledby="evidence-title"><h2 id="evidence-title">Supporting evidence <span class="muted">(${sources.length})</span></h2><p class="meta">Open a source to check the retained text behind this proposal.</p>${evidence || '<p class="error">No supporting evidence is available.</p>'}</section>${awaiting ? `<section aria-labelledby="decision-title"><h2 id="decision-title">Your decision</h2><p>Apply writes these values to the CRM. Reject keeps the proposal as a record of your decision.</p><form method="post" action="${path(req)}">${fields}<div class="actions"><button name="decision" value="approve" type="submit">Apply change</button><button class="secondary" name="decision" value="reject" type="submit">Reject change</button></div></form></section>` : `<p><a href="${path(req)}">Refresh status</a></p>`}<footer class="footer"><p>Proposed by ${escape(change.proposedBy?.id ?? "the coach")}<br>${date(change.proposedAt)}</p><form method="post" action="${path(req)}/logout">${fields}<button class="signout" type="submit">Sign out</button></form></footer>`));
    } catch (error) { problem(req, res, error); }
  };

  const authenticatedPost = async (req: Request, res: Response) => {
    guards(req, res, true);
    const auth = await identity(req, res);
    if (!auth) throw fail(401, "Your sign-in expired. Reload this review and sign in again.");
    const expires = Number(req.body?.expires);
    const digest = req.body?.digest;
    if (!Number.isFinite(expires) || expires < Date.now() || expires > Date.now() + 16 * 60 * 1000 || typeof digest !== "string" || !equal(req.body?.csrf, formToken(req, auth.session, auth.principal, digest, expires))) throw fail(403, "This review form expired or could not be verified. Reload the proposal before deciding.");
    return auth;
  };
  const post = async (req: Request, res: Response) => {
    try {
      const auth = await authenticatedPost(req, res);
      const { service } = await options.getActor(auth.principal);
      const { decideProposal } = await runtime();
      await service.serial(async () => {
        // Recheck grants after waiting for any preceding context operation.
        const current = await resolvePrincipal(auth.session.accountId);
        if (!current || JSON.stringify(current) !== JSON.stringify(auth.principal)) throw fail(403, "Your access changed. Reload this review.");
        await decideProposal(service, { id: req.params.id, digest: req.body.digest, decision: req.body.decision });
      });
      res.redirect(303, path(req));
    } catch (error) { problem(req, res, error); }
  };
  const login = async (req: Request, res: Response) => {
    try {
      guards(req, res, true);
      const nonce = cookie(req, loginCookie);
      if (!nonce || !/^[A-Za-z0-9_-]{43}$/.test(nonce) || !equal(nonce, req.body?.csrf)) throw fail(403, "This sign-in form expired. Reload the review link and sign in again.");
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const key = `${req.ip}:${email}`;
      for (const [entry, attempt] of loginAttempts) if (attempt.until < Date.now()) loginAttempts.delete(entry);
      const attempt = loginAttempts.get(key) ?? { count: 0, until: Date.now() + 10 * 60 * 1000 };
      if (attempt.count >= 8) throw fail(429, "Too many sign-in attempts. Wait ten minutes, then reload this review.");
      attempt.count++;
      loginAttempts.set(key, attempt);
      if (!email || email.length > 254 || !password || password.length > 1024 || !(await verifyPassword(email, password))) { res.status(401).send(loginPage(req, res, "Email or password was not recognized. Try again.")); return; }
      const principal = await resolvePrincipal(email);
      if (!principal || principal.contextKey !== req.params.contextKey) throw fail(403, "This account does not have access to this coach context.");
      loginAttempts.delete(key);
      await createSession(email, res);
      res.clearCookie(loginCookie, cookieOptions);
      res.redirect(303, path(req));
    } catch (error) { problem(req, res, error); }
  };
  const logout = async (req: Request, res: Response) => {
    try {
      await authenticatedPost(req, res);
      await endSession(req, res);
      res.clearCookie(sessionCookie, cookieOptions);
      res.redirect(303, path(req));
    } catch (error) { problem(req, res, error); }
  };
  return { get, post, login, logout };
}
