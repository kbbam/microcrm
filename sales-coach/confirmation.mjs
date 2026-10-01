import { changeDigest } from './store.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });

// This module belongs to the authenticated browser host. It is deliberately
// absent from the MCP tool registry and accepts no authority from proposal URLs.
export async function reviewProposal(service, id) {
  let change;
  try { change = await service.store.change(id); }
  catch (error) { if (error.code === 'ENOENT') throw fail(404, 'This proposal was not found in your coach context.'); throw error; }
  await service.authorizeAccount(change.accountId, { createCompany: change.object === 'company' && !change.recordId });
  await service.sources(change.sourceIds ?? []);
  if (change.state !== 'awaiting-confirmation' && change.reviewedSnapshot) {
    const { accountTitle, previous, sources } = change.reviewedSnapshot;
    const review = { change, accountTitle, previous, sources };
    return { ...review, digest: changeDigest(review) };
  }
  const [account, sources] = await Promise.all([
    service.store.account(change.accountId), service.sources(change.sourceIds ?? []),
  ]);
  const previous = change.recordId ? account.crm?.[`${change.object}:${change.recordId}`] : null;
  const review = { change, accountTitle: account.title, sources, previous: previous ?? null };
  // Bind every displayed proposal/evidence/baseline field. Replacing evidence,
  // refreshing the baseline, or changing a risk label invalidates an old form.
  return { ...review, digest: changeDigest(review) };
}

export async function decideProposal(service, { id, digest, decision }) {
  if (!['approve', 'reject'].includes(decision)) throw fail(400, 'Choose Apply change or Reject change.');
  const review = await reviewProposal(service, id);
  if (review.change.state !== 'awaiting-confirmation') throw fail(409, 'This proposal already has a decision. Review its current status.');
  if (review.digest !== digest) throw fail(409, 'The proposal or its evidence changed. Review the updated details before deciding.');
  const { digest: reviewedDigest, accountTitle, previous, sources } = review;
  const reviewed = { ...review.change, reviewedSnapshot: { digest: reviewedDigest, accountTitle, previous, sources, recordId: review.change.recordId, reviewedBy: service.actor, reviewedAt: new Date().toISOString() } };
  if (decision === 'approve') {
    await service.store.putChange(reviewed);
    return service.confirm(id);
  }
  return service.store.putChange({ ...reviewed, state: 'rejected', rejectedBy: service.actor, rejectedAt: new Date().toISOString() });
}
