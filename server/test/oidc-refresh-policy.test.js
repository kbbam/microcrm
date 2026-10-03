import test from 'node:test';
import assert from 'node:assert/strict';
process.env.COACH_ENABLED = '1';
const { shouldIssueRefreshToken, COACH_RESOURCE } = await import('../dist/oidc.js');
const client = { grantTypeAllowed: grant => grant === 'refresh_token', clientAuthMethod: 'none', applicationType: 'web' };
const code = { scopes: new Set(['coach']), resource: COACH_RESOURCE };
const ctx = { oidc: { entities: { Grant: { getResourceScopeFiltered: () => 'coach' } } } };
test('public web refresh requires exact human-consented resource and client refresh support', async () => {
  assert.equal(await shouldIssueRefreshToken(ctx, client, code), true);
  assert.equal(await shouldIssueRefreshToken(ctx, {...client,grantTypeAllowed:()=>false},code),false);
  assert.equal(await shouldIssueRefreshToken(ctx, {...client,clientAuthMethod:'client_secret_basic'},code),false);
  assert.equal(await shouldIssueRefreshToken(ctx, {...client,applicationType:'native'},code),false);
  assert.equal(await shouldIssueRefreshToken(ctx,client,{...code,resource:COACH_RESOURCE+'/wrong'}),false);
  assert.equal(await shouldIssueRefreshToken(ctx,client,{...code,scopes:new Set(['ungranted'])}),false);
  assert.equal(await shouldIssueRefreshToken({oidc:{entities:{}}},client,code),false);
  assert.equal(await shouldIssueRefreshToken({oidc:{entities:{Grant:{getResourceScopeFiltered:()=>''}}}},client,code),false);
});
