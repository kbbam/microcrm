import { authPage, escapeHtml } from "./auth-page.js";
import type { TwentySourceView } from "./twenty-source-connection.js";

export function renderTwentySourcePage(view: TwentySourceView): string {
  const email = view.email ? `<p class="muted">Business OS account: <strong>${escapeHtml(view.email)}</strong></p>` : "";
  if (view.kind === "login") {
    return authPage("Connect email and calendar", `<p class="muted">Sign in to Business OS, then approve your Twenty account. This identifies the sources the coach can use.</p><form method="post" action="/account/twenty/login"><input type="hidden" name="csrf" value="${escapeHtml(view.csrf)}"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" autocapitalize="none" maxlength="254" value="${escapeHtml(view.email)}" required autofocus><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in and connect</button>${view.error ? `<p class="error" role="alert">${escapeHtml(view.error)}</p>` : ""}</form><p class="footer"><a href="/account/help">Need help signing in?</a> · <a href="/">Back to coach setup</a></p>`);
  }
  if (view.kind === "problem" || !view.receipt) {
    return authPage("Connection needs attention", `${email}<p role="alert">${escapeHtml(view.error || "We could not verify this connection. Sign in again with your Business OS and Twenty accounts.")}</p><a class="primary" href="/account/twenty/connect">Try connecting again</a><p class="footer"><a href="/">Back to coach setup</a></p>`);
  }
  const receipt = view.receipt;
  const accounts = receipt.connectedAccounts ?? [];
  const mail = receipt.messageChannels ?? [];
  const calendar = receipt.calendarChannels ?? [];
  const allChannels = [...mail, ...calendar];
  const failedAccounts = new Set(accounts.filter(account => account.authFailed).map(account => account.id));
  const reconnect = allChannels.some(channel => failedAccounts.has(channel.connectedAccountId));
  const disabled = allChannels.some(channel => channel.isSyncEnabled === false);
  const observed = (channels: typeof mail) => channels.filter(channel => channel.syncedAt && Number.isFinite(new Date(channel.syncedAt).getTime())).length;
  const summary = (channels: typeof mail): string => {
    if (!channels.length) return "Not connected";
    if (channels.some(channel => failedAccounts.has(channel.connectedAccountId))) return "Reconnect account in Twenty";
    if (channels.every(channel => channel.isSyncEnabled === false)) return "Sync is turned off";
    if (channels.some(channel => channel.isSyncEnabled === false)) return "Some sources have sync turned off";
    const count = observed(channels);
    if (count === channels.length) return channels.length === 1 ? "A sync has been observed" : `A sync has been observed for all ${channels.length} sources`;
    if (count) return `Sync observed for ${count} of ${channels.length} sources`;
    return "Waiting for sync to be observed";
  };
  const ready = mail.length > 0 && calendar.length > 0 && !reconnect && !disabled && observed(mail) === mail.length && observed(calendar) === calendar.length;
  let guidance = ready ? "Your email and calendar sources are identified. Return to Claude and ask the coach to check your latest messages and meetings." : reconnect ? "Open Twenty account settings and reconnect the account that needs authorization. Then recheck this connection." : disabled ? "Open Twenty account settings and turn on the email and calendar sync you want the coach to use. Then recheck this connection." : !mail.length || !calendar.length ? "Open Twenty account settings, connect your Google account and enable email and calendar sync. Then recheck this connection." : "Twenty access is connected, but source sync has not yet been observed. Let Twenty finish syncing, then recheck this connection.";
  let settings = "";
  try {
    const origin = new URL(view.twentyUrl ?? "");
    if (["http:", "https:"].includes(origin.protocol)) settings = new URL("/settings/accounts", origin.origin).href;
  } catch { /* A missing pinned URL leaves actionable text without an unsafe link. */ }
  const action = ready ? `<a class="primary" href="/">Back to coach setup</a>` : settings ? `<a class="primary" href="${escapeHtml(settings)}">Open Twenty account settings</a>` : "";
  return authPage("Twenty account connected", `<p class="muted">Verified account: <strong>${escapeHtml(receipt.email)}</strong></p><dl class="source-status"><div><dt>Email</dt><dd>${escapeHtml(summary(mail))}</dd></div><div><dt>Calendar</dt><dd>${escapeHtml(summary(calendar))}</dd></div></dl><p>${escapeHtml(guidance)}</p>${action}<a class="secondary-link" href="/account/twenty/connect">Recheck connection</a><p class="hint">This is a snapshot from Twenty, not confirmation that every message or attachment has been imported.</p>${ready ? "" : `<p class="footer"><a href="/">Back to coach setup</a></p>`}`);
}
