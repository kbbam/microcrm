import type { Request, Response } from "express";
import { createInvite } from "./users.js";

export function requireAdmin(req: Request, res: Response, next: () => void) {
  const auth = req.headers.authorization;
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || auth !== `Bearer ${expected}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

export async function createInviteHandler(req: Request, res: Response) {
  const { email } = req.body as { email?: string };
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "valid email required" });
    return;
  }
  const token = await createInvite(email);
  const base = process.env.PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;
  res.json({ email, setup_url: `${base}/setup?token=${token}` });
}
