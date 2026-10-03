import type { Request, Response } from "express";
import { pool } from "./db.js";
import { coachEnabled } from "./oidc.js";

export interface CoachPrincipal {
  id: string;
  role: "executive" | "leader" | "admin";
  contextKey: string;
}

export const coachSafeLogPath = (path: string) => path.startsWith("/coach/evidence/upload/") ? "/coach/evidence/upload/[redacted]" : path.startsWith("/coach/evidence/download/") ? "/coach/evidence/download/[redacted]" : path;

// Resolve on every request so disablement and role changes take effect without
// replacing OAuth tokens. Caller-supplied role/context fields confer no access.
export async function resolveCoachPrincipal(accountId: unknown, query = pool.query.bind(pool)): Promise<CoachPrincipal | null> {
  if (typeof accountId !== "string" || !accountId.trim()) return null;
  const id = accountId.trim().toLowerCase();
  const { rows } = await query(
    `SELECT a.role, a.context_key FROM coach_access a JOIN users u ON u.email = a.email
     WHERE a.email = $1 AND a.enabled = TRUE AND u.status = 'active'`, [id],
  );
  const access = rows[0];
  if (!access || !["executive", "leader", "admin"].includes(access.role) || !/^[a-zA-Z0-9_-]{1,128}$/.test(access.context_key)) return null;
  return { id, role: access.role, contextKey: access.context_key };
}

async function handlePrincipalRequest(req: Request, res: Response, exportName: "handle" | "handleEvidence") {
  if (!coachEnabled()) { res.status(404).json({ error: "not found" }); return; }
  try {
    const principal = await resolveCoachPrincipal(res.locals.accountId);
    if (!principal) { res.status(403).json({ error: "Coach access has not been granted" }); return; }
    const moduleUrl = new URL("../../sales-coach/hosted.mjs", import.meta.url).href;
    const runtime = await import(moduleUrl);
    runtime.setPrincipalResolver(resolveCoachPrincipal);
    await runtime[exportName](req, res, principal);
  } catch (error) {
    console.error("Coach request failed", error instanceof Error ? error.name : "unknown");
    if (!res.headersSent) res.status(503).json({ error: "Coach service unavailable; retry later" });
  }
}

export const handleCoachRequest = (req: Request, res: Response) => handlePrincipalRequest(req, res, "handle");
export const handleCoachEvidence = (req: Request, res: Response) => handlePrincipalRequest(req, res, "handleEvidence");

// Upload uses a narrowly scoped, short-lived, single-use capability issued by
// the authenticated coach service. Raw body must reach that service unchanged.
export async function handleCoachUpload(req: Request, res: Response) {
  if (!coachEnabled()) { res.status(404).json({ error: "not found" }); return; }
  try {
    const runtime = await import(new URL("../../sales-coach/hosted.mjs", import.meta.url).href);
    runtime.setPrincipalResolver(resolveCoachPrincipal);
    await runtime.handleUpload(req, res);
  } catch (error) {
    console.error("Coach upload failed", error instanceof Error ? error.name : "unknown");
    if (!res.headersSent) res.status(503).json({ error: "Evidence upload unavailable; retry later" });
  }
}

export async function handleCoachDownload(req: Request, res: Response) {
  if (!coachEnabled()) { res.status(404).json({ error: "not found" }); return; }
  try {
    const runtime = await import(new URL("../../sales-coach/hosted.mjs", import.meta.url).href);
    runtime.setPrincipalResolver(resolveCoachPrincipal);
    await runtime.handleDownload(req, res);
  } catch {
    if (!res.headersSent) res.status(503).json({ error: "Original download unavailable; retry later" });
  }
}
