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
  const date = (value: string | null | undefined): string | null => {
    if (!value || !Number.isFinite(Date.parse(value))) return null;
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value)) + " UTC";
  };
  const summary = (channels: typeof mail): { label: string; tone: string; detail: string } => {
    if (!channels.length) return { label: "Not connected", tone: "waiting", detail: "Connect this source in Twenty to let the coach read it." };
    if (channels.some(channel => failedAccounts.has(channel.connectedAccountId))) return { label: "Reconnect", tone: "waiting", detail: "This account needs authorization again in Twenty." };
    if (channels.every(channel => channel.isSyncEnabled === false)) return { label: "Sync off", tone: "waiting", detail: "Turn on sync for this source in Twenty." };
    if (channels.some(channel => channel.isSyncEnabled === false)) return { label: "Partly enabled", tone: "waiting", detail: "Some sources have sync turned off. Enable them in Twenty." };
    const count = observed(channels);
    if (count === channels.length) {
      const times = channels.map(channel => Date.parse(channel.syncedAt!));
      const lastReported = date(new Date(Math.max(...times)).toISOString());
      return { label: "Sync reported", tone: "good", detail: `${channels.length > 1 ? `Sync reported for all ${channels.length} sources. ` : ""}Last sync reported: ${lastReported}.` };
    }
    if (count) return { label: "Partly synced", tone: "waiting", detail: `Twenty has reported a sync for ${count} of ${channels.length} sources. The remaining sources are still waiting.` };
    return { label: "Waiting for sync", tone: "waiting", detail: "Connected in Twenty. A first sync has not been reported yet." };
  };
  const mailStatus = summary(mail), calendarStatus = summary(calendar);
  const ready = mail.length > 0 && calendar.length > 0 && !reconnect && !disabled && observed(mail) === mail.length && observed(calendar) === calendar.length;
  const title = ready ? "Your sources are connected" : reconnect ? "Reconnect your source account" : disabled ? "Turn on source sync" : !mail.length || !calendar.length ? "Connect your email and calendar" : "Waiting for source sync";
  const waitingSources = [observed(mail) < mail.length ? "Email" : "", observed(calendar) < calendar.length ? "Calendar" : ""].filter(Boolean);
  const guidance = ready ? "Return to Claude and ask the coach to check your latest messages and meetings." : reconnect ? "Open Twenty account settings and reconnect the account that needs authorization. Then return here and recheck." : disabled ? "Open Twenty account settings and turn on the email and calendar sync you want the coach to use. Then return here and recheck." : !mail.length || !calendar.length ? "Open Twenty account settings, connect your Google account and enable email and calendar sync. Then return here and recheck." : waitingSources.length === 1 ? `${waitingSources[0]} has not reported a sync yet. Let Twenty finish syncing, then recheck here.` : "Email and calendar have not reported a complete sync yet. Let Twenty finish syncing, then recheck here.";
  const row = (name: string, status: ReturnType<typeof summary>) => `<div class="connection-source"><dt>${name}<span class="connection-badge ${status.tone}">${escapeHtml(status.label)}</span></dt><dd>${escapeHtml(status.detail)}</dd></div>`;
  let settings = "";
  try {
    const origin = new URL(view.twentyUrl ?? "");
    if (["http:", "https:"].includes(origin.protocol)) settings = new URL("/settings/accounts", origin.origin).href;
  } catch { /* A missing pinned URL leaves actionable text without an unsafe link. */ }
  const externalIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg>`;
  const needsSettings = reconnect || disabled || !mail.length || !calendar.length;
  const settingsLink = settings ? `<a class="${needsSettings ? "primary" : "secondary-link"}" href="${escapeHtml(settings)}" target="_blank" rel="noopener noreferrer" aria-label="Open Twenty account settings (opens in a new tab)">Open Twenty account settings${externalIcon}</a><p class="hint">Opens in a new tab. Return here to recheck.</p>` : "";
  const recheck = `<a class="${!ready && !needsSettings ? "primary" : "secondary-link"}" href="/account/twenty/connect">Recheck connection</a>`;
  const action = ready ? `<a class="primary" href="/">Back to coach setup</a>${recheck}${settingsLink}` : needsSettings ? `${settingsLink}${recheck}` : `${recheck}${settingsLink}`;
  const checked = date(receipt.verifiedAt);
  return authPage(title, `<div class="connection-identity"><span class="connection-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-8"/></svg></span><p><strong>Twenty account verified</strong><span>${escapeHtml(receipt.email)}</span></p></div><dl class="connection-sources" aria-label="Source sync status">${row("Email", mailStatus)}${row("Calendar", calendarStatus)}</dl><div class="connection-next"><h2>${ready ? "You can start using the coach" : "Next step"}</h2><p>${escapeHtml(guidance)}</p></div><div class="connection-actions">${action}</div>${checked ? `<small class="connection-check">Last checked: <time datetime="${escapeHtml(receipt.verifiedAt)}">${escapeHtml(checked)}</time></small>` : ""}<p class="connection-note">Twenty reports the sync status shown here. This does not confirm that every message or attachment has been imported.</p>${ready ? "" : `<p class="connection-back"><a href="/">Back to coach setup</a></p>`}`, { sourceStatus: true });
}
