import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTwentySourcePage } from '../dist/twenty-source-views.js';
const receipt = { email:'executive@example.test',workspaceId:'workspace',memberId:'member',userWorkspaceId:'userworkspace',verifiedAt:'2026-10-02T00:00:00Z',connectedAccounts:[{id:'connected',handle:'executive@example.test',provider:'google',authFailed:false}],messageChannels:[],calendarChannels:[],messageChannelIds:[],calendarChannelIds:[] };
const channel={id:'channel',handle:'executive@example.test',connectedAccountId:'connected',isSyncEnabled:true,syncedAt:null,syncStatus:'NOT_SYNCED',syncStage:'PENDING'};
const view = next => renderTwentySourcePage({kind:'status',twentyUrl:'https://workspace.twenty.com',receipt:{...receipt,...next}});

test('Twenty authorization does not claim email or calendar sync when absent or pending',()=>{
  const empty=view({});
  assert.match(empty,/Twenty account verified/);
  assert.match(empty,/Not connected/);
  assert.doesNotMatch(empty,/Your email and calendar sources are identified/);
  assert.match(empty,/Open Twenty account settings/);
  const pending=view({messageChannels:[channel],calendarChannels:[{...channel,id:'calendar'}]});
  assert.match(pending,/Waiting for sync/);
  assert.match(pending,/Email and calendar have not reported a complete sync yet/);
  assert.match(pending,/does not confirm that every message or attachment/);
  assert.match(pending,/href="\/account\/twenty\/recheck">Recheck connection/);
});

test('disabled, failed and observed-sync states prescribe the appropriate recovery',()=>{
  const disabled=view({messageChannels:[{...channel,isSyncEnabled:false}],calendarChannels:[channel]});
  assert.match(disabled,/Sync off/);
  assert.match(disabled,/turn on the email and calendar sync/);
  const failed=view({connectedAccounts:[{...receipt.connectedAccounts[0],authFailed:true}],messageChannels:[channel],calendarChannels:[channel]});
  assert.match(failed,/This account needs authorization again in Twenty/);
  assert.match(failed,/reconnect the account that needs authorization/);
  const observed=view({messageChannels:[{...channel,syncedAt:'2026-10-02T00:00:00Z'}],calendarChannels:[{...channel,syncedAt:'2026-10-02T00:00:00Z'}]});
  assert.match(observed,/Your sources are connected/);
  assert.match(observed,/does not confirm that every message or attachment/);
  assert.doesNotMatch(observed,/fully synced|all messages imported/i);
});

test('source sign-in and failure presentation escape provider text and nonce',()=>{
  const login=renderTwentySourcePage({kind:'login',twentyUrl:'https://workspace.twenty.com',csrf:'"><script>',email:'<img>@example.test',error:'<script>error</script>'});
  assert.match(login,/action="\/account\/twenty\/login"/);
  assert.match(login,/&quot;&gt;&lt;script&gt;/);
  assert.doesNotMatch(login,/<script>|<img>/);
  const failure=renderTwentySourcePage({kind:'problem',twentyUrl:'https://workspace.twenty.com',error:'<script>private</script>'});
  assert.match(failure,/Try connecting again/);
  assert.doesNotMatch(failure,/<script>/);
  const unsafe=renderTwentySourcePage({kind:'status',twentyUrl:'javascript:alert(1)',receipt});
  assert.doesNotMatch(unsafe,/href="javascript:/);
});

// A reported email sync must not be erased by a calendar still awaiting its first sync.
test('mixed sources name only the pending calendar and retain the reported email timestamp',()=>{
  const mixed=view({messageChannels:[{...channel,syncedAt:'2026-10-02T02:56:00Z'}],calendarChannels:[{...channel,id:'calendar'}]});
  assert.match(mixed,/Calendar has not reported a sync yet/);
  assert.doesNotMatch(mixed,/Email and calendar have not reported/);
  assert.match(mixed,/Last sync reported: 2 Oct 2026, 02:56 UTC/);
  assert.match(mixed,/Last checked:/);
  assert.match(mixed,/datetime="2026-10-02T00:00:00Z"/);
  assert.match(mixed,/href="https:\/\/workspace.twenty.com\/settings\/accounts" target="_blank" rel="noopener noreferrer"/);
});


test('recheck failures offer retry or explicit reconnect and expired sign-in keeps the intended action',()=>{
  const outage=renderTwentySourcePage({kind:'problem',twentyUrl:'https://workspace.twenty.com',recovery:'recheck',error:'Try again shortly.'});
  assert.match(outage,/href="\/account\/twenty\/recheck">Recheck connection/);assert.doesNotMatch(outage,/href="\/account\/twenty\/connect"/);
  const revoked=renderTwentySourcePage({kind:'problem',twentyUrl:'https://workspace.twenty.com',recovery:'reconnect',error:'Reconnect.'});assert.match(revoked,/href="\/account\/twenty\/connect">Reconnect Twenty/);
  const login=renderTwentySourcePage({kind:'login',twentyUrl:'https://workspace.twenty.com',returnTo:'recheck',csrf:'test'});assert.match(login,/name="returnTo" value="recheck"/);assert.match(login,/Sign in and recheck/);
});
