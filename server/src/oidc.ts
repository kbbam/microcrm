import Provider, { errors as oidcErrors } from "oidc-provider";
import type { Request, Response } from "express";
import { verifyLogin } from "./users.js";
import { authPage as page, authHeaders, escapeHtml } from "./auth-page.js";
import { PgAdapter } from "./pg-adapter.js";

const ISSUER = process.env.PUBLIC_URL ?? "http://localhost:8080";
const MCP_RESOURCE = `${ISSUER}/mcp`;
export const COACH_RESOURCE = `${ISSUER}/coach/mcp`;
export const coachEnabled = () => process.env.COACH_ENABLED === "1";

// oidc-provider's documented public-web-client refresh policy, narrowed to a
// resource and scope that the human has already consented to. MCP clients may
// omit prompt=consent, which causes offline_access to be stripped by OIDC.
export async function shouldIssueRefreshToken(ctx: any, client: any, code: any): Promise<boolean> {
  if (!client.grantTypeAllowed("refresh_token")) return false;
  if (code.scopes.has("offline_access")) return true;
  if (client.clientAuthMethod !== "none" || client.applicationType !== "web") return false;
  const grant = ctx.oidc.entities.Grant;
  if (!grant) return false;
  const resources = Array.isArray(code.resource) ? code.resource : [code.resource];
  return resources.some((resource: string) => {
    const scope = resource === MCP_RESOURCE ? "mcp" : coachEnabled() && resource === COACH_RESOURCE ? "coach" : null;
    return scope !== null && code.scopes.has(scope) && grant.getResourceScopeFiltered(resource, code.scopes).split(" ").includes(scope);
  });
}


export const oidc = new Provider(ISSUER, {
  // Persist sessions/grants/tokens/dynamically-registered clients in
  // Postgres, not oidc-provider's default in-memory store -- otherwise every
  // restart (a deploy, a crash, Railway recycling the container) silently
  // logs everyone out and they'd need to notice and reconnect mid-task.
  adapter: PgAdapter,
  // We don't pre-register clients: Claude (and any other MCP client) registers
  // itself via RFC 7591 dynamic client registration, the standard remote-MCP
  // connector flow.
  clients: [],
  clientDefaults: {
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  },
  features: {
    registration: { enabled: true, initialAccessToken: false },
    devInteractions: { enabled: false },
    revocation: { enabled: true },
    // Required for MCP clients: they send a `resource` parameter (RFC 8707)
    // on the authorize request identifying this connector's MCP endpoint,
    // and without this enabled oidc-provider rejects it outright with
    // invalid_target -- before the user ever sees a login page.
    resourceIndicators: {
      enabled: true,
      defaultResource: () => MCP_RESOURCE,
      getResourceServerInfo: (_ctx: unknown, resourceIndicator: string) => {
        if (resourceIndicator !== MCP_RESOURCE && !(coachEnabled() && resourceIndicator === COACH_RESOURCE)) {
          throw new (oidcErrors as any).InvalidTarget(
            `unknown resource indicator: ${resourceIndicator}`,
          );
        }
        return {
          scope: resourceIndicator === COACH_RESOURCE ? "coach" : "openid offline_access mcp",
          accessTokenFormat: "opaque",
        };
      },
    },
  },
  pkce: { required: () => true },
  issueRefreshToken: shouldIssueRefreshToken,
  scopes: ["openid", "offline_access", "mcp", "coach"],
  claims: { openid: ["sub"] },
  ttl: {
    AccessToken: 60 * 60 * 8, // 8h
    AuthorizationCode: 60,
    RefreshToken: 60 * 60 * 24 * 30,
  },
  cookies: {
    keys: [process.env.COOKIE_SECRET ?? "dev-only-insecure-secret"],
  },
  jwks: process.env.OIDC_JWKS ? JSON.parse(process.env.OIDC_JWKS) : undefined,
  findAccount(_ctx: unknown, id: string) {
    return {
      accountId: id,
      async claims() {
        return { sub: id, email: id };
      },
    };
  },
  interactions: {
    url(_ctx: unknown, interaction: { uid: string }) {
      return `/interaction/${interaction.uid}`;
    },
  },
});

// oidc-provider trusts X-Forwarded-* headers for issuer/URL construction;
// Railway terminates TLS in front of the service and forwards these.
oidc.proxy = true;

