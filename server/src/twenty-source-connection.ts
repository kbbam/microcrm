import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import express from "express";
import { readFile, open, rename, unlink } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import type { CoachPrincipal } from "./coach.js";

export type TwentyExpectedIdentity = { email: string; workspaceId: string; memberId: string };
export type TwentySourceChannel = { id: string; handle: string; connectedAccountId: string; isSyncEnabled: boolean; syncedAt: string | null; syncStatus: string; syncStage: string };
export type TwentySourceReceipt = TwentyExpectedIdentity & {
  verifiedAt: string; userWorkspaceId: string;
  connectedAccounts: { id: string; handle: string; provider: string; authFailed: boolean }[];
  messageChannels: TwentySourceChannel[]; calendarChannels: TwentySourceChannel[];
  messageChannelIds: string[]; calendarChannelIds: string[];
};
export type TwentySourceView = { kind: "login" | "status" | "problem"; email?: string; csrf?: string; error?: string; message?: string; receipt?: TwentySourceReceipt | null; twentyUrl: string };
type Session = { id: string; accountId: string };
type Options = {
  publicUrl: string; twentyBaseUrl: string; clientId: string;
  readBrowserSession(req: Request, res: Response): Promise<Session | null>;
  createBrowserSession(id: string, res: Response): Promise<Session>;
  resolvePrincipal(id: unknown): Promise<CoachPrincipal | null>;
  verifyPassword(email: string, password: string): Promise<boolean>;
  expectedIdentity(principal: CoachPrincipal): Promise<TwentyExpectedIdentity | null>;
  saveReceipt(principal: CoachPrincipal, receipt: TwentySourceReceipt): Promise<void>;
  saveAuthorization?(principal: CoachPrincipal, receipt: TwentySourceReceipt, tokens: { access_token: string; refresh_token: string; token_type: string; expires_in: number }): Promise<void>;
  readReceipt(principal: CoachPrincipal): Promise<TwentySourceReceipt | null>;
  render(view: TwentySourceView): string;
  fetch?: typeof fetch; now?: () => number;
};
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const email = (v: unknown) => typeof v === "string" ? v.trim().toLowerCase() : "";
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const value = (v: unknown) => typeof v === "string" ? v : "";
const cookie = (req: Request, name: string) => req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);

// This read uses a freshly user-authorized token, never the workspace API key.
// The my* resolvers require a userWorkspace-bound principal in Twenty.
export const TWENTY_SOURCE_QUERY = `query CoachSourceOwnership {
  currentUser { id email disabled workspaceMember { id userEmail userWorkspaceId } currentWorkspace { id } currentUserWorkspace { id } }
  myConnectedAccounts { id handle provider userWorkspaceId archivedAt authFailedAt }
  myMessageChannels { id handle connectedAccountId isSyncEnabled syncedAt syncStatus syncStage }
  myCalendarChannels { id handle connectedAccountId isSyncEnabled syncedAt syncStatus syncStage }
}`;

export function verifyTwentySourceReceipt(data: any, expected: TwentyExpectedIdentity, verifiedAt: string): TwentySourceReceipt {
  const user = data?.currentUser;
  const userWorkspaceId = user?.currentUserWorkspace?.id;
  if (!user || user.disabled || email(user.email) !== email(expected.email) || email(user.workspaceMember?.userEmail) !== email(expected.email) || user.currentWorkspace?.id !== expected.workspaceId || user.workspaceMember?.id !== expected.memberId || !uuid(userWorkspaceId) || user.workspaceMember?.userWorkspaceId !== userWorkspaceId) {
    throw fail(403, `The Twenty account does not match your authorized Business OS account. Sign in to Twenty as ${expected.email} and try again.`);
  }
  if (![data.myConnectedAccounts, data.myMessageChannels, data.myCalendarChannels].every(Array.isArray)) throw fail(503, "Twenty did not return a complete source ownership response. Try again.");
  if (data.myConnectedAccounts.some((a: any) => !uuid(a.id) || !uuid(a.userWorkspaceId))) throw fail(403, "Twenty returned an unverified source account. No source access was granted.");
  // myConnectedAccounts includes accounts shared by other owners. Sharing does
  // not authorize this executive's own-source domain; exclude those accounts.
  const accounts = data.myConnectedAccounts.filter((a: any) => !a.archivedAt && a.userWorkspaceId === userWorkspaceId);
  const known = new Set(data.myConnectedAccounts.map((a: any) => a.id));
  const own = new Set(accounts.map((a: any) => a.id));
  const channels = (rows: any[]): TwentySourceChannel[] => rows.flatMap(c => {
    if (!uuid(c.id) || !uuid(c.connectedAccountId) || !known.has(c.connectedAccountId) || typeof c.isSyncEnabled !== "boolean" || typeof c.syncStatus !== "string" || typeof c.syncStage !== "string" || (c.syncedAt !== null && (typeof c.syncedAt !== "string" || Number.isNaN(Date.parse(c.syncedAt))))) throw fail(403, "Twenty returned an unverified source channel. No source access was granted.");
    return own.has(c.connectedAccountId) ? [{ id: c.id, handle: value(c.handle), connectedAccountId: c.connectedAccountId, isSyncEnabled: c.isSyncEnabled, syncedAt: c.syncedAt, syncStatus: c.syncStatus, syncStage: c.syncStage }] : [];
  });
  const messageChannels = channels(data.myMessageChannels);
  const calendarChannels = channels(data.myCalendarChannels);
  return { ...expected, email: email(expected.email), verifiedAt, userWorkspaceId,
    connectedAccounts: accounts.map((a: any) => ({ id: a.id, handle: value(a.handle), provider: value(a.provider), authFailed: !!a.authFailedAt })),
    messageChannels, calendarChannels,
    messageChannelIds: [...new Set(messageChannels.map(c => c.id))], calendarChannelIds: [...new Set(calendarChannels.map(c => c.id))],
  };
}

