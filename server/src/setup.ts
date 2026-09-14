import type { Request, Response } from "express";
import { consumeInvite } from "./users.js";

function page(body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Set up your microcrm account</title>
<style>
  body{font-family:-apple-system,Helvetica,Arial,sans-serif;background:#14170f;color:#e9ece5;
       display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  form,.card{background:#1b1f18;border:1px solid #31362b;border-radius:10px;padding:28px;width:340px}
  h1{font-size:1.1rem;margin:0 0 16px}
  label{display:block;font-size:.8rem;color:#8b9184;margin:12px 0 4px}
  input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:7px;border:1px solid #31362b;
        background:#20241c;color:#e9ece5;font-size:.9rem}
  button{margin-top:18px;width:100%;padding:10px;border-radius:7px;border:none;background:#7fc99a;
         color:#14170f;font-weight:600;cursor:pointer}
  .err{color:#e0ab5f;font-size:.82rem;margin-top:10px}
  .ok{color:#7fc99a}
</style></head><body>${body}</body></html>`;
}

export function setupGet(req: Request, res: Response) {
  const token = String(req.query.token ?? "");
  res.send(
    page(`
    <form method="post" action="/setup">
      <h1>Set your microcrm password</h1>
      <input type="hidden" name="token" value="${token}">
      <label>New password</label>
      <input type="password" name="password" minlength="8" required autofocus>
      <button type="submit">Set password</button>
      ${req.query.error ? `<div class="err">${req.query.error}</div>` : ""}
    </form>`),
  );
}

export async function setupPost(req: Request, res: Response) {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) {
    res.redirect("/setup?error=Missing+token+or+password.");
    return;
  }
  const result = await consumeInvite(token, password);
  if (!result.ok) {
    res.redirect(`/setup?token=${encodeURIComponent(token)}&error=${encodeURIComponent(result.error)}`);
    return;
  }
  res.send(
    page(`<div class="card"><h1 class="ok">Password set</h1>
      <p>You can now sign in as <b>${result.email}</b> from your Claude connector.</p></div>`),
  );
}