export function registerInteractionRoutes(
  get: (path: string, handler: (req: Request, res: Response) => void) => void,
  post: (path: string, handler: (req: Request, res: Response) => void) => void,
) {
  get("/interaction/:uid", async (req, res) => {
    authHeaders(res);
    let uid: string, prompt: { name: string }, params: Record<string, unknown>;
    try {
      ({ uid, prompt, params } = await oidc.interactionDetails(req, res));
    } catch (err) {
      res.status(400).send(page("Sign-in session expired", `<p>Return to Claude’s connector settings and connect again.</p><p><a href="/">Connection setup</a></p>`));
      return;
    }

    if (prompt.name === "login") {
      res.send(
        page("Sign in to Business OS", `
        <p class="muted">Continue connecting your sales coach to Claude.</p>
        <form method="post" action="/interaction/${escapeHtml(uid)}/login">
          <label for="email">Email</label>
          <input id="email" type="email" name="email" autocomplete="username" autocapitalize="none" maxlength="254" value="${escapeHtml(typeof req.query.email === "string" ? req.query.email : "")}" required autofocus>
          <label for="password">Password</label>
          <input id="password" type="password" name="password" autocomplete="current-password" required>
          <button type="submit">Sign in</button>
          ${req.query.error ? `<p class="error" role="alert">${escapeHtml(String(req.query.error))}</p>` : ""}
        </form><p class="footer"><a href="/account/help">Forgot your password?</a></p>`),
      );
      return;
    }

    if (prompt.name === "consent") {
      res.send(
        page("Connect this app?", `
        <p>Allow this app to use Business OS within your team’s account permissions.</p><p class="muted">Keep the connection signed in across conversations. You can disconnect it in Claude’s connector settings.</p>
        <form method="post" action="/interaction/${escapeHtml(uid)}/consent">
          <p class="muted client">App ID: ${escapeHtml(String(params.client_id))}</p>
          <button type="submit">Allow connection</button>
        </form><form method="post" action="/interaction/${escapeHtml(uid)}/cancel"><button class="secondary" type="submit">Cancel</button></form>`),
      );
      return;
    }

    res.status(400).send(page("Connection could not continue", `<p>Return to Claude’s connector settings and connect again.</p><p><a href="/">Connection setup</a></p>`));
  });

  post("/interaction/:uid/login", async (req, res) => {
    authHeaders(res);
    try {
      await oidc.interactionDetails(req, res);
      const { email, password } = req.body as { email?: string; password?: string };
      if (typeof email !== "string" || typeof password !== "string" || !email || !password || !(await verifyLogin(email, password))) {
        res.redirect(
          `/interaction/${req.params.uid}?error=${encodeURIComponent("Invalid email or password.")}&email=${encodeURIComponent(typeof email === "string" ? email.slice(0, 254) : "")}`,
        );
        return;
      }

      const result = { login: { accountId: email.trim().toLowerCase() } };
      await oidc.interactionFinished(req, res, result, {
        mergeWithLastSubmission: false,
      });
    } catch (err) {
      res.status(400).send(page("Sign-in session expired", `<p>Return to Claude’s connector settings and connect again.</p><p><a href="/">Connection setup</a></p>`));
    }
  });

  post("/interaction/:uid/cancel", async (req, res) => {
    authHeaders(res);
    try {
      await oidc.interactionDetails(req, res);
      await oidc.interactionFinished(req, res, { error: "access_denied", error_description: "Connection cancelled by the user." }, { mergeWithLastSubmission: false });
    } catch {
      res.status(400).send(page("Sign-in session expired", `<p>Return to Claude’s connector settings and connect again.</p>`));
    }
  });

  post("/interaction/:uid/consent", async (req, res) => {
    authHeaders(res);
    try {
      const interaction = await oidc.interactionDetails(req, res);
      const { session, params, grantId, prompt } = interaction;

      const grant = grantId
        ? await oidc.Grant.find(grantId)
        : new oidc.Grant({
            accountId: session!.accountId,
            clientId: params.client_id as string,
          });

      grant!.addOIDCScope(String(params.scope ?? "openid"));

      // With resourceIndicators enabled, granting the OIDC scope alone isn't
      // enough -- oidc-provider also tracks per-resource consent separately
      // and re-prompts (a second "consent" interaction, indistinguishable in
      // the UI from the first) until each requested resource's scopes are
      // granted too.
      const missingResourceScopes = (prompt.details as any)?.missingResourceScopes as
        | Record<string, string[]>
        | undefined;
      if (missingResourceScopes) {
        for (const [resource, scopes] of Object.entries(missingResourceScopes)) {
          grant!.addResourceScope(resource, scopes.join(" "));
        }
      }

      const finalGrantId = await grant!.save();

      await oidc.interactionFinished(
        req,
        res,
        { consent: { grantId: finalGrantId } },
        { mergeWithLastSubmission: true },
      );
    } catch (err) {
      res.status(400).send(page("Sign-in session expired", `<p>Return to Claude’s connector settings and connect again.</p><p><a href="/">Connection setup</a></p>`));
    }
  });
}

// RFC 9728: any unauthenticated (or invalid-token) request to the resource
// must point the client back at this resource's protected-resource metadata
// so it can (re-)discover the authorization server -- this is the header a
// well-behaved MCP client actually relies on, the .well-known paths are the
// fallback a client may check instead of or in addition to this.
function setWwwAuthenticate(res: Response, metadataPath = "/mcp") {
  const base = process.env.PUBLIC_URL ?? "http://localhost:8080";
  res.set(
    "WWW-Authenticate",
    `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource${metadataPath}"`,
  );
}

export function accessTokenGuard(resource: string, scope: string, metadataPath: string, findToken = (token: string) => oidc.AccessToken.find(token)) {
return async function (
  req: Request,
  res: Response,
  next: () => void,
) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    setWwwAuthenticate(res, metadataPath);
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  const token = auth.slice(7);
  try {
    const accessToken = await findToken(token);
    if (!accessToken) {
      setWwwAuthenticate(res, metadataPath);
      res.status(401).json({ error: "invalid or expired token" });
      return;
    }
    // An opaque token issued by this provider is not automatically valid for
    // every protected resource. Require both the MCP audience/resource and
    // the scope granted for it before allowing CRM reads or writes.
    if (
      !(Array.isArray(accessToken.aud) ? accessToken.aud.includes(resource) : accessToken.aud === resource) ||
      !accessToken.scopes.has(scope)
    ) {
      setWwwAuthenticate(res, metadataPath);
      res.status(403).json({ error: "token is not authorized for this resource" });
      return;
    }
    // Pass the authenticated account into the MCP handlers so every CRM
    // activity can be attributed to the colleague who captured it.
    res.locals.accountId = accessToken.accountId;
    next();
  } catch {
    setWwwAuthenticate(res, metadataPath);
    res.status(401).json({ error: "invalid token" });
  }
};
}

export const requireAccessToken = accessTokenGuard(MCP_RESOURCE, "mcp", "/mcp");
export const requireCoachAccessToken = accessTokenGuard(COACH_RESOURCE, "coach", "/coach/mcp");
