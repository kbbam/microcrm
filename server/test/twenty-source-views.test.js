import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTwentySourcePage } from '../dist/twenty-source-views.js';
const receipt = { email:'executive@example.test',workspaceId:'workspace',memberId:'member',userWorkspaceId:'userworkspace',verifiedAt:'2026-10-02T00:00:00Z',connectedAccounts:[{id:'connected',handle:'executive@example.test',provider:'google',authFailed:false}],messageChannels:[],calendarChannels:[],messageChannelIds:[],calendarChannelIds:[] };
const channel={id:'channel',handle:'executive@example.test',connectedAccountId:'connected',isSyncEnabled:true,syncedAt:null,syncStatus:'NOT_SYNCED',syncStage:'PENDING'};
const view = next => renderTwentySourcePage({kind:'status',twentyUrl:'https://workspace.twenty.com',receipt:{...receipt,...next}});

test('Twenty authorization does not claim email or calendar sync when absent or pending',()=>{
  const empty=view({});
  assert.match(empty,/Twenty account connected/);
  assert.match(empty,/Not connected/);
  assert.doesNotMatch(empty,/Your email and calendar sources are identified/);
  assert.match(empty,/Open Twenty account settings/);
  const pending=view({messageChannels:[channel],calendarChannels:[{...channel,id:'calendar'}]});
  assert.match(pending,/Waiting for sync to be observed/);
  assert.match(pending,/source sync has not yet been observed/);
  assert.match(pending,/This is a snapshot from Twenty, not confirmation/);
  assert.match(pending,/href="\/account\/twenty\/connect">Recheck connection/);
});

test('disabled, failed and observed-sync states prescribe the appropriate recovery',()=>{
  const disabled=view({messageChannels:[{...channel,isSyncEnabled:false}],calendarChannels:[channel]});
  assert.match(disabled,/Sync is turned off/);
  assert.match(disabled,/turn on the email and calendar sync/);
  const failed=view({connectedAccounts:[{...receipt.connectedAccounts[0],authFailed:true}],messageChannels:[channel],calendarChannels:[channel]});
  assert.match(failed,/Reconnect account in Twenty/);
  assert.match(failed,/reconnect the account that needs authorization/);
  const observed=view({messageChannels:[{...channel,syncedAt:'2026-10-02T00:00:00Z'}],calendarChannels:[{...channel,syncedAt:'2026-10-02T00:00:00Z'}]});
  assert.match(observed,/Your email and calendar sources are identified/);
  assert.match(observed,/not confirmation that every message or attachment/);
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
