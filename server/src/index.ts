import express from "express";
import { initSchema } from "./db.js";
import { oidc, registerInteractionRoutes, requireAccessToken } from "./oidc.js";
import { setupGet, setupPost } from "./setup.js";
import { requireAdmin, createInviteHandler } from "./admin.js";
import { handleMcpRequest } from "./mcp.js";

const PORT = Number(process.env.PORT ?? 8080);

// Last-resort safety net: log and keep running rather than let one bad
// request (or an oidc-provider internal edge case) take the whole process
// down for every other in-flight user.
process.on("unhandledRejection", (err) => console.error("unhandledRejection", err));
process.on("uncaughtException", (err) => console.error("uncaughtException", err));

async function main() {
  await initSchema();

  const app = express();
  app.set("trust proxy", true);

  // Minimal access log -- oidc-provider handles its own routes (/reg, /auth,
  // /token, /.well-known/*) internally and we don't otherwise see what
  // clients send them or what they got back, which matters a lot when a
  // connector's dynamic client registration fails for a reason only visible
  // at the wire level.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      console.log(`${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  // RFC 8414 / RFC 9728 discovery. oidc-provider only serves OIDC Discovery
  // (/.well-known/openid-configuration) out of the box, but MCP clients
  // (Claude included) look for the plain-OAuth paths instead: they fetch
  // oauth-protected-resource first to learn which authorization server(s)
  // protect this resource, then oauth-authorization-server for that server's
  // metadata (registration_endpoint included) -- and give up (guessing an
  // unqualified /register rather than ever finding our real /reg) when
  // either 404s, which is exactly what was happening before this.
  const issuer = process.env.PUBLIC_URL ?? "http://localhost:8080";
  const protectedResourceMetadata = {
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
  };
  app.get("/.well-known/oauth-protected-resource", (_req, res) =>
    res.json(protectedResourceMetadata),
  );
  app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) =>
    res.json(protectedResourceMetadata),
  );
  // Reuse oidc-provider's own discovery document rather than duplicating it:
  // rewrite the URL and fall through to oidc.callback() below.
  app.get("/.well-known/oauth-authorization-server", (req, _res, next) => {
    req.url = "/.well-known/openid-configuration";
    next();
  });

  // Body parsers scoped to only the routes that need them: express-level
  // parsing ahead of oidc.callback() below made oidc-provider warn about an
  // "already parsed request body" on every OAuth request (registration
  // included) and fall back to trusting req.body as-is -- since oidc-provider
  // parses its own routes' bodies natively and correctly, it's simpler and
  // more robust to just not put an upstream parser in front of it at all.
  const jsonBody = express.json();
  const urlencodedBody = express.urlencoded({ extended: false });

  // Invite acceptance (public, token-gated).
  app.get("/setup", setupGet);
  app.post("/setup", urlencodedBody, setupPost);

  // Admin: generate one-time invite links (static bearer secret).
  app.post("/admin/invites", jsonBody, requireAdmin, createInviteHandler);

  // MCP endpoint, gated behind an OAuth access token.
  app.post("/mcp", jsonBody, requireAccessToken, handleMcpRequest);

  // oidc-provider's own login/consent screens. Must be registered before
  // oidc.callback() below, since that middleware handles (and ends) every
  // request path it receives and never falls through to routes after it.
  registerInteractionRoutes(
    (path, handler) => app.get(path, handler),
    (path, handler) => app.post(path, urlencodedBody, handler),
  );

  // Everything else OAuth/OIDC-related: /.well-known/*, /auth, /token, /reg, ...
  // oidc-provider parses these requests' bodies itself -- no body-parser
  // middleware runs ahead of it here.
  app.use(oidc.callback());

  app.listen(PORT, () => {
    console.log(`microcrm-api listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
