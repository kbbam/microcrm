import type { Request, Response } from "express";
import { consumeInvite, inspectInvite } from "./users.js";
import { authPage, authHeaders, escapeHtml } from "./auth-page.js";

type InviteState = Awaited<ReturnType<typeof inspectInvite>>;
export function createSetupHandlers(dependencies = { consumeInvite, inspectInvite }) {
  const invalidPage = (res: Response, reason: string) => res.status(400).send(authPage("Setup link unavailable", `<p>${escapeHtml(reason)}</p><p>Ask your team administrator for a new personal setup link.</p><p><a href="/account/help">Account help</a></p>`));
  const renderForm = (res: Response, token: string, invite: InviteState, error = "") => {
    if (!invite.ok) return invalidPage(res, invite.error);
    return res.send(authPage("Set your Business OS password", `<p class="muted">Set up access for <strong>${escapeHtml(invite.email)}</strong>.</p><form method="post" action="/setup"><input type="hidden" name="token" value="${escapeHtml(token)}"><label for="password">New password</label><input id="password" type="password" name="password" autocomplete="new-password" minlength="8" required autofocus aria-describedby="password-hint"><p class="hint" id="password-hint">Use at least 8 characters. A password manager is recommended.</p><label for="confirmation">Confirm password</label><input id="confirmation" type="password" name="confirmation" autocomplete="new-password" minlength="8" required><button type="submit">Set password</button>${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}</form>`));
  };
  return {
    async get(req: Request, res: Response) {
      authHeaders(res);
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!token) return invalidPage(res, "This page needs your personal setup link.");
      try { return renderForm(res, token, await dependencies.inspectInvite(token)); }
      catch { return res.status(503).send(authPage("Account setup is unavailable", `<p>Your password has not been changed. Try your setup link again in a few minutes.</p>`)); }
    },
    async post(req: Request, res: Response) {
      authHeaders(res);
      const { token, password, confirmation } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof token !== "string" || !token) return invalidPage(res, "This page needs your personal setup link.");
      try {
        if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72 || password !== confirmation) {
          const error = typeof password === "string" && Buffer.byteLength(password, "utf8") > 72 ? "Use a password of at most 72 UTF-8 bytes." : typeof password !== "string" || password.length < 8 ? "Use a password of at least 8 characters." : "The passwords do not match. Enter them again.";
          res.status(400);
          return renderForm(res, token, await dependencies.inspectInvite(token), error);
        }
        const result = await dependencies.consumeInvite(token, password);
        if (!result.ok) return invalidPage(res, result.error);
        return res.send(authPage("Password set", `<p>You can now sign in as <strong>${escapeHtml(result.email)}</strong>.</p><p class="muted">Return to Claude to connect Business OS with your new password. Any earlier sign-in sessions have ended.</p><a class="primary" href="/">Connection setup</a>`));
      } catch { return res.status(503).send(authPage("Account setup is unavailable", `<p>We could not finish setting your password. Try your setup link again in a few minutes. If it reports that it has been used, sign in with the password you just chose.</p>`)); }
    },
  };
}

const handlers = createSetupHandlers();
export const setupGet = handlers.get;
export const setupPost = handlers.post;