/** User-consented source bootstrap. Tokens stay in an encrypted server vault. */
export function createTwentySourceConnectionHandlers(options: Options) {
  const publicUrl = new URL(options.publicUrl);
  const twentyUrl = new URL(options.twentyBaseUrl);
  if (twentyUrl.protocol !== "https:" || twentyUrl.username || twentyUrl.password || twentyUrl.search || twentyUrl.hash || !["", "/"].includes(twentyUrl.pathname)) throw new Error("Twenty bootstrap requires a pinned HTTPS origin");
  if (!options.clientId || publicUrl.username || publicUrl.password || !["https:", "http:"].includes(publicUrl.protocol) || (publicUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(publicUrl.hostname))) throw new Error("Invalid source bootstrap configuration");
  const origin = twentyUrl.origin;
  const callback = `${publicUrl.origin}/account/twenty/callback`;
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const secure = publicUrl.protocol === "https:";
  const nonceCookie = secure ? "__Host-twenty-source-login" : "twenty-source-login";
  const cookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
  const pending = new Map<string, { sessionId: string; principal: CoachPrincipal; expected: TwentyExpectedIdentity; verifier: string; expires: number; tokenUrl: string; revokeUrl: string }>();
  const attempts = new Map<string, { count: number; until: number }>();
  const prune = () => { for (const [k, p] of pending) if (p.expires < now()) pending.delete(k); for (const [k, a] of attempts) if (a.until < now()) attempts.delete(k); };
  const headers = (res: Response) => res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
  const guards = (req: Request, res: Response, post = false) => {
    headers(res); prune();
    if (req.headers.authorization) throw fail(403, "Open this page in your browser and sign in to connect your own Twenty sources.");
    if (post && (req.headers.origin !== publicUrl.origin || req.headers["sec-fetch-site"] === "cross-site" || !req.is("application/x-www-form-urlencoded"))) throw fail(403, "This sign-in request could not be verified. Reload the page and try again.");
  };
  const identity = async (req: Request, res: Response) => {
    const session = await options.readBrowserSession(req, res);
    if (!session) return null;
    const principal = await options.resolvePrincipal(session.accountId);
    const expected = principal && await options.expectedIdentity(principal);
    if (!principal || !expected || email(principal.id) !== email(expected.email) || !uuid(expected.memberId) || !uuid(expected.workspaceId)) throw fail(403, "Your account is not configured for this source connection. Contact your team administrator.");
    return { session, principal, expected };
  };
  const page = (res: Response, view: Omit<TwentySourceView, "twentyUrl">) => res.send(options.render({ ...view, twentyUrl: origin }));
  const problem = (res: Response, error: unknown) => {
    const e = error as { status?: number; message?: string };
    headers(res);
    res.status(e.status ?? 503);
    page(res, { kind: "problem", error: e.status ? e.message : "The source connection is temporarily unavailable. Try again. No new source access was granted." });
  };
  const json = async (url: string, init: RequestInit = {}) => {
    const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json", "User-Agent": "BAM-Coach-Setup/1.0", ...init.headers } });
    if (!response.ok) throw fail(503, "Twenty could not complete source verification. Try again.");
    return response.json();
  };
  const endpoint = (url: unknown) => { const parsed = new URL(value(url)); if (parsed.origin !== origin || parsed.username || parsed.password || parsed.hash || parsed.search) throw fail(503, "Twenty authorization endpoints did not match the configured workspace."); return parsed.href; };
  const loginPage = (res: Response, loginEmail?: string, error?: string) => {
    const nonce = randomBytes(32).toString("base64url");
    res.cookie(nonceCookie, nonce, { ...cookieOptions, maxAge: 600_000 });
    page(res, { kind: "login", csrf: nonce, email: loginEmail, error });
  };
  const loginGet = async (req: Request, res: Response) => {
    try { guards(req, res); loginPage(res); } catch (e) { problem(res, e); }
  };
  const loginPost = async (req: Request, res: Response) => {
    try {
      guards(req, res, true);
      if (!same(cookie(req, nonceCookie), req.body?.csrf)) throw fail(403, "This sign-in form expired. Reload the page and try again.");
      const id = email(req.body?.email), password = value(req.body?.password);
      const keys = [`ip:${req.ip}`, `account:${req.ip}:${id}`];
      for (const key of keys) { const a = attempts.get(key) ?? { count: 0, until: now() + 600_000 }; if (a.count >= 8 || attempts.size > 2000) throw fail(429, "Too many sign-in attempts. Wait ten minutes and try again."); a.count++; attempts.set(key, a); }
      if (!id || id.length > 254 || !password || password.length > 1024 || !(await options.verifyPassword(id, password))) throw fail(401, "Email or password was not recognized. Try again.");
      const principal = await options.resolvePrincipal(id);
      const expected = principal && await options.expectedIdentity(principal);
      if (!principal || !expected || email(expected.email) !== id) throw fail(403, "Your account is not configured for this source connection.");
      await options.createBrowserSession(id, res);
      res.clearCookie(nonceCookie, cookieOptions); keys.forEach(k => attempts.delete(k));
      res.redirect(303, "/account/twenty/connect");
    } catch (e) {
      const error = e as { status?: number; message?: string };
      if (error.status === 401 || error.status === 429) { res.status(error.status); loginPage(res, email(req.body?.email), error.message); }
      else problem(res, e);
    }
  };
  const connect = async (req: Request, res: Response) => {
    try {
      guards(req, res); const auth = await identity(req, res);
      if (!auth) { res.redirect(303, "/account/twenty/login"); return; }
      if (pending.size >= 1000) throw fail(429, "Source setup is busy. Try again shortly.");
      const discovery = await json(`${origin}/.well-known/oauth-authorization-server`);
      if (discovery.issuer !== origin || !discovery.code_challenge_methods_supported?.includes("S256")) throw fail(503, "Twenty could not verify its authorization configuration.");
      const authorization = new URL(endpoint(discovery.authorization_endpoint));
      const tokenUrl = endpoint(discovery.token_endpoint), revokeUrl = endpoint(discovery.revocation_endpoint);
      const state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
      const params = { response_type: "code", client_id: options.clientId, redirect_uri: callback, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state, scope: "api profile", iss: origin };
      Object.entries(params).forEach(([k, v]) => authorization.searchParams.set(k, v));
      // A fresh attempt replaces earlier attempts for this session.
      for (const [key, p] of pending) if (p.sessionId === auth.session.id) pending.delete(key);
      pending.set(state, { sessionId: auth.session.id, principal: auth.principal, expected: auth.expected, verifier, expires: now() + 600_000, tokenUrl, revokeUrl });
      res.redirect(303, authorization.href);
    } catch (e) { problem(res, e); }
  };
  const callbackGet = async (req: Request, res: Response) => {
    let tokens: any, transaction: { revokeUrl: string } | undefined, retained = false;
    try {
      guards(req, res);
      const state = value(req.query.state), p = pending.get(state);
      if (!p) throw fail(403, "This source connection expired or was already used. Start the connection again.");
      const auth = await identity(req, res);
      if (!auth || auth.session.id !== p.sessionId || JSON.stringify(auth.principal) !== JSON.stringify(p.principal) || JSON.stringify(auth.expected) !== JSON.stringify(p.expected)) throw fail(403, "This source connection belongs to a different or expired sign-in. Start again.");
      pending.delete(state); transaction = p;
      if (req.query.error) throw fail(400, "The Twenty connection was not approved. Start again when you are ready.");
      if (req.query.iss !== origin || !value(req.query.code) || value(req.query.code).length > 2048) throw fail(403, "The Twenty authorization response could not be verified. Start again.");
      tokens = await json(p.tokenUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", code: req.query.code, code_verifier: p.verifier, redirect_uri: callback, client_id: options.clientId }) });
      if (!tokens.access_token || tokens.token_type?.toLowerCase() !== "bearer") throw fail(503, "Twenty did not return a usable source verification token.");
      const result = await json(`${origin}/metadata`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.access_token}` }, body: JSON.stringify({ query: TWENTY_SOURCE_QUERY }) });
      if (result.errors?.length) throw fail(503, "Twenty did not permit source ownership verification. No new source access was granted.");
      const receipt = verifyTwentySourceReceipt(result.data, p.expected, new Date(now()).toISOString());
      const current = await identity(req, res);
      if (!current || current.session.id !== p.sessionId || JSON.stringify(current.principal) !== JSON.stringify(p.principal) || JSON.stringify(current.expected) !== JSON.stringify(p.expected)) throw fail(403, "Your Business OS access changed during setup. No new source access was granted.");
      if (options.saveAuthorization) await options.saveAuthorization(current.principal, receipt, tokens);
      await options.saveReceipt(current.principal, receipt);
      retained = !!options.saveAuthorization;
      res.redirect(303, "/account/twenty/status");
    } catch (e) { problem(res, e); }
    finally {
      // Failed setup discards/revokes grants. Successful production setup keeps
      // encrypted refresh authorization for live own-channel checks.
      if (!retained && transaction && tokens) for (const token of [tokens.refresh_token, tokens.access_token].filter(Boolean)) {
        try { await json(transaction.revokeUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, client_id: options.clientId }) }); } catch { /* Never log tokens or provider response. */ }
      }
      tokens = undefined;
    }
  };
  const status = async (req: Request, res: Response) => {
    try { guards(req, res); const auth = await identity(req, res); if (!auth) { res.redirect(303, "/account/twenty/login"); return; } page(res, { kind: "status", email: auth.principal.id, receipt: await options.readReceipt(auth.principal) }); } catch (e) { problem(res, e); }
  };
  return { connect, callback: callbackGet, loginGet, loginPost, status };
}

// Trusted configuration writer: no path, role, member or channel IDs come from
// request parameters. File replacement is atomic, fsynced and private.
export function createTwentySourceConfigStore(configRoot: string, twentyBaseUrl: string, reload: (key: string) => Promise<void>) {
  const origin = new URL(twentyBaseUrl).origin;
  const path = (principal: CoachPrincipal) => {
    if (principal.role !== "executive" || !/^[A-Za-z0-9_-]{1,128}$/.test(principal.contextKey)) throw fail(403, "This account is not configured for executive source setup.");
    return join(resolve(configRoot), `${principal.contextKey}.json`);
  };
  const load = async (principal: CoachPrincipal) => {
    const config = JSON.parse(await readFile(path(principal), "utf8"));
    if (config.executiveId !== principal.id || config.twenty?.scopeMode !== "assigned" || new URL(config.twenty?.baseUrl).origin !== origin || email(config.sourceConnection?.expectedEmail) !== email(principal.id) || !uuid(config.sourceConnection?.verifiedWorkspaceId) || !uuid(config.twenty?.assignment?.memberId)) throw fail(403, "The trusted source connection policy does not match this executive.");
    return config;
  };
  const expected = (config: any): TwentyExpectedIdentity => ({ email: email(config.sourceConnection.expectedEmail), workspaceId: config.sourceConnection.verifiedWorkspaceId, memberId: config.twenty.assignment.memberId });
  const queues = new Map<string, Promise<void>>();
  return {
    expectedIdentity: async (principal: CoachPrincipal) => expected(await load(principal)),
    readReceipt: async (principal: CoachPrincipal): Promise<TwentySourceReceipt | null> => {
      const config = await load(principal), receipt = config.sourceConnection?.receipt;
      return receipt && receipt.email === expected(config).email && receipt.workspaceId === expected(config).workspaceId && receipt.memberId === expected(config).memberId ? receipt : null;
    },
    saveReceipt: async (principal: CoachPrincipal, receipt: TwentySourceReceipt) => {
      const key = principal.contextKey;
      const work = (queues.get(key) ?? Promise.resolve()).then(async () => {
        const config = await load(principal);
        if (JSON.stringify(expected(config)) !== JSON.stringify({ email: receipt.email, workspaceId: receipt.workspaceId, memberId: receipt.memberId })) throw fail(403, "The source connection policy changed. Start setup again.");
        const channels = [...receipt.messageChannels, ...receipt.calendarChannels];
        config.twenty.messageChannelIds = receipt.messageChannelIds;
        config.twenty.calendarChannelIds = receipt.calendarChannelIds;
        config.sourceConnection = { ...config.sourceConnection, status: !channels.length ? "no-connected-sources" : channels.some(c => !c.isSyncEnabled || !c.syncedAt) || receipt.connectedAccounts.some(a => a.authFailed) ? "awaiting-source-sync" : "source-sync-observed", receipt };
        const file = path(principal), temporary = `${file}.${randomBytes(12).toString("hex")}.tmp`;
        try {
          const handle = await open(temporary, "wx", 0o600);
          try { await handle.writeFile(JSON.stringify(config, null, 2) + "\n"); await handle.sync(); } finally { await handle.close(); }
          await rename(temporary, file);
          const directory = await open(dirname(file), "r"); try { await directory.sync(); } finally { await directory.close(); }
        } finally { await unlink(temporary).catch(() => {}); }
        try { await reload(key); } catch { throw fail(503, "Source ownership was saved, but the coach could not refresh its configuration. Recheck the connection before using these sources."); }
      });
      const settled = work.catch(() => {});
      queues.set(key, settled);
      try { await work; } finally { if (queues.get(key) === settled) queues.delete(key); }
    },
  };
}

export async function registerTwentySourceConnectionRoutes(app: express.Express) {
  if (process.env.COACH_ENABLED !== "1" || !process.env.TWENTY_SOURCE_CLIENT_ID || !process.env.TWENTY_SOURCE_BASE_URL || !process.env.COACH_CONFIG_ROOT) return;
  const [{ oidc }, { resolveCoachPrincipal }, { verifyLogin }, { renderTwentySourcePage }] = await Promise.all([import("./oidc.js"), import("./coach.js"), import("./users.js"), import("./twenty-source-views.js")]);
  const runtime = await import(new URL("../../sales-coach/hosted.mjs", import.meta.url).href);
  const publicUrl = process.env.PUBLIC_URL ?? "http://localhost:8080";
  const secure = new URL(publicUrl).protocol === "https:";
  const sessionCookie = secure ? "__Host-coach-review" : "coach-review";
  const store = createTwentySourceConfigStore(process.env.COACH_CONFIG_ROOT, process.env.TWENTY_SOURCE_BASE_URL, runtime.reloadContext);
  const { saveTwentySourceAuthorization } = await import(new URL("../../sales-coach/twenty-source-ownership.mjs", import.meta.url).href);
  const handlers = createTwentySourceConnectionHandlers({
    publicUrl, twentyBaseUrl: process.env.TWENTY_SOURCE_BASE_URL, clientId: process.env.TWENTY_SOURCE_CLIENT_ID,
    ...store, resolvePrincipal: resolveCoachPrincipal, verifyPassword: verifyLogin, render: renderTwentySourcePage,
    saveAuthorization: async (principal, receipt, tokens) => {
      const expected = await store.expectedIdentity(principal);
      await saveTwentySourceAuthorization({ file: join(resolve(process.env.COACH_CONFIG_ROOT!), `${principal.contextKey}.twenty-token.json`), baseUrl: new URL(process.env.TWENTY_SOURCE_BASE_URL!).origin, clientId: process.env.TWENTY_SOURCE_CLIENT_ID, encryptionKey: process.env.TWENTY_SOURCE_TOKEN_KEY, expected }, tokens);
    },
    readBrowserSession: async (req, res) => {
      const id = cookie(req, sessionCookie);
      if (id && /^[A-Za-z0-9_-]{16,200}$/.test(id)) { const session = await oidc.Session.find(id); if (session?.accountId && session.state?.coachReview === true) return session; }
      const session = await oidc.Session.get({ req, res }); return session?.accountId ? session : null;
    },
    createBrowserSession: async (id, res) => {
      const session = new oidc.Session({ accountId: id, loginTs: Math.floor(Date.now() / 1000), state: { coachReview: true } });
      await session.save(30 * 60);
      res.cookie(sessionCookie, session.id, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 30 * 60 * 1000 });
      return session;
    },
  });
  app.get("/account/twenty/connect", handlers.connect);
  app.get("/account/twenty/callback", handlers.callback);
  app.get("/account/twenty/login", handlers.loginGet);
  app.post("/account/twenty/login", express.urlencoded({ extended: false, limit: "16kb" }), handlers.loginPost);
  app.get("/account/twenty/status", handlers.status);
}
