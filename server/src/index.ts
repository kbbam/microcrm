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
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  // Invite acceptance (public, token-gated).
  app.get("/setup", setupGet);
  app.post("/setup", setupPost);

  // Admin: generate one-time invite links (static bearer secret).
  app.post("/admin/invites", requireAdmin, createInviteHandler);

  // MCP endpoint, gated behind an OAuth access token.
  app.post("/mcp", requireAccessToken, handleMcpRequest);

  // oidc-provider's own login/consent screens. Must be registered before
  // oidc.callback() below, since that middleware handles (and ends) every
  // request path it receives and never falls through to routes after it.
  registerInteractionRoutes(
    (path, handler) => app.get(path, handler),
    (path, handler) => app.post(path, handler),
  );

  // Everything else OAuth/OIDC-related: /.well-known/*, /auth, /token, /reg, ...
  app.use(oidc.callback());

  app.listen(PORT, () => {
    console.log(`microcrm-api listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
