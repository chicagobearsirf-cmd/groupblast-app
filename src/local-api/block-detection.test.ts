import assert from "node:assert/strict";
import {
  FACEBOOK_BLOCK_SIGNALS,
  detectFacebookBlockSignal,
  getBlockCooldownStatus,
  suspectedFacebookBlockSignal,
} from "./block-detection";

const examples: Record<string, string> = {
  cant_post_right_now: "You can't post right now. Try again later.",
  temporarily_blocked: "You're temporarily blocked from using this feature.",
  temporarily_restricted: "Your account is temporarily restricted.",
  going_too_fast: "It looks like you were misusing this feature by going too fast.",
  posting_too_often: "We limit how often you can post, comment or do other things.",
  try_again_later: "Something went wrong. Please try again later.",
  community_standards: "Your post goes against our Community Standards.",
};

for (const signal of FACEBOOK_BLOCK_SIGNALS) {
  const example = examples[signal.id];
  assert.ok(example, `Missing test example for ${signal.id}`);
  const result = detectFacebookBlockSignal(`<div role="dialog">${example}</div>`);
  assert.equal(result?.signal.id, signal.id);
}

assert.equal(detectFacebookBlockSignal("Your post was shared successfully."), null);
assert.equal(suspectedFacebookBlockSignal(2), null);
assert.equal(suspectedFacebookBlockSignal(3)?.signal.id, "suspected_repeated_failures");

const now = new Date("2026-07-02T12:00:00.000Z");
assert.deepEqual(getBlockCooldownStatus("2026-07-03T12:00:00.000Z", "Blocked", now), {
  until: "2026-07-03T12:00:00.000Z",
  reason: "Blocked",
});
assert.equal(getBlockCooldownStatus("2026-07-02T11:59:00.000Z", "Blocked", now), null);
assert.equal(getBlockCooldownStatus("not-a-date", "Blocked", now), null);
assert.equal(getBlockCooldownStatus(null, "Blocked", now), null);

console.log("block-detection tests passed");
