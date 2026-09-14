import Provider, { errors as oidcErrors } from "oidc-provider";
import type { Request, Response } from "express";
import { verifyLogin } from "./users.js";

const ISSUER = process.env.PUBLIC_URL ?? "http://localhost:8080";
const MCP_RESOURCE = `${ISSUER}/mcp`;

export const oidc = new Provider(ISSUER, {
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
        if (resourceIndicator !== MCP_RESOURCE) {
          throw new (oidcErrors as any).InvalidTarget(
            `unknown resource indicator: ${resourceIndicator}`,
          );
        }
        return {
          scope: "openid offline_access mcp",
          accessTokenFormat: "opaque",
        };
      },
    },
  },
  pkce: { required: () => true },
  scopes: ["openid", "offline_access", "mcp"],
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]!);
}

function page(body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>microcrm login</title>
<style>
  body{font-family:-apple-system,Helvetica,Arial,sans-serif;background:#14170f;color:#e9ece5;
       display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  form{background:#1b1f18;border:1px solid #31362b;border-radius:10px;padding:28px;width:320px}
  h1{font-size:1.1rem;margin:0 0 16px}
  label{display:block;font-size:.8rem;color:#8b9184;margin:12px 0 4px}
  input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:7px;border:1px solid #31362b;
        background:#20241c;color:#e9ece5;font-size:.9rem}
  button{margin-top:18px;width:100%;padding:10px;border-radius:7px;border:none;background:#7fc99a;
         color:#14170f;font-weight:600;cursor:pointer}
  .err{color:#e0ab5f;font-size:.82rem;margin-top:10px}
</style></head><body>${body}</body></html>`;
}

export function registerInteractionRoutes(
  get: (path: string, handler: (req: Request, res: Response) => void) => void,
  post: (path: string, handler: (req: Request, res: Response) => void) => void,
) {
  get("/interaction/:uid", async (req, res) => {
    let uid: string, prompt: { name: string }, params: Record<string, unknown>;
    try {
      ({ uid, prompt, params } = await oidc.interactionDetails(req, res));
    } catch (err) {
      res.status(400).send(page(`<p>Sign-in session expired or invalid. Please restart the login.</p>`));
      return;
    }

    if (prompt.name === "login") {
      res.send(
        page(`
        <form method="post" action="/interaction/${uid}/login">
          <h1>Sign in to microcrm</h1>
          <label>Email</label>
          <input type="email" name="email" required autofocus>
          <label>Password</label>
          <input type="password" name="password" required>
          <button type="submit">Sign in</button>
          ${req.query.error ? `<div class="err">${escapeHtml(String(req.query.error))}</div>` : ""}
        </form>`),
      );
      return;
    }

    if (prompt.name === "consent") {
      res.send(
        page(`
        <form method="post" action="/interaction/${uid}/consent">
          <h1>Allow this app to access microcrm?</h1>
          <p style="color:#8b9184;font-size:.85rem">Client: ${escapeHtml(String(params.client_id))}</p>
          <button type="submit">Allow</button>
        </form>`),
      );
      return;
    }

    res.status(400).send(page(`<p>Unsupported interaction: ${escapeHtml(prompt.name)}</p>`));
  });

  post("/interaction/:uid/login", async (req, res) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password || !(await verifyLogin(email, password))) {
        res.redirect(
          `/interaction/${req.params.uid}?error=${encodeURIComponent("Invalid email or password.")}`,
        );
        return;
      }

      const result = { login: { accountId: email.trim().toLowerCase() } };
      await oidc.interactionFinished(req, res, result, {
        mergeWithLastSubmission: false,
      });
    } catch (err) {
      res.status(400).send(page(`<p>Sign-in session expired or invalid. Please restart the login.</p>`));
    }
  });

  post("/interaction/:uid/consent", async (req, res) => {
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
      res.status(400).send(page(`<p>Sign-in session expired or invalid. Please restart the login.</p>`));
    }
  });
}

// RFC 9728: any unauthenticated (or invalid-token) request to the resource
// must point the client back at this resource's protected-resource metadata
// so it can (re-)discover the authorization server -- this is the header a
// well-behaved MCP client actually relies on, the .well-known paths are the
// fallback a client may check instead of or in addition to this.
function setWwwAuthenticate(res: Response) {
  const base = process.env.PUBLIC_URL ?? "http://localhost:8080";
  res.set(
    "WWW-Authenticate",
    `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
  );
}

export async function requireAccessToken(
  req: Request,
  res: Response,
  next: () => void,
) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    setWwwAuthenticate(res);
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  const token = auth.slice(7);
  try {
    const accessToken = await oidc.AccessToken.find(token);
    if (!accessToken) {
      setWwwAuthenticate(res);
      res.status(401).json({ error: "invalid or expired token" });
      return;
    }
    next();
  } catch {
    setWwwAuthenticate(res);
    res.status(401).json({ error: "invalid token" });
  }
}
