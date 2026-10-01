import assert from "node:assert/strict";
import { test } from "node:test";
import { accessTokenGuard, COACH_RESOURCE } from "../dist/oidc.js";
import { resolveCoachPrincipal, coachSafeLogPath } from "../dist/coach.js";

function response() {
  return { locals: {}, headers: {}, set(name, value) { this.headers[name] = value; }, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
}

test("upload logs redact both context and secret capability", () => {
  assert.equal(coachSafeLogPath("/coach/evidence/upload/pilot_a/secret-token"), "/coach/evidence/upload/[redacted]");
  assert.equal(coachSafeLogPath("/coach/evidence/download/pilot_a/secret-token"), "/coach/evidence/download/[redacted]");
  assert.equal(coachSafeLogPath("/mcp"), "/mcp");
});

test("a valid existing CRM token cannot authorize the coach resource", async () => {
  const res = response();
  let nextCalled = false;
  const guard = accessTokenGuard(COACH_RESOURCE, "coach", "/coach/mcp", async () => ({
    accountId: "executive@example.com", aud: "http://localhost:8080/mcp", scopes: new Set(["mcp"]),
  }));
  await guard({ headers: { authorization: "Bearer synthetic" } }, res, () => { nextCalled = true; });
  assert.equal(res.code, 403);
  assert.equal(nextCalled, false);
  assert.match(res.headers["WWW-Authenticate"], /oauth-protected-resource\/coach\/mcp/);
});

test("coach scope and resource are independently required", async () => {
  for (const grant of [
    { aud: COACH_RESOURCE, scopes: new Set(["mcp"]) },
    { aud: "http://localhost:8080/mcp", scopes: new Set(["coach"]) },
    { aud: undefined, resourceIndicators: new Set([COACH_RESOURCE]), scopes: new Set(["coach"]) },
  ]) {
    const res = response();
    await accessTokenGuard(COACH_RESOURCE, "coach", "/coach/mcp", async () => ({ ...grant, accountId: "executive@example.com" }))(
      { headers: { authorization: "Bearer synthetic" } }, res, () => assert.fail("must reject"),
    );
    assert.equal(res.code, 403);
  }
});

test("authorized token supplies authenticated principal without caller role", async () => {
  const res = response(); let called = false;
  await accessTokenGuard(COACH_RESOURCE, "coach", "/coach/mcp", async () => ({
    accountId: "executive@example.com", aud: COACH_RESOURCE, scopes: new Set(["coach"]),
  }))({ headers: { authorization: "Bearer synthetic" }, body: { role: "admin" } }, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.locals.accountId, "executive@example.com");
});

test("audience array supports exact matches without accepting a similar prefix", async () => {
  for (const [aud, expected] of [[["other", COACH_RESOURCE], true], [[`${COACH_RESOURCE}/extra`], false]]) {
    let allowed = false;
    const res = response();
    await accessTokenGuard(COACH_RESOURCE, "coach", "/coach/mcp", async () => ({ aud, scopes: new Set(["coach"]), accountId: "executive@example.com" }))(
      { headers: { authorization: "Bearer synthetic" } }, res, () => { allowed = true; },
    );
    assert.equal(allowed, expected);
  }
});

test("existing users without explicit active coach mapping receive no principal", async () => {
  assert.equal(await resolveCoachPrincipal("executive@example.com", async () => ({ rows: [] })), null);
  assert.equal(await resolveCoachPrincipal(undefined, () => assert.fail("must not query")), null);
});

test("database-owned mapping supplies role/context and rejects invalid contexts", async () => {
  let parameters;
  const result = await resolveCoachPrincipal(" EXECUTIVE@example.com ", async (sql, params) => {
    assert.match(sql, /a.enabled = TRUE AND u.status = 'active'/);
    parameters = params;
    return { rows: [{ role: "executive", context_key: "pilot_a" }] };
  });
  assert.deepEqual(parameters, ["executive@example.com"]);
  assert.deepEqual(result, { id: "executive@example.com", role: "executive", contextKey: "pilot_a" });
  assert.equal(await resolveCoachPrincipal("executive@example.com", async () => ({ rows: [{ role: "admin", context_key: "../escape" }] })), null);
});
